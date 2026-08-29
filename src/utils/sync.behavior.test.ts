import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./setting', () => ({
  Setting: {
    build: vi.fn(),
  },
}));

vi.mock('./services', () => ({
  default: {
    update: vi.fn(),
  },
}));

vi.mock('./webdav', () => ({
  webdavWrite: vi.fn(),
}));

vi.mock('./bookmarkUtils', () => ({
  getBookmarkCount: vi.fn((bookmarks: Array<unknown> | undefined) => bookmarks?.length ?? 0),
  formatBookmarks: vi.fn((bookmarks: Array<unknown>) => bookmarks),
  normalizeBookmarkIds: vi.fn(),
}));

vi.mock('./logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  logSync: {
    start: vi.fn(),
    success: vi.fn(),
    failed: vi.fn(),
    skipped: vi.fn(),
  },
}));

vi.mock('./merge', () => ({
  threeWayMerge: vi.fn(),
}));

vi.mock('./localCache', () => ({
  getLocalCache: vi.fn(),
  saveLocalCache: vi.fn(),
}));

vi.mock('./debounce', () => ({
  syncDebouncer: {
    cancel: vi.fn(),
    setSyncCallback: vi.fn(),
    triggerSync: vi.fn(),
    updateConfig: vi.fn(),
  },
}));

vi.mock('./sync/dataFetcher', () => ({
  fetchRemoteData: vi.fn(),
  extractBookmarksFromData: vi.fn(),
  isSyncData: vi.fn(),
  isSyncDataInfo: vi.fn(),
}));

const mockBrowser = {
  runtime: {
    sendMessage: vi.fn().mockResolvedValue(undefined),
    onStartup: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  alarms: {
    clear: vi.fn().mockResolvedValue(true),
    create: vi.fn(),
  },
  bookmarks: {
    getTree: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: '11', title: '' }),
    removeTree: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue({}),
    move: vi.fn().mockResolvedValue({}),
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
      get: vi.fn().mockResolvedValue({}),
      remove: vi.fn().mockResolvedValue(undefined),
      set: vi.fn().mockResolvedValue(undefined),
    },
  },
};

// @ts-expect-error test browser stub
globalThis.browser = mockBrowser;

const { Setting } = await import('./setting');
const { webdavWrite } = await import('./webdav');
const { threeWayMerge } = await import('./merge');
const { getLocalCache, saveLocalCache } = await import('./localCache');
const dataFetcher = await import('./sync/dataFetcher');
const { performSync } = await import('./sync');

describe('performSync behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mockBrowser.storage.local.get).mockResolvedValue({});
    vi.mocked(mockBrowser.storage.local.set).mockResolvedValue(undefined);
    vi.mocked(mockBrowser.storage.local.remove).mockResolvedValue(undefined);
    vi.mocked(mockBrowser.runtime.sendMessage).mockResolvedValue(undefined);
    vi.mocked(Setting.build).mockResolvedValue({
      conflictMode: 'auto',
      enableAutoSync: true,
      enableNotify: false,
      gistFileName: 'BookmarkHub',
      gistID: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
      githubToken: 'token',
      storageType: 'github',
      syncInterval: 60,
      webdavPassword: 'dav-pass',
      webdavPath: '/bookmarkhub-bookmarks.json',
      webdavUrl: 'https://example.com/dav',
      webdavUsername: 'dav-user',
    } as never);
    mockBrowser.bookmarks.getTree.mockResolvedValue([
      { id: '0', title: '', children: [{ id: '1', title: 'Bookmarks Bar', children: [{ id: '10', title: 'Bookmark 1', url: 'https://example.com' }] }] },
    ]);
    vi.mocked(dataFetcher.fetchRemoteData).mockResolvedValue(null);
    vi.mocked(dataFetcher.extractBookmarksFromData).mockReturnValue(undefined);
    vi.mocked(dataFetcher.isSyncData).mockReturnValue(false);
    vi.mocked(getLocalCache).mockResolvedValue(null);
    vi.mocked(saveLocalCache).mockResolvedValue(undefined);
    vi.mocked(threeWayMerge).mockReturnValue({
      changeSummary: '无变更',
      conflicts: [],
      hasChanges: false,
      merged: [{ id: 'bookmark-1', title: 'Bookmark 1' }],
      tombstones: [],
    } as never);
    vi.mocked(webdavWrite).mockResolvedValue(true);
  });

  it('persists an active sync state before work and clears it afterwards', async () => {
    await performSync();

    const syncStateWrites = vi
      .mocked(mockBrowser.storage.local.set)
      .mock.calls
      .map(([payload]) => payload)
      .filter((payload) => Object.prototype.hasOwnProperty.call(payload, 'syncState'));

    expect(syncStateWrites[0]).toEqual({
      syncState: expect.objectContaining({
        isSuppressingEvents: true,
        isSyncing: true,
      }),
    });
    expect(mockBrowser.storage.local.remove).toHaveBeenCalledWith('syncState');
  });

  it('fails the sync when a WebDAV upload reports false', async () => {
    vi.mocked(Setting.build).mockResolvedValue({
      conflictMode: 'auto',
      enableAutoSync: true,
      enableNotify: false,
      gistFileName: 'BookmarkHub',
      gistID: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
      githubToken: 'token',
      storageType: 'webdav',
      syncInterval: 60,
      webdavPassword: 'dav-pass',
      webdavPath: '/bookmarkhub-bookmarks.json',
      webdavUrl: 'https://example.com/dav',
      webdavUsername: 'dav-user',
    } as never);
    vi.mocked(threeWayMerge).mockReturnValue({
      changeSummary: '本地新增 1 个',
      conflicts: [],
      hasChanges: true,
      merged: [{ id: 'bookmark-1', title: 'Bookmark 1' }],
      tombstones: [],
    } as never);
    vi.mocked(webdavWrite).mockResolvedValue(false);

    const result = await performSync();

    expect(result.status).toBe('failed');
    expect(result.errorMessage).toBeTruthy();
  });
});
