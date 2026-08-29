import type { Setting } from './setting';
import type { BookmarkInfo, SyncData } from './models';
import BookmarkService from './services';
import { formatBookmarks, getBookmarkCount } from './bookmarkUtils';
import { webdavRead, webdavWrite } from './webdav';
import { getBrowserInfo } from './browserInfo';
import { createError } from './errors';

function createManualSyncData(bookmarks: BookmarkInfo[]): SyncData {
  return {
    version: '2.0',
    lastSyncTimestamp: Date.now(),
    sourceBrowser: getBrowserInfo(),
    backupRecords: [
      {
        backupTimestamp: Date.now(),
        bookmarkCount: getBookmarkCount(bookmarks),
        bookmarkData: formatBookmarks(bookmarks) || [],
      },
    ],
    tombstones: [],
  };
}

export async function uploadManualBookmarks(setting: Setting, bookmarks: BookmarkInfo[]): Promise<SyncData> {
  const syncData = createManualSyncData(bookmarks);
  const content = JSON.stringify(syncData);

  if (setting.storageType === 'webdav') {
    const writeSucceeded = await webdavWrite(content);
    if (!writeSucceeded) {
      throw createError.networkError('WebDAV upload failed');
    }
    return syncData;
  }

  if (!setting.githubToken) {
    throw createError.authTokenMissing();
  }
  if (!setting.gistID) {
    throw createError.gistIdMissing();
  }
  if (!setting.gistFileName) {
    throw createError.fileNameMissing();
  }

  await BookmarkService.update({
    files: {
      [setting.gistFileName]: {
        content,
      },
    },
    description: setting.gistFileName,
  });

  return syncData;
}

export async function downloadManualBookmarks(setting: Setting): Promise<BookmarkInfo[]> {
  const content = setting.storageType === 'webdav'
    ? await webdavRead()
    : await BookmarkService.get();

  if (!content) {
    const remoteName = setting.storageType === 'webdav' ? setting.webdavPath : setting.gistFileName;
    throw createError.fileNotFound(remoteName, setting.storageType);
  }

  const data = JSON.parse(content);

  if (data.version === '2.0') {
    const bookmarks = data.backupRecords?.[0]?.bookmarkData;
    if (!bookmarks || bookmarks.length === 0) {
      throw createError.emptyGistFile(setting.gistFileName);
    }
    return bookmarks;
  }

  if (Array.isArray(data.bookmarks) && data.bookmarks.length > 0) {
    return data.bookmarks;
  }

  throw createError.invalidDataFormat();
}
