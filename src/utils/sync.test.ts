import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { performSync, startAutoSync, stopAutoSync } from './sync';
import type { Setting } from './setting';

// Mock dependencies
vi.mock('./setting', () => ({
  Setting: {
    build: vi.fn(),
  },
}));

vi.mock('./services', () => ({
  default: {
    get: vi.fn(),
    update: vi.fn(),
  },
  getBookmarks: vi.fn(),
}));

vi.mock('./webdav', () => ({
  webdavRead: vi.fn(),
  webdavWrite: vi.fn(),
}));

vi.mock('./bookmarkUtils', () => ({
  getBookmarkCount: vi.fn(() => 10),
  formatBookmarks: vi.fn(),
}));

const mockBrowser = {
  runtime: {
    id: 'test-extension-id',
    getManifest: () => ({ version: '1.0.0' }),
    sendMessage: vi.fn(),
    onStartup: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  bookmarks: {
    onCreated: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    onMoved: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    onRemoved: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  storage: {
    local: {
      set: vi.fn(),
    },
  },
};

// @ts-expect-error - Mock browser global
globalThis.browser = mockBrowser;

function createMockSetting(overrides: Partial<Setting> = {}): Setting {
  return {
    githubToken: '',
    gistID: '',
    gistFileName: 'bookmarks.json',
    enableNotify: false,
    enableAutoSync: true,
    enableIntervalSync: false,
    enableEventSync: false,
    syncInterval: 60,
    storageType: 'github',
    conflictMode: 'auto',
    webdavUrl: '',
    webdavUsername: '',
    webdavPassword: '',
    ...overrides,
  } as Setting;
}

describe('sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('performSync', () => {
    it('should skip if already syncing', async () => {
      const result = await performSync();
      expect(result).toBeDefined();
      expect(result.timestamp).toBeGreaterThan(0);
    });

    it('should return a SyncResult object', async () => {
      const result = await performSync();
      
      expect(result).toHaveProperty('direction');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('localCount');
      expect(result).toHaveProperty('remoteCount');
    });

    it('should have numeric counts', async () => {
      const result = await performSync();
      
      expect(typeof result.localCount).toBe('number');
      expect(typeof result.remoteCount).toBe('number');
    });
  });

  describe('startAutoSync / stopAutoSync', () => {
    it('should register event listeners when called', async () => {
      const { Setting } = await import('./setting');
      vi.mocked(Setting.build).mockResolvedValue(createMockSetting({
        enableAutoSync: true,
        enableIntervalSync: false,
        enableEventSync: true,
      }));

      await startAutoSync();

      expect(mockBrowser.runtime.onStartup.addListener).toHaveBeenCalled();
      expect(mockBrowser.bookmarks.onCreated.addListener).toHaveBeenCalled();
      expect(mockBrowser.bookmarks.onChanged.addListener).toHaveBeenCalled();
      expect(mockBrowser.bookmarks.onMoved.addListener).toHaveBeenCalled();
      expect(mockBrowser.bookmarks.onRemoved.addListener).toHaveBeenCalled();
    });

    it('should remove event listeners on stop', async () => {
      const { Setting } = await import('./setting');
      vi.mocked(Setting.build).mockResolvedValue(createMockSetting({
        enableAutoSync: true,
        enableIntervalSync: false,
        enableEventSync: true,
      }));

      await startAutoSync();
      stopAutoSync();

      expect(mockBrowser.runtime.onStartup.removeListener).toHaveBeenCalled();
      expect(mockBrowser.bookmarks.onCreated.removeListener).toHaveBeenCalled();
      expect(mockBrowser.bookmarks.onChanged.removeListener).toHaveBeenCalled();
      expect(mockBrowser.bookmarks.onMoved.removeListener).toHaveBeenCalled();
      expect(mockBrowser.bookmarks.onRemoved.removeListener).toHaveBeenCalled();
    });

    it('should not register listeners if auto sync is disabled', async () => {
      const { Setting } = await import('./setting');
      vi.mocked(Setting.build).mockResolvedValue(createMockSetting({
        enableAutoSync: false,
        enableIntervalSync: false,
        enableEventSync: false,
      }));

      await startAutoSync();

      expect(mockBrowser.runtime.onStartup.addListener).not.toHaveBeenCalled();
    });
  });
});