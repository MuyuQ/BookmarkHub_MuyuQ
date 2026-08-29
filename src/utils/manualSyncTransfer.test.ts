import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookmarkInfo, SyncData } from './models';
import { generateStableId } from './bookmarkUtils';

// uploadSnapshot（统一上传路径）与本地缓存由 sync.ts / localCache.ts 提供，单独 mock
vi.mock('./sync', () => ({
  uploadSnapshot: vi.fn(),
}));

vi.mock('./sync/dataFetcher', () => ({
  fetchRemoteData: vi.fn(),
  isSyncData: vi.fn((data: unknown) => !!data && typeof data === 'object' && (data as { version?: string }).version === '2.0'),
}));

vi.mock('./localCache', () => ({
  getLocalCache: vi.fn(),
  saveLocalCache: vi.fn(),
}));

vi.mock('./sync/storageProvider', () => ({
  getStorageProvider: vi.fn(),
}));

vi.mock('./merge', () => ({
  // 模拟真实语义：同 id 保留最新
  mergeTombstones: vi.fn((local: Array<{ id: string; deletedAt: number }>, remote: Array<{ id: string; deletedAt: number }>) => {
    const map = new Map<string, { id: string; deletedAt: number }>();
    for (const t of [...local, ...remote]) {
      const existing = map.get(t.id);
      if (!existing || t.deletedAt > existing.deletedAt) map.set(t.id, t);
    }
    return Array.from(map.values());
  }),
}));

vi.mock('./webdav', () => ({
  webdavRead: vi.fn(),
  webdavWrite: vi.fn(),
}));

vi.mock('./services', () => ({
  default: {
    get: vi.fn(),
    update: vi.fn(),
  },
}));

const { uploadSnapshot } = await import('./sync');
const { fetchRemoteData } = await import('./sync/dataFetcher');
const { getLocalCache, saveLocalCache } = await import('./localCache');
const { getStorageProvider } = await import('./sync/storageProvider');

function mockProviderRead(content: string | null) {
  vi.mocked(getStorageProvider).mockReturnValue({
    read: vi.fn().mockResolvedValue(content),
    write: vi.fn().mockResolvedValue(undefined),
  });
}

const davSetting = {
  enableNotify: false,
  gistFileName: 'BookmarkHub',
  gistID: '',
  githubToken: '',
  storageType: 'webdav',
  webdavPassword: 'dav-pass',
  webdavPath: '/bookmarkhub-bookmarks.json',
  webdavUrl: 'https://example.com/dav',
  webdavUsername: 'dav-user',
} as never;

function makeSyncData(bookmarkData: BookmarkInfo[], tombstones: Array<{ id: string; deletedAt: number; deletedBy: string }>): SyncData {
  return {
    version: '2.0',
    lastSyncTimestamp: Date.now(),
    sourceBrowser: { browser: 'Chrome', os: 'Windows' },
    backupRecords: [{ backupTimestamp: Date.now(), bookmarkCount: bookmarkData.length, bookmarkData }],
    tombstones,
  };
}

