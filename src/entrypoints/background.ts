import BookmarkService from '../utils/services'
import { Setting } from '../utils/setting'
import { startAutoSync, stopAutoSync, performSync, getIsSyncing } from '../utils/sync'
import optionsStorage from '../utils/optionsStorage'
import iconLogo from '../assets/icon.png'
import { OperType, BookmarkInfo, SyncDataInfo, RootBookmarksType, BrowserType } from '../utils/models'
import { Bookmarks } from 'wxt/browser'
import { getBookmarkCount, formatBookmarks, normalizeBookmarkIds } from '../utils/bookmarkUtils'
import { createError, handleError } from '../utils/errors'
import { logger } from '../utils/logger'
import { ROOT_NODE_IDS, ROOT_FOLDER_NAMES, STORAGE_KEYS } from '../utils/constants'
import { getBackupRecords, restoreFromBackup, deleteBackupRecord, getLocalCache, saveLocalCache, createEmptyLocalCache } from '../utils/localCache'
import { getBrowserInfo } from '../utils/browserInfo'
import { Tombstone } from '../utils/models'

export default defineBackground(() => {

  optionsStorage.onChanged((newOptions, oldOptions) => {
    if (newOptions.enableAutoSync !== oldOptions.enableAutoSync ||
        newOptions.enableEventSync !== oldOptions.enableEventSync ||
        newOptions.enableIntervalSync !== oldOptions.enableIntervalSync) {
      stopAutoSync();
      if (newOptions.enableAutoSync) {
        startAutoSync();
      }
    }
  });

  browser.runtime.onInstalled.addListener(async () => {
    const setting = await Setting.build();
    if (setting.enableAutoSync) {
      startAutoSync();
    }
  });

  browser.runtime.onStartup.addListener(async () => {
    const setting = await Setting.build();
    if (setting.enableAutoSync) {
      startAutoSync();
    }
  });

  /**
   * P1-9: Validate message sender to prevent cross-extension attacks
   */
  function isValidSender(sender: chrome.runtime.MessageSender): boolean {
    return !sender.id || sender.id === browser.runtime.id;
  }

  /**
   * 操作锁 - 防止多个异步消息处理程序交错执行
   * 使用 Promise 队列确保操作顺序执行
   */
  let operationQueue: Promise<void> = Promise.resolve();
  
  /**
   * 当前操作类型
   * 用于书签事件监听器判断是否需要响应
   */
  let curOperType = OperType.NONE;
  let curBrowserType = BrowserType.CHROME;
  
/**
    * 在操作队列中添加操作，确保顺序执行
    * @param operation - 要执行的操作函数
    * @returns 操作结果的 Promise
    */
  function queueOperation<T>(operation: () => Promise<T>): Promise<T> {
    let resolveFunc: (result: T) => void;
    let rejectFunc: (error: unknown) => void;
    
    const resultPromise = new Promise<T>((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });
    
    operationQueue = operationQueue.then(async () => {
      try {
        const result = await operation();
        resolveFunc(result);
      } catch (error) {
        rejectFunc(error);
      }
    }).catch((error) => {
      // P1-10: Log error but don't block queue continuation
      logger.error('Operation queue error', error);
      rejectFunc(error); // 必须传播错误，否则调用方会无限等待
    });
    
    return resultPromise;
  }
  
  browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // P1-9: Validate sender
    if (!isValidSender(sender)) {
      logger.warn('Rejected message from unknown sender', { senderId: sender.id });
      return false;
    }
    
    if (msg.name === 'upload') {
      queueOperation(async () => {
        curOperType = OperType.SYNC;
        try {
          await uploadBookmarks();
        } finally {
          curOperType = OperType.NONE;
          browser.action.setBadgeText({ text: "" });
          refreshLocalCount();
          sendResponse(true);
        }
      });
      return true;
    }
    if (msg.name === 'download') {
      queueOperation(async () => {
        // 检查是否正在同步
        if (getIsSyncing()) {
          sendResponse({ 
            error: 'Sync is already in progress. Please wait.',
            status: 'skipped'
          });
          return;
        }
        curOperType = OperType.SYNC;
        try {
          await downloadBookmarks();
          sendResponse(true);
        } catch (error) {
          sendResponse({ error: handleError(error).message });
        } finally {
          curOperType = OperType.NONE;
          browser.action.setBadgeText({ text: "" });
          refreshLocalCount();
        }
      });
      return true;
    }
    if (msg.name === 'removeAll') {
      queueOperation(async () => {
        curOperType = OperType.REMOVE;
        try {
          await clearBookmarkTree();
          sendResponse(true);
        } finally {
          curOperType = OperType.NONE;
          browser.action.setBadgeText({ text: "" });
          refreshLocalCount();
        }
      });
      return true;
    }
    if (msg.name === 'setting') {
      browser.runtime.openOptionsPage().then(() => {
        sendResponse(true);
      });
      return true;
    }
    if (msg.name === 'sync') {
      // performSync 内部已有 isSyncing 检查
      performSync().then(result => {
        sendResponse(result);
      });
      return true;
    }
    if (msg.name === 'getBackupRecords') {
      getBackupRecords().then(records => {
        sendResponse(records);
      });
      return true;
    }
    if (msg.name === 'restoreFromBackup') {
      queueOperation(async () => {
        curOperType = OperType.SYNC;
        try {
          const bookmarks = await restoreFromBackup(msg.timestamp);
          if (!bookmarks) {
            sendResponse({ error: 'Backup not found' });
            return;
          }
          await clearBookmarkTree();
          await createBookmarkTree(bookmarks);
          refreshLocalCount();
          sendResponse({ success: true, count: getBookmarkCount(bookmarks) });
        } catch (error) {
          sendResponse({ error: handleError(error).message });
        } finally {
          curOperType = OperType.NONE;
          browser.action.setBadgeText({ text: "" });
        }
      });
      return true;
    }
    if (msg.name === 'deleteBackupRecord') {
      deleteBackupRecord(msg.timestamp).then(success => {
        sendResponse({ success });
      });
      return true;
    }
    return false;
  });
  browser.bookmarks.onCreated.addListener((id, info) => {
    if (curOperType === OperType.NONE) {
      browser.action.setBadgeText({ text: "!" });
      browser.action.setBadgeBackgroundColor({ color: "#F00" });
      refreshLocalCount();
    }
  });
  browser.bookmarks.onChanged.addListener((id, info) => {
    if (curOperType === OperType.NONE) {
      browser.action.setBadgeText({ text: "!" });
      browser.action.setBadgeBackgroundColor({ color: "#F00" });
    }
  })
  browser.bookmarks.onMoved.addListener((id, info) => {
    if (curOperType === OperType.NONE) {
      browser.action.setBadgeText({ text: "!" });
      browser.action.setBadgeBackgroundColor({ color: "#F00" });
    }
  })
  browser.bookmarks.onRemoved.addListener((id, info) => {
    if (curOperType === OperType.NONE) {
      // 创建墓碑记录，防止删除的书签被"复活"
      createTombstoneForBookmark(id, info).catch(err => {
        logger.error('onRemoved: Failed to create tombstone', { id, error: err });
      });
      browser.action.setBadgeText({ text: "!" });
      browser.action.setBadgeBackgroundColor({ color: "#F00" });
      refreshLocalCount();
    }
  })

  /**
   * 为被删除的书签创建墓碑记录
   * 墓碑用于防止已删除的书签在其他设备同步时被"复活"
   *
   * @param bookmarkId - 被删除书签的 ID
   * @param removeInfo - 删除信息（包含节点信息）
   */
  async function createTombstoneForBookmark(
    bookmarkId: string,
    removeInfo: Bookmarks.OnRemovedRemoveInfoType
  ): Promise<void> {
    try {
      // 获取或初始化本地缓存
      let cache = await getLocalCache();
      if (!cache) {
        cache = createEmptyLocalCache();
      }

      // 确保墓碑数组存在
      if (!cache.tombstones) {
        cache.tombstones = [];
      }

      // 获取设备标识
      const browserInfo = getBrowserInfo();
      const deviceIdentifier = `${browserInfo.browser}/${browserInfo.os}`;

      // 创建墓碑记录
      const tombstone: Tombstone = {
        id: bookmarkId,
        deletedAt: Date.now(),
        deletedBy: deviceIdentifier
      };

      // 检查是否已存在相同 ID 的墓碑（避免重复）
      const existingIndex = cache.tombstones.findIndex(t => t.id === bookmarkId);
      if (existingIndex >= 0) {
        // 更新已存在的墓碑
        cache.tombstones[existingIndex] = tombstone;
        logger.debug('createTombstoneForBookmark: Updated existing tombstone', { bookmarkId });
      } else {
        // 添加新墓碑
        cache.tombstones.push(tombstone);
        logger.debug('createTombstoneForBookmark: Created tombstone', { bookmarkId, deviceIdentifier });
      }

      // 保存更新后的缓存
      await saveLocalCache(cache);
      logger.info('createTombstoneForBookmark: Tombstone saved', { bookmarkId, deviceIdentifier });
    } catch (error) {
      logger.error('createTombstoneForBookmark: Failed to save tombstone', { bookmarkId, error });
    }
  }

  async function uploadBookmarks() {
    try {
      const setting = await Setting.build();
      
      if (!setting.githubToken) {
        throw createError.authTokenMissing();
      }
      if (!setting.gistID) {
        throw createError.gistIdMissing();
      }
      if (!setting.gistFileName) {
        throw createError.fileNameMissing();
      }
      
      const bookmarks = await getBookmarks();
      const syncdata = createSyncData(bookmarks);
      
      await BookmarkService.update({
        files: {
          [setting.gistFileName]: {
            content: JSON.stringify(syncdata)
          }
        },
        description: setting.gistFileName
      });
      
      const count = getBookmarkCount(syncdata.bookmarks);
      await browser.storage.local.set({ [STORAGE_KEYS.REMOTE_COUNT]: count, [STORAGE_KEYS.LOCAL_COUNT]: count });
      
      notifyRefreshCounts();
      
      if (setting.enableNotify) {
        await showSuccessNotification('uploadBookmarks');
      }
    }
    catch (error: unknown) {
      const err = handleError(error);
      console.error(err.toLogString());
      await showErrorNotification('uploadBookmarks', err.toUserString());
    }
  }
  
  function createSyncData(bookmarks: BookmarkInfo[]): SyncDataInfo {
    const syncdata = new SyncDataInfo();
    syncdata.version = browser.runtime.getManifest().version;
    syncdata.createDate = Date.now();
    syncdata.bookmarks = formatBookmarks(bookmarks);
    syncdata.browser = navigator.userAgent;
    return syncdata;
  }
  
  async function notifyRefreshCounts(): Promise<void> {
    try {
      await browser.runtime.sendMessage({ name: 'refreshCounts' });
    } catch {
      // popup 可能未打开，忽略错误
    }
  }
  
  async function showSuccessNotification(titleKey: 'uploadBookmarks' | 'downloadBookmarks'): Promise<void> {
    await browser.notifications.create({
      type: "basic",
      iconUrl: iconLogo,
      title: browser.i18n.getMessage(titleKey),
      message: browser.i18n.getMessage('success')
    });
  }
  
  async function showErrorNotification(titleKey: 'uploadBookmarks' | 'downloadBookmarks', errorMessage: string): Promise<void> {
    await browser.notifications.create({
      type: "basic",
      iconUrl: iconLogo,
      title: browser.i18n.getMessage(titleKey),
      message: `${browser.i18n.getMessage('error')}：${errorMessage}`
    });
  }
  async function downloadBookmarks() {
    try {
      const setting = await Setting.build();
      const gist = await BookmarkService.get();
      
      if (!gist) {
        throw createError.fileNotFound(setting.gistFileName);
      }
      
      const data = JSON.parse(gist);
      let bookmarks: BookmarkInfo[];

      // 检测数据版本，兼容 v1.0 和 v2.0 格式
      if (data.version === '2.0') {
        logger.info('downloadBookmarks: 检测到格式 v2.0');
        if (!data.backupRecords || data.backupRecords.length === 0) {
          throw createError.emptyGistFile(setting.gistFileName);
        }
        bookmarks = data.backupRecords[0].bookmarkData;
      } else if (data.bookmarks) {
        logger.info('downloadBookmarks: 检测到格式 v1.0（旧格式）');
        bookmarks = data.bookmarks;
      } else {
        throw createError.invalidDataFormat();
      }
      
      if (!bookmarks || bookmarks.length === 0) {
        throw createError.emptyGistFile(setting.gistFileName);
      }
      
      await clearBookmarkTree();
      normalizeFolderNames(bookmarks);
      await createBookmarkTree(bookmarks);
      
      const count = getBookmarkCount(bookmarks);
      await browser.storage.local.set({ [STORAGE_KEYS.REMOTE_COUNT]: count, [STORAGE_KEYS.LOCAL_COUNT]: count });
      
      notifyRefreshCounts();
      
      if (setting.enableNotify) {
        await showSuccessNotification('downloadBookmarks');
      }
    }
    catch (error: unknown) {
      const err = handleError(error);
      console.error(err.toLogString());
      await showErrorNotification('downloadBookmarks', err.toUserString());
    }
  }

  function normalizeFolderNames(bookmarks: BookmarkInfo[] | undefined) {
    if (!bookmarks) return;
    for (const node of bookmarks) {
      if (ROOT_FOLDER_NAMES.TOOLBAR.includes(node.title as any)) {
        node.title = RootBookmarksType.ToolbarFolder;
      } else if (ROOT_FOLDER_NAMES.MENU.includes(node.title as any)) {
        node.title = RootBookmarksType.MenuFolder;
      } else if (ROOT_FOLDER_NAMES.UNFILED.includes(node.title as any)) {
        node.title = RootBookmarksType.UnfiledFolder;
      } else if (ROOT_FOLDER_NAMES.MOBILE.includes(node.title as any)) {
        node.title = RootBookmarksType.MobileFolder;
      }
      if (node.children) {
        normalizeFolderNames(node.children);
      }
    }
  }

  async function getBookmarks() {
    let bookmarkTree: BookmarkInfo[] = await browser.bookmarks.getTree();
    if (bookmarkTree && bookmarkTree[0].id === ROOT_NODE_IDS.ROOT[1]) {
      curBrowserType = BrowserType.FIREFOX;
    }
    else {
      curBrowserType = BrowserType.CHROME;
    }
    return bookmarkTree;
  }

