/**
 * localCache.ts 单元测试
 *
 * 覆盖本地缓存的读写、结构校验、向后兼容与备份记录管理
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackupRecord, BookmarkInfo, SyncData, Tombstone } from './models';
import { BACKUP_STORAGE_KEYS } from './constants';

// ---------- 内存版 storage.local（模拟真实存储语义） ----------
const storageMap = new Map<string, unknown>();

const storageLocal = {
  get: vi.fn(async (keys: string | string[]) => {
    const list = Array.isArray(keys) ? keys : [keys];
    const out: Record<string, unknown> = {};
    for (const key of list) {
      if (storageMap.has(key)) out[key] = structuredClone(storageMap.get(key));
    }
    return out;
  }),
  set: vi.fn(async (items: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(items)) storageMap.set(key, structuredClone(value));
  }),
  remove: vi.fn(async (keys: string | string[]) => {
    const list = Array.isArray(keys) ? keys : [keys];
    for (const key of list) storageMap.delete(key);
  }),
};

// @ts-expect-error test browser stub
globalThis.browser = { storage: { local: storageLocal } };

const {
  getLocalCache,
  saveLocalCache,
  createEmptyLocalCache,
  clearLocalCache,
  validateSyncData,
  validateBackupRecords,
  sortBackupRecords,
  getBackupRecords,
  getBackupByTimestamp,
  deleteBackupRecord,
  restoreFromBackup,
} = await import('./localCache');

// ---------- 测试数据工厂 ----------
function makeBookmark(title: string, url?: string, children?: BookmarkInfo[]): BookmarkInfo {
  return { title, ...(url ? { url } : {}), ...(children ? { children } : {}) };
}

function makeRecord(timestamp: number, bookmarkData: BookmarkInfo[]): BackupRecord {
  return { backupTimestamp: timestamp, bookmarkData, bookmarkCount: bookmarkData.length };
}

function makeCache(overrides: Partial<SyncData> = {}): SyncData {
  return {
    version: '2.0',
    lastSyncTimestamp: 1700000000000,
    sourceBrowser: { browser: 'Chrome', os: 'Windows' },
    backupRecords: [makeRecord(1700000000000, [makeBookmark('A', 'https://a.example.com')])],
    tombstones: [],
    ...overrides,
  };
}

function putCache(cache: unknown): void {
  storageMap.set(BACKUP_STORAGE_KEYS.LOCAL_CACHE_KEY, cache);
}

const CACHE_KEY = BACKUP_STORAGE_KEYS.LOCAL_CACHE_KEY;

beforeEach(() => {
  storageMap.clear();
  vi.clearAllMocks();
});

describe('getLocalCache', () => {
  it('returns null when storage is empty', async () => {
    await expect(getLocalCache()).resolves.toBeNull();
  });

  it('returns the cached SyncData when valid', async () => {
    const cache = makeCache();
    putCache(cache);
    const result = await getLocalCache();
    expect(result).not.toBeNull();
    expect(result!.version).toBe('2.0');
    expect(result!.lastSyncTimestamp).toBe(cache.lastSyncTimestamp);
    expect(result!.sourceBrowser).toEqual({ browser: 'Chrome', os: 'Windows' });
    expect(result!.backupRecords).toHaveLength(1);
  });

  it('returns null for invalid cache data (missing lastSyncTimestamp)', async () => {
    putCache({ version: '2.0', sourceBrowser: { browser: 'Chrome', os: 'Windows' }, backupRecords: [] });
    await expect(getLocalCache()).resolves.toBeNull();
  });

  it('returns null for invalid cache data (backupRecords not array)', async () => {
    putCache({
      version: '2.0',
      lastSyncTimestamp: 1,
      sourceBrowser: { browser: 'Chrome', os: 'Windows' },
      backupRecords: 'nope',
    });
    await expect(getLocalCache()).resolves.toBeNull();
  });

  it('returns null when backup records are in ascending order (invalid)', async () => {
    const cache = makeCache({
      backupRecords: [makeRecord(100, []), makeRecord(200, [])],
    });
    putCache(cache);
    await expect(getLocalCache()).resolves.toBeNull();
  });

  it('returns null when storage.get rejects', async () => {
    storageLocal.get.mockRejectedValueOnce(new Error('storage failure'));
    await expect(getLocalCache()).resolves.toBeNull();
  });

  it('adds empty tombstones array for legacy caches (backward compatibility)', async () => {
    const legacy = makeCache() as Partial<SyncData>;
    delete legacy.tombstones;
    putCache(legacy);
    const result = await getLocalCache();
    expect(result).not.toBeNull();
    expect(result!.tombstones).toEqual([]);
  });

  it('preserves existing tombstones', async () => {
    const tombstones: Tombstone[] = [
      { id: 'bm_deleted', deletedAt: 123, deletedBy: 'Chrome/Windows' },
    ];
    putCache(makeCache({ tombstones }));
    const result = await getLocalCache();
    expect(result!.tombstones).toEqual(tombstones);
  });

  it('normalizes backupRecords wrapped in a virtual root node (id "0")', async () => {
    const innerTree = [makeBookmark('书签栏', undefined, [makeBookmark('A', 'https://a.example.com')])];
    const cache = makeCache({
      backupRecords: [makeRecord(1700000000000, [{ id: '0', title: '', children: innerTree } as BookmarkInfo])],
    });
    putCache(cache);
    const result = await getLocalCache();
    expect(result!.backupRecords[0].bookmarkData).toEqual(innerTree);
  });

  it('normalizes backupRecords wrapped in a synthetic root node (folder_0)', async () => {
    const innerTree = [makeBookmark('B', 'https://b.example.com')];
    const cache = makeCache({
      backupRecords: [makeRecord(1700000000000, [{ id: 'folder_0', title: '', children: innerTree } as BookmarkInfo])],
    });
    putCache(cache);
    const result = await getLocalCache();
    expect(result!.backupRecords[0].bookmarkData).toEqual(innerTree);
  });

  it('leaves already-normalized (stripped-root) records untouched', async () => {
    const stripped = [makeBookmark('书签栏', undefined, [makeBookmark('A', 'https://a.example.com')])];
    putCache(makeCache({ backupRecords: [makeRecord(1, stripped)] }));
    const result = await getLocalCache();
    expect(result!.backupRecords[0].bookmarkData).toEqual(stripped);
  });
});

describe('saveLocalCache / createEmptyLocalCache', () => {
  it('createEmptyLocalCache returns a well-formed empty SyncData', () => {
    const empty = createEmptyLocalCache();
    expect(empty).toEqual({
      version: '2.0',
      lastSyncTimestamp: 0,
      sourceBrowser: { browser: 'Unknown', os: 'Unknown' },
      backupRecords: [],
      tombstones: [],
    });
  });

  it('saveLocalCache persists data to storage.local', async () => {
    const cache = makeCache();
    await saveLocalCache(cache);
    expect(storageMap.has(CACHE_KEY)).toBe(true);
    const stored = storageMap.get(CACHE_KEY) as SyncData;
    expect(stored.version).toBe('2.0');
    // 读回验证往返一致
    await expect(getLocalCache()).resolves.toEqual(cache);
  });

  it('saveLocalCache throws when storage.set rejects', async () => {
    storageLocal.set.mockRejectedValueOnce(new Error('quota exceeded'));
    await expect(saveLocalCache(makeCache())).rejects.toThrow('quota exceeded');
  });
});

describe('clearLocalCache', () => {
  it('removes the cache entry from storage', async () => {
    putCache(makeCache());
    await clearLocalCache();
    expect(storageMap.has(CACHE_KEY)).toBe(false);
    await expect(getLocalCache()).resolves.toBeNull();
  });

  it('does not throw when storage.remove rejects', async () => {
    putCache(makeCache());
    storageLocal.remove.mockRejectedValueOnce(new Error('io error'));
    await expect(clearLocalCache()).resolves.toBeUndefined();
  });
});

describe('validateBackupRecords', () => {
  it('returns true for empty arrays', () => {
    expect(validateBackupRecords([])).toBe(true);
  });

  it('returns true for single record', () => {
    expect(validateBackupRecords([makeRecord(100, [])])).toBe(true);
  });

  it('returns true for strictly descending timestamps', () => {
    expect(validateBackupRecords([makeRecord(300, []), makeRecord(200, []), makeRecord(100, [])])).toBe(true);
  });

  it('returns true for equal timestamps (non-strict descending allowed)', () => {
    // 设备间时钟偏差会产生同时间戳记录，不应判为无效（P1-2）
    expect(validateBackupRecords([makeRecord(200, []), makeRecord(200, []), makeRecord(100, [])])).toBe(true);
  });

  it('returns false for ascending timestamps', () => {
    expect(validateBackupRecords([makeRecord(100, []), makeRecord(200, [])])).toBe(false);
  });

  it('returns false when any adjacent pair ascends', () => {
    expect(validateBackupRecords([makeRecord(300, []), makeRecord(200, []), makeRecord(400, [])])).toBe(false);
  });
});

describe('sortBackupRecords', () => {
  it('sorts records by timestamp descending', () => {
    const sorted = sortBackupRecords([makeRecord(100, []), makeRecord(300, []), makeRecord(200, [])]);
    expect(sorted.map(r => r.backupTimestamp)).toEqual([300, 200, 100]);
  });

  it('does not modify the input array', () => {
    const input = [makeRecord(100, []), makeRecord(300, []), makeRecord(200, [])];
    const snapshot = input.map(r => r.backupTimestamp);
    const sorted = sortBackupRecords(input);
    expect(sorted).not.toBe(input);
    // 入参顺序保持不变
    expect(input.map(r => r.backupTimestamp)).toEqual(snapshot);
    expect(input[0].backupTimestamp).toBe(100);
  });
});

describe('validateSyncData', () => {
  it('returns true for valid SyncData', () => {
    expect(validateSyncData(makeCache())).toBe(true);
  });

  it('returns false for null / undefined', () => {
    expect(validateSyncData(null as unknown as SyncData)).toBe(false);
    expect(validateSyncData(undefined as unknown as SyncData)).toBe(false);
  });

  it('returns false when version is not a string', () => {
    expect(validateSyncData(makeCache({ version: 2 as unknown as string }))).toBe(false);
  });

  it('returns false when lastSyncTimestamp is not a number', () => {
    expect(validateSyncData(makeCache({ lastSyncTimestamp: 'x' as unknown as number }))).toBe(false);
  });

  it('returns false when sourceBrowser is missing', () => {
    expect(validateSyncData(makeCache({ sourceBrowser: undefined as unknown as SyncData['sourceBrowser'] }))).toBe(false);
  });

  it('returns false when sourceBrowser.browser is not a string', () => {
    expect(validateSyncData(makeCache({ sourceBrowser: { browser: 1 as unknown as string, os: 'Windows' } }))).toBe(false);
  });

  it('returns false when backupRecords is not an array', () => {
    expect(validateSyncData(makeCache({ backupRecords: null as unknown as BackupRecord[] }))).toBe(false);
  });

  it('returns false when tombstones is not an array', () => {
    expect(validateSyncData(makeCache({ tombstones: 'x' as unknown as Tombstone[] }))).toBe(false);
  });

  it('returns false when backup records are not descending', () => {
    expect(validateSyncData(makeCache({ backupRecords: [makeRecord(1, []), makeRecord(2, [])] }))).toBe(false);
  });

  it('allows missing tombstones (backward compatibility)', () => {
    const cache = makeCache();
    delete (cache as Partial<SyncData>).tombstones;
    expect(validateSyncData(cache)).toBe(true);
  });
});

describe('getBackupRecords / getBackupByTimestamp', () => {
  it('returns backup records from cache', async () => {
    const records = [makeRecord(300, [makeBookmark('A', 'https://a.example.com')]), makeRecord(200, [])];
    putCache(makeCache({ backupRecords: records }));
    await expect(getBackupRecords()).resolves.toEqual(records);
  });

  it('returns empty array when no cache exists', async () => {
    await expect(getBackupRecords()).resolves.toEqual([]);
  });

  it('getBackupByTimestamp finds the matching record', async () => {
    const target = makeRecord(200, [makeBookmark('B', 'https://b.example.com')]);
    putCache(makeCache({ backupRecords: [makeRecord(300, []), target] }));
    await expect(getBackupByTimestamp(200)).resolves.toEqual(target);
  });

  it('getBackupByTimestamp returns null when not found', async () => {
    putCache(makeCache({ backupRecords: [makeRecord(300, [])] }));
    await expect(getBackupByTimestamp(999)).resolves.toBeNull();
  });
});

describe('deleteBackupRecord', () => {
  it('deletes the record with matching timestamp and saves the cache', async () => {
    putCache(makeCache({
      backupRecords: [makeRecord(300, []), makeRecord(200, []), makeRecord(100, [])],
    }));
    await expect(deleteBackupRecord(200)).resolves.toBe(true);
    const remaining = (storageMap.get(CACHE_KEY) as SyncData).backupRecords;
    expect(remaining.map(r => r.backupTimestamp)).toEqual([300, 100]);
  });

  it('returns false when the timestamp does not exist (cache untouched)', async () => {
    const cache = makeCache({ backupRecords: [makeRecord(300, [])] });
    putCache(cache);
    await expect(deleteBackupRecord(999)).resolves.toBe(false);
    // 缓存未被改写
    expect(storageMap.get(CACHE_KEY)).toEqual(cache);
  });

  it('returns false when no cache exists', async () => {
    await expect(deleteBackupRecord(123)).resolves.toBe(false);
  });

  it('returns false when storage operations fail', async () => {
    putCache(makeCache());
    storageLocal.get.mockRejectedValueOnce(new Error('storage failure'));
    await expect(deleteBackupRecord(makeCache().backupRecords[0].backupTimestamp)).resolves.toBe(false);
  });

  it('returns false when saving the updated cache fails', async () => {
    putCache(makeCache({
      backupRecords: [makeRecord(300, []), makeRecord(200, [])],
    }));
    storageLocal.set.mockRejectedValueOnce(new Error('io error'));
    await expect(deleteBackupRecord(200)).resolves.toBe(false);
  });
});

describe('restoreFromBackup', () => {
  it('returns bookmark data for an existing backup', async () => {
    const data = [makeBookmark('A', 'https://a.example.com'), makeBookmark('B', 'https://b.example.com')];
    putCache(makeCache({ backupRecords: [makeRecord(300, data)] }));
    await expect(restoreFromBackup(300)).resolves.toEqual(data);
  });

  it('returns null when the backup does not exist', async () => {
    putCache(makeCache({ backupRecords: [makeRecord(300, [])] }));
    await expect(restoreFromBackup(123)).resolves.toBeNull();
  });

  it('returns null when no cache exists', async () => {
    await expect(restoreFromBackup(123)).resolves.toBeNull();
  });
});