describe('manualSyncTransfer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLocalCache).mockResolvedValue(null);
    vi.mocked(saveLocalCache).mockResolvedValue(undefined);
    vi.mocked(fetchRemoteData).mockResolvedValue(null);
    mockProviderRead(null);
  });

  it('uploads through the unified snapshot path and preserves remote backup history & tombstones', async () => {
    const { uploadManualBookmarks } = await import('./manualSyncTransfer');

    const remoteData = makeSyncData(
      [{ id: 'bm_old', title: 'Old', url: 'https://old.example.com' }],
      [{ id: 'bm_deleted-remote', deletedAt: Date.now(), deletedBy: 'remote-device' }]
    );
    vi.mocked(fetchRemoteData).mockResolvedValue(remoteData);
    vi.mocked(getLocalCache).mockResolvedValue({
      ...makeSyncData([], []),
      tombstones: [{ id: 'bm_deleted-local', deletedAt: Date.now(), deletedBy: 'local-device' }],
    });
    vi.mocked(uploadSnapshot).mockResolvedValue(remoteData);

    await uploadManualBookmarks(davSetting, [
      { id: 'bm_a', title: 'A', url: 'https://a.example.com' },
    ]);

    // 上传走的统一路径，墓碑 = 本地 ∪ 远程
    expect(uploadSnapshot).toHaveBeenCalledTimes(1);
    const [uploadedBookmarks, uploadedTombstones] = vi.mocked(uploadSnapshot).mock.calls[0];
    expect(uploadedBookmarks).toEqual([
      expect.objectContaining({ title: 'A', url: 'https://a.example.com' })
    ]);
    expect(uploadedTombstones).toEqual([
      expect.objectContaining({ id: 'bm_deleted-local' }),
      expect.objectContaining({ id: 'bm_deleted-remote' }),
    ]);

    // 上传后更新本地基线缓存，避免下次自动同步重复上传
    expect(saveLocalCache).toHaveBeenCalledTimes(1);
  });

  it('filters tombstoned bookmarks out of the manual upload payload', async () => {
    const { uploadManualBookmarks } = await import('./manualSyncTransfer');

    // 墓碑使用稳定 ID（与合并层一致），此处按 URL 哈希动态生成
    const deletedUrl = 'https://b.example.com';
    const deletedStableId = generateStableId({ title: 'Deleted Elsewhere', url: deletedUrl } as BookmarkInfo);
    const remoteData = makeSyncData([], [{ id: deletedStableId, deletedAt: Date.now(), deletedBy: 'other-device' }]);
    vi.mocked(fetchRemoteData).mockResolvedValue(remoteData);
    vi.mocked(uploadSnapshot).mockResolvedValue(remoteData);

    await uploadManualBookmarks(davSetting, [
      { id: 'bm_a', title: 'A', url: 'https://a.example.com' },
      { id: 'browser-id-2', title: 'Deleted Elsewhere', url: deletedUrl },
    ]);

    // 在其他设备删除的书签（墓碑）不会被本次手动上传"复活"
    expect(vi.mocked(uploadSnapshot).mock.calls[0][0]).toEqual([
      expect.objectContaining({ title: 'A', url: 'https://a.example.com' }),
    ]);
  });

  it('does not save a local baseline when the upload fails', async () => {
    const { uploadManualBookmarks } = await import('./manualSyncTransfer');

    vi.mocked(uploadSnapshot).mockRejectedValue(new Error('WebDAV upload failed'));

    await expect(
      uploadManualBookmarks(davSetting, [{ id: 'bm_a', title: 'A', url: 'https://a.example.com' }])
    ).rejects.toThrow('WebDAV upload failed');

    expect(saveLocalCache).not.toHaveBeenCalled();
  });

  it('downloads remote bookmarks through WebDAV and parses v2 payloads', async () => {
    const { downloadManualBookmarks } = await import('./manualSyncTransfer');

    mockProviderRead(JSON.stringify({
      backupRecords: [
        {
          backupTimestamp: Date.now(),
          bookmarkCount: 1,
          bookmarkData: [{ id: 'bookmark-1', title: 'Bookmark 1' }],
        },
      ],
      lastSyncTimestamp: Date.now(),
      sourceBrowser: { browser: 'Chrome', os: 'Windows' },
      tombstones: [],
      version: '2.0',
    }));

    const result = await downloadManualBookmarks({
      gistFileName: 'BookmarkHub',
      storageType: 'webdav',
      webdavPath: '/bookmarkhub-bookmarks.json',
    } as never);

    expect(getStorageProvider).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ id: 'bookmark-1', title: 'Bookmark 1' }]);
  });

  it('throws a parse error instead of a raw SyntaxError when remote data is corrupted', async () => {
    const { downloadManualBookmarks } = await import('./manualSyncTransfer');

    mockProviderRead('not-json{{{');

    await expect(
      downloadManualBookmarks({ gistFileName: 'BookmarkHub', storageType: 'webdav', webdavPath: '/x.json' } as never)
    ).rejects.toThrow();
  });
});
