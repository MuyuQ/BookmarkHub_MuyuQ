/**
 * setting.ts 单元测试
 *
 * 覆盖 Setting.build() 的类型化取值行为与 15 秒缓存：
 * - 正常值透传
 * - 缺失字段 / 类型不符字段取默认值
 * - syncInterval 非法回退 60
 * - storageType / conflictMode 非法回退默认
 * - webdavPath 缺省回退 WEBDAV_DEFAULTS.PATH
 * - 15 秒内重复 build 返回缓存实例
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// 隔离 optionsStorage（webext-options-sync 依赖浏览器扩展环境）与 browserInfo
vi.mock('./optionsStorage', () => ({
  getAllDecrypted: vi.fn(),
  setEncrypted: vi.fn(),
  default: {
    getAll: vi.fn(),
    set: vi.fn(),
    // 捕获注册的变更回调，便于验证"设置变更 → 清除缓存"链路
    // （模块加载时注册一次，数组内容跨用例保留，不在 beforeEach 中清空）
    onChanged: vi.fn((cb: () => void) => {
      mockChangeListeners.push(cb);
    }),
  },
}));

vi.mock('./browserInfo', () => ({
  getBrowserInfo: vi.fn(() => ({ browser: 'Chrome', os: 'Windows' })),
}));

const mockChangeListeners: Array<() => void> = [];

const { getAllDecrypted } = await import('./optionsStorage');
const { Setting } = await import('./setting');
const { WEBDAV_DEFAULTS } = await import('./constants');

const getAllDecryptedMock = vi.mocked(getAllDecrypted);

beforeEach(() => {
  vi.clearAllMocks();
  Setting.clearCache();
});

describe('Setting.build', () => {
  it('passes through typed values from storage', async () => {
    getAllDecryptedMock.mockResolvedValueOnce({
      githubToken: 'ghp_test_token',
      gistID: 'abc123',
      gistFileName: 'MyBookmarks',
      enableNotify: true,
      enableAutoSync: true,
      enableIntervalSync: true,
      enableEventSync: true,
      syncInterval: 720,
      conflictMode: 'prompt',
      storageType: 'webdav',
      webdavUrl: 'https://dav.example.com',
      webdavUsername: 'user',
      webdavPassword: 'pass',
      webdavPath: '/custom/path.json',
      masterPassword: 'secret',
    });

    const setting = await Setting.build();

    expect(setting.githubToken).toBe('ghp_test_token');
    expect(setting.gistID).toBe('abc123');
    expect(setting.gistFileName).toBe('MyBookmarks');
    expect(setting.enableNotify).toBe(true);
    expect(setting.enableAutoSync).toBe(true);
    expect(setting.enableIntervalSync).toBe(true);
    expect(setting.enableEventSync).toBe(true);
    expect(setting.syncInterval).toBe(720);
    expect(setting.conflictMode).toBe('prompt');
    expect(setting.storageType).toBe('webdav');
    expect(setting.webdavUrl).toBe('https://dav.example.com');
    expect(setting.webdavUsername).toBe('user');
    expect(setting.webdavPassword).toBe('pass');
    expect(setting.webdavPath).toBe('/custom/path.json');
    expect(setting.masterPassword).toBe('secret');
  });

  it('falls back to safe defaults for missing fields', async () => {
    getAllDecryptedMock.mockResolvedValueOnce({});

    const setting = await Setting.build();

    expect(setting.githubToken).toBe('');
    expect(setting.gistID).toBe('');
    expect(setting.gistFileName).toBe('');
    // bool() 只接受精确的 true
    expect(setting.enableNotify).toBe(false);
    expect(setting.enableAutoSync).toBe(false);
    expect(setting.enableIntervalSync).toBe(false);
    expect(setting.enableEventSync).toBe(false);
    expect(setting.syncInterval).toBe(60);
    expect(setting.conflictMode).toBe('auto');
    expect(setting.storageType).toBe('github');
    expect(setting.webdavUrl).toBe('');
    expect(setting.webdavUsername).toBe('');
    expect(setting.webdavPassword).toBe('');
    expect(setting.masterPassword).toBe('');
  });

  it('falls back to empty string for wrong-typed scalar values', async () => {
    getAllDecryptedMock.mockResolvedValueOnce({
      githubToken: 12345,
      gistID: { id: 'x' },
      enableNotify: 'yes',
      enableAutoSync: 1,
    });

    const setting = await Setting.build();

    expect(setting.githubToken).toBe('');
    expect(setting.gistID).toBe('');
    expect(setting.enableNotify).toBe(false);
    expect(setting.enableAutoSync).toBe(false);
  });

  it('falls back to 60 when syncInterval is not a finite number', async () => {
    for (const invalid of ['abc', null, NaN, Infinity, -Infinity, '720']) {
      Setting.clearCache();
      getAllDecryptedMock.mockResolvedValueOnce({ syncInterval: invalid });
      const setting = await Setting.build();
      expect(setting.syncInterval).toBe(60);
    }
  });

  it('accepts any finite number for syncInterval', async () => {
    getAllDecryptedMock.mockResolvedValueOnce({ syncInterval: 0 });
    const setting = await Setting.build();
    expect(setting.syncInterval).toBe(0);
  });

  it('falls back to "auto" for invalid conflictMode values', async () => {
    for (const invalid of ['manual', 'AUTO', 123, null, undefined]) {
      Setting.clearCache();
      getAllDecryptedMock.mockResolvedValueOnce({ conflictMode: invalid });
      const setting = await Setting.build();
      expect(setting.conflictMode).toBe('auto');
    }
  });

  it('accepts "prompt" for conflictMode', async () => {
    getAllDecryptedMock.mockResolvedValueOnce({ conflictMode: 'prompt' });
    const setting = await Setting.build();
    expect(setting.conflictMode).toBe('prompt');
  });

  it('falls back to "github" for invalid storageType values', async () => {
    for (const invalid of ['dropbox', 'GITHUB', 42, null, undefined]) {
      Setting.clearCache();
      getAllDecryptedMock.mockResolvedValueOnce({ storageType: invalid });
      const setting = await Setting.build();
      expect(setting.storageType).toBe('github');
    }
  });

  it('accepts "webdav" for storageType', async () => {
    getAllDecryptedMock.mockResolvedValueOnce({ storageType: 'webdav' });
    const setting = await Setting.build();
    expect(setting.storageType).toBe('webdav');
  });

  it('falls back to WEBDAV_DEFAULTS.PATH when webdavPath is missing or empty', async () => {
    getAllDecryptedMock.mockResolvedValueOnce({});
    const setting = await Setting.build();
    expect(setting.webdavPath).toBe(WEBDAV_DEFAULTS.PATH);

    Setting.clearCache();
    getAllDecryptedMock.mockResolvedValueOnce({ webdavPath: '' });
    const setting2 = await Setting.build();
    expect(setting2.webdavPath).toBe(WEBDAV_DEFAULTS.PATH);
    expect(WEBDAV_DEFAULTS.PATH).toBe('/bookmarkhub-bookmarks.json');
  });

  it('returns the cached instance for repeated builds within 15 seconds', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      getAllDecryptedMock.mockResolvedValue({ githubToken: 'token-1' });

      const first = await Setting.build();
      expect(getAllDecryptedMock).toHaveBeenCalledTimes(1);

      // 缓存有效期内：不再读取存储，返回同一实例
      vi.advanceTimersByTime(14_999);
      const second = await Setting.build();
      expect(second).toBe(first);
      expect(getAllDecryptedMock).toHaveBeenCalledTimes(1);

      // 超过 15 秒缓存失效：重新读取
      vi.advanceTimersByTime(1);
      const third = await Setting.build();
      expect(third).not.toBe(first);
      expect(getAllDecryptedMock).toHaveBeenCalledTimes(2);
      expect(third.githubToken).toBe('token-1');
    } finally {
      vi.useRealTimers();
    }
  });

  it('registers a storage change listener that clears the cache', async () => {
    getAllDecryptedMock.mockResolvedValue({ githubToken: 'token-1' });

    // 模块加载时注册过回调
    expect(mockChangeListeners.length).toBeGreaterThanOrEqual(1);

    await Setting.build();
    expect(getAllDecryptedMock).toHaveBeenCalledTimes(1);

    // 模拟设置变更 → 清除缓存 → 下次 build 重新读取
    for (const listener of mockChangeListeners) listener();
    await Setting.build();
    expect(getAllDecryptedMock).toHaveBeenCalledTimes(2);
  });
});