async function clearBookmarkTree() {
    try {
      let setting = await Setting.build()
      if (setting.githubToken == '') {
        throw createError.authTokenMissing();
      }
      if (setting.gistID == '') {
        throw createError.gistIdMissing();
      }
      if (setting.gistFileName == '') {
        throw createError.fileNameMissing();
      }

      let bookmarks = await getBookmarks();

      function isRootFolderId(id: string): boolean {
        return ROOT_NODE_IDS.ROOT.includes(id as any) ||
               ROOT_NODE_IDS.TOOLBAR.includes(id as any) ||
               ROOT_NODE_IDS.UNFILED.includes(id as any) ||
               ROOT_NODE_IDS.MOBILE.includes(id as any) ||
               ROOT_NODE_IDS.MENU.includes(id as any);
      }

      function collectAllNodes(nodes: BookmarkInfo[]): BookmarkInfo[] {
        let result: BookmarkInfo[] = [];
        for (const node of nodes) {
          if (node.id && !ROOT_NODE_IDS.ROOT.includes(node.id as any) && !isRootFolderId(node.id)) {
            result.push(node);
          }
          if (node.children) {
            result = result.concat(collectAllNodes(node.children));
          }
        }
        return result;
      }

      const allNodes = collectAllNodes(bookmarks);
      logger.debug('clearBookmarkTree: Total nodes to delete', allNodes.length);

      let deletedCount = 0;
      let failedCount = 0;
      for (const node of allNodes) {
        try {
          if (node.id) {
            await browser.bookmarks.removeTree(node.id);
            deletedCount++;
          }
        } catch (err) {
          failedCount++;
          logger.warn('Failed to delete bookmark', { id: node.id, title: node.title });
        }
      }
      logger.info(`clearBookmarkTree completed: ${deletedCount} deleted, ${failedCount} failed`);

      if (curOperType === OperType.REMOVE && setting.enableNotify) {
        await browser.notifications.create({
          type: "basic",
          iconUrl: iconLogo,
          title: browser.i18n.getMessage('removeAllBookmarks'),
          message: browser.i18n.getMessage('success')
        });
      }
    }
    catch (error: unknown) {
      const err = handleError(error);
      logger.error(err.toLogString());
      await browser.notifications.create({
        type: "basic",
        iconUrl: iconLogo,
        title: browser.i18n.getMessage('removeAllBookmarks'),
        message: `${browser.i18n.getMessage('error')}：${err.toUserString()}`
      });
    }
  }

