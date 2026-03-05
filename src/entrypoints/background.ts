import BookmarkService from '../utils/services'
import { Setting } from '../utils/setting'
import { startAutoSync, stopAutoSync, performSync } from '../utils/sync'
import iconLogo from '../assets/icon.png'
import { OperType, BookmarkInfo, SyncDataInfo, RootBookmarksType, BrowserType } from '../utils/models'
import { Bookmarks } from 'wxt/browser'
import { getBookmarkCount, formatBookmarks as formatBookmarkTree } from '../utils/bookmarkUtils'
export default defineBackground(() => {

  browser.runtime.onInstalled.addListener(async c => {
    const setting = await Setting.build();
    if (setting.enableAutoSync) {
      startAutoSync();
    }
  });

  // 浏览器每次启动时调用（解决重启后自动同步失效的问题）
  browser.runtime.onStartup.addListener(async () => {
    const setting = await Setting.build();
    if (setting.enableAutoSync) {
      startAutoSync();
    }
  });

  let curOperType = OperType.NONE;
  let curBrowserType = BrowserType.CHROME;
  browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.name === 'upload') {
      curOperType = OperType.SYNC
      uploadBookmarks().then(() => {
        curOperType = OperType.NONE
        browser.action.setBadgeText({ text: "" });
        refreshLocalCount();
        sendResponse(true);
      });
    }
    if (msg.name === 'download') {
      curOperType = OperType.SYNC
      downloadBookmarks().then(() => {
        curOperType = OperType.NONE
        browser.action.setBadgeText({ text: "" });
        refreshLocalCount();
        sendResponse(true);
      });

    }
    if (msg.name === 'removeAll') {
      curOperType = OperType.REMOVE
      clearBookmarkTree().then(() => {
        curOperType = OperType.NONE
        browser.action.setBadgeText({ text: "" });
        refreshLocalCount();
        sendResponse(true);
      });

    }
    if (msg.name === 'setting') {
      browser.runtime.openOptionsPage().then(() => {
        sendResponse(true);
      });
    }
    if (msg.name === 'sync') {
      performSync().then(result => {
        sendResponse(result);
      });
      return true;
    }
    return true;
  });
  browser.bookmarks.onCreated.addListener((id, info) => {
    if (curOperType === OperType.NONE) {
      // console.log("onCreated", id, info)
      browser.action.setBadgeText({ text: "!" });
      browser.action.setBadgeBackgroundColor({ color: "#F00" });
      refreshLocalCount();
    }
  });
  browser.bookmarks.onChanged.addListener((id, info) => {
    if (curOperType === OperType.NONE) {
      // console.log("onChanged", id, info)
      browser.action.setBadgeText({ text: "!" });
      browser.action.setBadgeBackgroundColor({ color: "#F00" });
    }
  })
  browser.bookmarks.onMoved.addListener((id, info) => {
    if (curOperType === OperType.NONE) {
      // console.log("onMoved", id, info)
      browser.action.setBadgeText({ text: "!" });
      browser.action.setBadgeBackgroundColor({ color: "#F00" });
    }
  })
  browser.bookmarks.onRemoved.addListener((id, info) => {
    if (curOperType === OperType.NONE) {
      // console.log("onRemoved", id, info)
      browser.action.setBadgeText({ text: "!" });
      browser.action.setBadgeBackgroundColor({ color: "#F00" });
      refreshLocalCount();
    }
  })

