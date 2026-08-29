import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./services', () => ({
  default: {
    get: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('./webdav', () => ({
  webdavRead: vi.fn(),
  webdavWrite: vi.fn(),
}));

vi.mock('./bookmarkUtils', () => ({
  formatBookmarks: vi.fn((bookmarks: Array<unknown>) => bookmarks),
  getBookmarkCount: vi.fn((bookmarks: Array<unknown> | undefined) => bookmarks?.length ?? 0),
}));

vi.mock('./browserInfo', () => ({
  getBrowserInfo: vi.fn(() => ({
    browser: 'Chrome',
    os: 'Windows',
  })),
}));

const BookmarkService = (await import('./services')).default;
const { webdavRead, webdavWrite } = await import('./webdav');

describe('manualSyncTransfer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uploads manual bookmarks through WebDAV when that storage type is selected', async () => {
    const { uploadManualBookmarks } = await import('./manualSyncTransfer');

    vi.mocked(webdavWrite).mockResolvedValue(true);

    await uploadManualBookmarks(
      {
        enableNotify: false,
        gistFileName: 'BookmarkHub',
        gistID: '',
        githubToken: '',
        storageType: 'webdav',
        webdavPassword: 'dav-pass',
        webdavPath: '/bookmarkhub-bookmarks.json',
        webdavUrl: 'https://example.com/dav',
        webdavUsername: 'dav-user',
      } as never,
      [{ id: 'bookmark-1', title: 'Bookmark 1' }]
    );

    expect(webdavWrite).toHaveBeenCalledTimes(1);
    expect(BookmarkService.update).not.toHaveBeenCalled();
  });

  it('throws when WebDAV reports a failed upload', async () => {
    const { uploadManualBookmarks } = await import('./manualSyncTransfer');

    vi.mocked(webdavWrite).mockResolvedValue(false);

    await expect(
      uploadManualBookmarks(
        {
          enableNotify: false,
          gistFileName: 'BookmarkHub',
          gistID: '',
          githubToken: '',
          storageType: 'webdav',
          webdavPassword: 'dav-pass',
          webdavPath: '/bookmarkhub-bookmarks.json',
          webdavUrl: 'https://example.com/dav',
          webdavUsername: 'dav-user',
        } as never,
        [{ id: 'bookmark-1', title: 'Bookmark 1' }]
      )
    ).rejects.toThrow('WebDAV upload failed');
  });

  it('downloads remote bookmarks through WebDAV and parses v2 payloads', async () => {
    const { downloadManualBookmarks } = await import('./manualSyncTransfer');

    vi.mocked(webdavRead).mockResolvedValue(JSON.stringify({
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

    expect(webdavRead).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ id: 'bookmark-1', title: 'Bookmark 1' }]);
  });
});