async function createBookmarkTree(bookmarkList: BookmarkInfo[] | undefined, parentId: string = ROOT_NODE_IDS.ROOT[0]) {
    if (bookmarkList == null) {
      return;
    }

    logger.debug('createBookmarkTree: Browser type', curBrowserType);

    for (let i = 0; i < bookmarkList.length; i++) {
      let node = bookmarkList[i];
      logger.debug('Processing bookmark', { title: node.title, parentId: node.parentId });

      // 处理根文件夹类型
      if (node.title == RootBookmarksType.MenuFolder
        || node.title == RootBookmarksType.MobileFolder
        || node.title == RootBookmarksType.ToolbarFolder
        || node.title == RootBookmarksType.UnfiledFolder) {
        let targetParentId: string = ROOT_NODE_IDS.UNFILED[0];
        if (curBrowserType == BrowserType.FIREFOX) {
          switch (node.title) {
            case RootBookmarksType.MenuFolder:
              targetParentId = ROOT_NODE_IDS.MENU[0];
              break;
            case RootBookmarksType.MobileFolder:
              targetParentId = ROOT_NODE_IDS.MOBILE[0];
              break;
            case RootBookmarksType.ToolbarFolder:
              targetParentId = ROOT_NODE_IDS.TOOLBAR[0];
              break;
            case RootBookmarksType.UnfiledFolder:
              targetParentId = ROOT_NODE_IDS.UNFILED[0];
              break;
          }
        } else {
          switch (node.title) {
            case RootBookmarksType.MobileFolder:
              targetParentId = ROOT_NODE_IDS.MOBILE[0];
              break;
            case RootBookmarksType.ToolbarFolder:
              targetParentId = ROOT_NODE_IDS.TOOLBAR[0];
              break;
            case RootBookmarksType.UnfiledFolder:
            case RootBookmarksType.MenuFolder:
              targetParentId = ROOT_NODE_IDS.UNFILED[0];
              break;
          }
        }
        node.children?.forEach(c => c.parentId = targetParentId);
        await createBookmarkTree(node.children, targetParentId);
        continue;
      }

      // 确定 parentId
      let actualParentId = node.parentId || parentId;
      if (!actualParentId || actualParentId === ROOT_NODE_IDS.ROOT[0]) {
        actualParentId = curBrowserType == BrowserType.FIREFOX ? ROOT_NODE_IDS.UNFILED[1] : ROOT_NODE_IDS.UNFILED[0];
      }

      // 创建书签/文件夹
      let res: Bookmarks.BookmarkTreeNode = { id: '', title: '' };
      try {
        res = await browser.bookmarks.create({
          parentId: actualParentId,
          title: node.title,
          url: node.url
        });
        logger.debug('Created bookmark', { title: node.title, id: res.id });
      } catch (err) {
        logger.error('Failed to create bookmark', { title: node.title, error: err });
      }

      // 递归处理子节点
      if (res.id && node.children && node.children.length > 0) {
        node.children.forEach(c => c.parentId = res.id);
        await createBookmarkTree(node.children, res.id);
      }
    }
  }

async function refreshLocalCount() {
    let bookmarkList = await getBookmarks();
    const count = getBookmarkCount(bookmarkList);
    await browser.storage.local.set({ [STORAGE_KEYS.LOCAL_COUNT]: count });
  }


});