async function uploadBookmarks() {
    try {
      let setting = await Setting.build()
      if (setting.githubToken == '') {
        throw new Error("GitHub Token 未设置。请在设置页面配置您的 GitHub Personal Access Token。");
      }
      if (setting.gistID == '') {
        throw new Error("Gist ID 未设置。请先创建一个 Gist 并在设置页面填入其 ID。");
      }
      if (setting.gistFileName == '') {
        throw new Error("Gist 文件名未设置。请在设置页面指定要使用的文件名。");
      }
      let bookmarks = await getBookmarks();
      let syncdata = new SyncDataInfo();
      syncdata.version = browser.runtime.getManifest().version;
      syncdata.createDate = Date.now();
      syncdata.bookmarks = formatBookmarks(bookmarks);
      syncdata.browser = navigator.userAgent;
      await BookmarkService.update({
        files: {
          [setting.gistFileName]: {
            content: JSON.stringify(syncdata)
          }
        },
        description: setting.gistFileName
      });
      const count = getBookmarkCount(syncdata.bookmarks);
      await browser.storage.local.set({ remoteCount: count, localCount: count });
      
      // 通知 popup 刷新数量显示
      try {
        browser.runtime.sendMessage({ name: 'refreshCounts' });
      } catch (e) {
        // popup 可能未打开，忽略错误
      }
      
      if (setting.enableNotify) {
        await browser.notifications.create({
          type: "basic",
          iconUrl: iconLogo,
          title: browser.i18n.getMessage('uploadBookmarks'),
          message: browser.i18n.getMessage('success')
        });
      }

    }
    catch (error: any) {
      console.error(error);
      await browser.notifications.create({
        type: "basic",
        iconUrl: iconLogo,
        title: browser.i18n.getMessage('uploadBookmarks'),
        message: `${browser.i18n.getMessage('error')}：${error.message}`
      });
    }
  }
  async function downloadBookmarks() {
    try {
      let gist = await BookmarkService.get();
      let setting = await Setting.build()
      if (gist) {
        let syncdata: SyncDataInfo = JSON.parse(gist);
        if (syncdata.bookmarks == undefined || syncdata.bookmarks.length == 0) {
          if (setting.enableNotify) {
            await browser.notifications.create({
              type: "basic",
              iconUrl: iconLogo,
              title: browser.i18n.getMessage('downloadBookmarks'),
              message: `${browser.i18n.getMessage('error')}：Gist File ${setting.gistFileName} is NULL`
            });
          }
          return;
        }
        
        console.log('=== REMOTE DATA ===');
        console.log('Remote bookmarks raw (top level):', JSON.stringify(syncdata.bookmarks?.map(b => ({title: b.title, childrenCount: b.children?.length || 0}))));
        
        await clearBookmarkTree();
        
        // 重新获取本地书签状态（此时应该为空或只有根文件夹）
        const existingBookmarks = await browser.bookmarks.getTree();
        console.log('=== LOCAL DATA AFTER CLEAR ===');
        console.log('Local bookmarks count after clear:', getBookmarkCount(existingBookmarks));
        
        // 深拷贝远程数据，避免修改原始对象
        const bookmarksCopy = JSON.parse(JSON.stringify(syncdata.bookmarks));
        
        normalizeFolderNames(bookmarksCopy);
        
        console.log('Remote bookmarks after normalize:', JSON.stringify((bookmarksCopy as BookmarkInfo[]).map((b: BookmarkInfo) => ({title: b.title, childrenCount: b.children?.length || 0}))));
        
        await createBookmarkTree(bookmarksCopy);
        
        const localAfter = await browser.bookmarks.getTree();
        console.log('=== AFTER DOWNLOAD ===');
        console.log('Local bookmarks count after download:', getBookmarkCount(localAfter));
        
        const count = getBookmarkCount(bookmarksCopy);
        await browser.storage.local.set({ remoteCount: count, localCount: count });
        
        // 通知 popup 刷新数量显示
        try {
          browser.runtime.sendMessage({ name: 'refreshCounts' });
        } catch (e) {
          // popup 可能未打开，忽略错误
        }
        
        if (setting.enableNotify) {
          await browser.notifications.create({
            type: "basic",
            iconUrl: iconLogo,
            title: browser.i18n.getMessage('downloadBookmarks'),
            message: browser.i18n.getMessage('success')
          });
        }
      }
      else {
        await browser.notifications.create({
          type: "basic",
          iconUrl: iconLogo,
          title: browser.i18n.getMessage('downloadBookmarks'),
          message: `${browser.i18n.getMessage('error')}：Gist File ${setting.gistFileName} Not Found`
        });
      }
    }
    catch (error: any) {
      console.error(error);
      await browser.notifications.create({
        type: "basic",
        iconUrl: iconLogo,
        title: browser.i18n.getMessage('downloadBookmarks'),
        message: `${browser.i18n.getMessage('error')}：${error.message}`
      });
    }
  }

  function normalizeFolderNames(bookmarks: BookmarkInfo[] | undefined) {
    if (!bookmarks) return;
    for (const node of bookmarks) {
      if (node.title === '书签栏' || node.title === 'Bookmarks Bar' || node.title === '书签工具栏') {
        node.title = RootBookmarksType.ToolbarFolder;
      } else if (node.title === '菜单文件夹' || node.title === 'Menu' || node.title === '书签菜单') {
        node.title = RootBookmarksType.MenuFolder;
      } else if (node.title === '其他书签' || node.title === 'Other Bookmarks' || node.title === '未分类') {
        node.title = RootBookmarksType.UnfiledFolder;
      } else if (node.title === '移动设备书签' || node.title === 'Mobile Bookmarks') {
        node.title = RootBookmarksType.MobileFolder;
      }
      if (node.children) {
        normalizeFolderNames(node.children);
      }
    }
  }

  async function getBookmarks() {
    let bookmarkTree: BookmarkInfo[] = await browser.bookmarks.getTree();
    if (bookmarkTree && bookmarkTree[0].id === "root________") {
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
        throw new Error("GitHub Token 未设置。请在设置页面配置您的 GitHub Personal Access Token。");
      }
      if (setting.gistID == '') {
        throw new Error("Gist ID 未设置。请先创建一个 Gist 并在设置页面填入其 ID。");
      }
      if (setting.gistFileName == '') {
        throw new Error("Gist 文件名未设置。请在设置页面指定要使用的文件名。");
      }

      let bookmarks = await getBookmarks();

      function isRootFolderId(id: string): boolean {
        return id === '0' || id === 'root________' ||
               id === '1' || id === 'toolbar_____' ||
               id === '2' || id === 'unfiled_____' ||
               id === '3' || id === 'mobile______' ||
               id === 'menu________';
      }

      function collectAllNodes(nodes: BookmarkInfo[]): BookmarkInfo[] {
        let result: BookmarkInfo[] = [];
        for (const node of nodes) {
          if (node.id && node.id !== '0' && node.id !== 'root________' && !isRootFolderId(node.id)) {
            result.push(node);
          }
          if (node.children) {
            result = result.concat(collectAllNodes(node.children));
          }
        }
        return result;
      }

      const allNodes = collectAllNodes(bookmarks);
      console.log('=== clearBookmarkTree ===');
      console.log('Total nodes to delete:', allNodes.length);

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
          console.log('Failed to delete:', node.id, node.title);
        }
      }
      console.log('Deleted successfully:', deletedCount, 'failed:', failedCount);

      if (curOperType === OperType.REMOVE && setting.enableNotify) {
        await browser.notifications.create({
          type: "basic",
          iconUrl: iconLogo,
          title: browser.i18n.getMessage('removeAllBookmarks'),
          message: browser.i18n.getMessage('success')
        });
      }
    }
    catch (error: any) {
      console.error(error);
      await browser.notifications.create({
        type: "basic",
        iconUrl: iconLogo,
        title: browser.i18n.getMessage('removeAllBookmarks'),
        message: `${browser.i18n.getMessage('error')}：${error.message}`
      });
    }
  }

  async function createBookmarkTree(bookmarkList: BookmarkInfo[] | undefined, parentId: string = '0') {
    if (bookmarkList == null) {
      return;
    }

    console.log('=== createBookmarkTree ===');
    console.log('Browser type:', curBrowserType);

    for (let i = 0; i < bookmarkList.length; i++) {
      let node = bookmarkList[i];
      console.log('Processing:', node.title, 'parentId:', node.parentId);

      // 处理根文件夹类型
      if (node.title == RootBookmarksType.MenuFolder
        || node.title == RootBookmarksType.MobileFolder
        || node.title == RootBookmarksType.ToolbarFolder
        || node.title == RootBookmarksType.UnfiledFolder) {
        let targetParentId = '2';
        if (curBrowserType == BrowserType.FIREFOX) {
          switch (node.title) {
            case RootBookmarksType.MenuFolder:
              targetParentId = "menu________";
              break;
            case RootBookmarksType.MobileFolder:
              targetParentId = "mobile______";
              break;
            case RootBookmarksType.ToolbarFolder:
              targetParentId = "toolbar_____";
              break;
            case RootBookmarksType.UnfiledFolder:
              targetParentId = "unfiled_____";
              break;
          }
        } else {
          switch (node.title) {
            case RootBookmarksType.MobileFolder:
              targetParentId = "3";
              break;
            case RootBookmarksType.ToolbarFolder:
              targetParentId = "1";
              break;
            case RootBookmarksType.UnfiledFolder:
            case RootBookmarksType.MenuFolder:
              targetParentId = "2";
              break;
          }
        }
        node.children?.forEach(c => c.parentId = targetParentId);
        await createBookmarkTree(node.children, targetParentId);
        continue;
      }

      // 确定 parentId
      let actualParentId = node.parentId || parentId;
      if (!actualParentId || actualParentId === '0') {
        actualParentId = curBrowserType == BrowserType.FIREFOX ? 'unfiled_____' : '2';
      }

      // 创建书签/文件夹
      let res: Bookmarks.BookmarkTreeNode = { id: '', title: '' };
      try {
        res = await browser.bookmarks.create({
          parentId: actualParentId,
          title: node.title,
          url: node.url
        });
        console.log('Created:', node.title, '->', res.id);
      } catch (err) {
        console.error('Failed to create:', node.title, err);
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
    await browser.storage.local.set({ localCount: count });
  }


  function formatBookmarks(bookmarks: BookmarkInfo[]): BookmarkInfo[] | undefined {
    if (bookmarks[0].children) {
      for (let a of bookmarks[0].children) {
        switch (a.id) {
          case "1":
          case "toolbar_____":
            a.title = RootBookmarksType.ToolbarFolder;
            break;
          case "menu________":
            a.title = RootBookmarksType.MenuFolder;
            break;
          case "2":
          case "unfiled_____":
            a.title = RootBookmarksType.UnfiledFolder;
            break;
          case "3":
          case "mobile______":
            a.title = RootBookmarksType.MobileFolder;
            break;
        }
      }
    }

    let a = format(bookmarks[0]);
    return a.children;
  }

  function format(b: BookmarkInfo): BookmarkInfo {
    b.dateAdded = undefined;
    b.dateGroupModified = undefined;
    b.id = undefined;
    b.index = undefined;
    b.parentId = undefined;
    b.type = undefined;
    b.unmodifiable = undefined;
    if (b.children && b.children.length > 0) {
      b.children?.map(c => format(c))
    }
    return b;
  }
  ///暂时不启用自动备份
  /*
  async function backupToLocalStorage(bookmarks: BookmarkInfo[]) {
      try {
          let syncdata = new SyncDataInfo();
          syncdata.version = browser.runtime.getManifest().version;
          syncdata.createDate = Date.now();
          syncdata.bookmarks = formatBookmarks(bookmarks);
          syncdata.browser = navigator.userAgent;
          const keyname = 'BookmarkHub_backup_' + Date.now().toString();
          await browser.storage.local.set({ [keyname]: JSON.stringify(syncdata) });
      }
      catch (error:any) {
          console.error(error)
      }
  }
  */

});