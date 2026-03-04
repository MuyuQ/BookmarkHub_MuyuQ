# BookmarkHub 代码调用关系图

## 整体架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BookmarkHub 浏览器扩展                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────┐    ┌─────────────────────┐    ┌───────────────┐ │
│  │   Popup 弹出页面     │    │  Options 设置页面   │    │  Background   │ │
│  │   (popup.tsx)       │    │   (options.tsx)     │    │  Service      │ │
│  └──────────┬──────────┘    └──────────┬──────────┘    │  Worker       │ │
│             │                          │               │ (background.ts)│ │
│             │                          │               └───────┬─────────┘ │
│             │                          │                       │           │
│             ▼                          ▼                       ▼           │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                        Utils 工具模块层                                 ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │                                                                         ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ││
│  │  │  services   │  │   setting   │  │   sync      │  │   webdav    │  ││
│  │  │ (GitHub API)│  │  (设置管理)  │  │  (同步核心)  │  │  (WebDAV)   │  ││
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  ││
│  │         │                │                │                │          ││
│  │         ▼                ▼                ▼                ▼          ││
│  │  ┌─────────────────────────────────────────────────────────────────────┐││
│  │  │                      Models 数据模型层                              │││
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │││
│  │  │  │   models    │  │optionsStorage│  │    http     │              │││
│  │  │  │  (数据类型)  │  │  (设置持久化) │  │  (HTTP客户端) │              │││
│  │  │  └─────────────┘  └─────────────┘  └─────────────┘              │││
│  │  └─────────────────────────────────────────────────────────────────────┘││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 模块调用关系详图

### 1. 入口点 → 工具模块

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Entry Points 入口点                               │
└─────────────────────────────────────────────────────────────────────────────┘

┌────────────────────┐                    ┌─────────────────────────────────┐
│   popup.tsx        │                    │         background.ts          │
│   (弹出页面)        │                    │       (后台服务/Service Worker) │
├────────────────────┤                    ├─────────────────────────────────┤
│                    │                    │                                 │
│  imports:          │                    │  imports:                      │
│  ├─ exporter.ts    │                    │  ├─ services.ts                │
│  ├─ importer.ts    │                    │  ├─ setting.ts                 │
│  ├─ models.ts      │───────────────────│  ├─ sync.ts                    │
│  └─ browser API    │                    │  ├─ models.ts                 │
│     (bookmarks)    │                    │  └─ browser API                │
│                    │                    │     (bookmarks/notifications)  │
│  calls:            │                    │                                 │
│  ├─ exportBookmarks│◄──────────────────│  calls:                        │
│  ├─ importBookmarks│                    │  ├─ Setting.build()           │
│  └─ browser.       │                    │  ├─ startAutoSync()           │
│     bookmarks      │                    │  ├─ performSync()             │
│                    │                    │  ├─ BookmarkService.get()      │
│                    │                    │  ├─ BookmarkService.update()  │
│                    │                    │  └─ browser.bookmarks.*        │
└────────────────────┘                    └─────────────────────────────────┘
          │                                         │
          ▼                                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        options.tsx (设置页面)                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  imports:                                                                  │
│  ├─ optionsStorage.ts ──────► 设置表单同步                                 │
│  ├─ webdav.ts ─────────────► 测试 WebDAV 连接                            │
│  ├─ browser i18n ──────────► 国际化支持                                   │
│  └─ react-bootstrap ────────► UI 组件                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 2. 工具模块间调用关系

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Utils 工具模块调用关系                               │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌──────────────────┐
                              │    services.ts   │
                              │   (GitHub API)   │
                              ├──────────────────┤
                              │                  │
                              │  imports:        │
                              │  ├─ setting.ts   │
                              │  └─ http.ts      │
                              │                  │
                              │  exports:        │
                              │  ├─ getBookmarks()│
                              │  ├─ formatBookmarks()│
                              │  ├─ getBookmarkCount()│
                              │  └─ BookmarkService │
                              │      ├─ get()   │
                              │      ├─ getAllGist()│
                              │      └─ update()│
                              │                  │
                              └────────┬─────────┘
                                       │
           ┌───────────────────────────┼───────────────────────────┐
           │                           │                           │
           ▼                           ▼                           ▼
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│    sync.ts       │      │    setting.ts    │      │    webdav.ts     │
│   (同步核心)      │      │    (设置管理)    │      │   (WebDAV 客户端) │
├──────────────────┤      ├──────────────────┤      ├──────────────────┤
│                  │      │                  │      │                  │
│  imports:        │      │  imports:        │      │  exports:        │
│  ├─ setting.ts   │      │  ├─ optionsStorage│     │  ├─ WebDAVClient │
│  ├─ services.ts  │      │  └─ webext-options│     │  ├─ webdavRead() │
│  ├─ models.ts    │◄─────┤     sync        │      │  ├─ webdavWrite()│
│  └─ webdav.ts    │      │                  │      │  └─ testWebDAV() │
│                  │      │  exports:        │      │                  │
│  exports:        │      │  └─ Setting      │      │  imports:        │
│  ├─ startAutoSync│      │      └─ build() │      │  └─ setting.ts   │
│  ├─ stopAutoSync │      │                  │      │                  │
│  ├─ performSync  │      └──────────────────┘      └──────────────────┘
│  └─ notifyConflict│              │
│                  │              │
└────────┬─────────┘              │
         │                        │
         ▼                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Models 数据模型层                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────────┐│
│  │   models.ts    │    │optionsStorage.ts│    │       http.ts           ││
│  │  (数据类型定义)  │    │  (设置持久化)    │    │    (HTTP 客户端/ky)     ││
│  ├─────────────────┤    ├─────────────────┤    ├─────────────────────────┤│
│  │                 │    │                 │    │                         ││
│  │ exports:        │    │ exports:        │    │ exports:                ││
│  │ ├─ BookmarkInfo │    │ └─ default      │    │ └─ http (ky instance)  ││
│  │ ├─ SyncDataInfo│    │    OptionsSync  │    │     with GitHub API    ││
│  │ ├─ BrowserType │    │                 │    │     prefixUrl          ││
│  │ ├─ OperType    │    │ imports:        │    │                         ││
│  │ ├─ RootBookmarksType│ │ └─ webext-    │    │ imports:                ││
│  │ ├─ SyncResult │    │     options-sync│    │ └─ ky                   ││
│  │ └─ ConflictInfo│    │                 │    │                         ││
│  │                 │    └─────────────────┘    └─────────────────────────┘│
│  │                 │                                                    │
│  └─────────────────┘                                                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### 3. 数据流向图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            数据流向图                                        │
└─────────────────────────────────────────────────────────────────────────────┘

                           用户操作流程

    ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
    │   Popup      │      │  Background  │      │   Options    │
    │  (用户点击)   │      │   Service   │      │   (设置)     │
    └──────┬───────┘      └──────┬───────┘      └──────┬───────┘
           │                     │                     │
           │ 1. sendMessage     │                     │ 2. save
           │ (upload/download)  │                     │ (optionsStorage)
           │                    │                     │
           ▼                    ▼                     ▼
    ┌─────────────────────────────────────────────────────────────┐
    │                    消息处理                                  │
    │  browser.runtime.onMessage.addListener()                   │
    └─────────────────────────────────────────────────────────────┘
           │
           │ 3. 获取设置
           ▼
    ┌─────────────────────────────────────────────────────────────┐
    │                    Setting.build()                          │
    │  从 optionsStorage 读取用户配置                            │
    └─────────────────────────────────────────────────────────────┘
           │
           │ 4. 判断存储类型
           ▼
    ┌─────────────────────────────────────────────────────────────┐
    │                 storageType (github/webdav)                │
    └─────────────────────────────────────────────────────────────┘
           │
     ┌────┴────┐
     │         │
     ▼         ▼
┌─────────┐ ┌─────────┐
│ GitHub  │ │ WebDAV  │
│  Gist   │ │ Server  │
└────┬────┘ └────┬────┘
     │          │
     │ 5. API   │ 5. HTTP
     │ 调用     │ 请求
     ▼          ▼
┌─────────────────────────────────────────────────────────────┐
│                    远程存储                                  │
│  (GitHub Gist / WebDAV Server)                             │
└─────────────────────────────────────────────────────────────┘
     │
     │ 6. 返回数据
     ▼
┌─────────────────────────────────────────────────────────────┐
│                 同步/书签操作                                │
│  ├─ upload:   上传书签到远程                                │
│  ├─ download: 下载书签到本地                                  │
│  └─ sync:    智能合并后同步                                  │
└─────────────────────────────────────────────────────────────┘
     │
     │ 7. 浏览器 API
     ▼
┌─────────────────────────────────────────────────────────────┐
│              browser.bookmarks API                          │
│  ├─ getTree()      获取书签树                               │
│  ├─ create()       创建书签                                  │
│  ├─ removeTree()  删除书签树                                 │
│  └─ move()        移动书签                                   │
└─────────────────────────────────────────────────────────────┘
```

---

### 4. 同步流程图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         自动同步流程                                        │
└─────────────────────────────────────────────────────────────────────────────┘

                          自动同步触发条件
                          
    ┌──────────────────────────────────────────────────────────────────────┐
    │                                                                  │
    │   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
    │   │   定时触发   │    │  事件触发    │    │  浏览器启动  │         │
    │   │  (setInterval)│    │ (bookmarks  │    │(onStartup) │         │
    │   │             │    │  onChanged) │    │             │         │
    │   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘         │
    │          │                   │                   │                │
    └──────────┼───────────────────┼───────────────────┼────────────────┘
               │                   │                   │
               └───────────────────┴───────────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────┐
                    │      performSync()           │
                    │      开始同步流程             │
                    └──────────────┬───────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
                    ▼                             ▼
           ┌────────────────┐           ┌────────────────┐
           │ 获取本地书签   │           │ 获取远程书签   │
           │getBookmarks() │           │ fetchRemoteData│
           │ (browser API) │           │ (GitHub/WebDAV)│
           └───────┬────────┘           └───────┬────────┘
                   │                            │
                   └────────────┬───────────────┘
                                │
                                ▼
                    ┌──────────────────────────────┐
                    │     智能合并 (mergeBookmarks) │
                    │     - 检测变更                 │
                    │     - 解决冲突                 │
                    └──────────────┬───────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
                    ▼                             ▼
           ┌────────────────┐           ┌────────────────┐
           │   上传合并结果  │           │   下载合并结果  │
           │uploadBookmarks│           │createBookmarkTree
           │ (GitHub/WebDAV│           │ (browser API) │
           └───────┬────────┘           └───────┬────────┘
                   │                            │
                   └────────────┬───────────────┘
                                │
                                ▼
                    ┌──────────────────────────────┐
                    │   saveSyncStatus()           │
                    │   保存同步状态到 localStorage │
                    └──────────────────────────────┘
```

---

### 5. 文件依赖矩阵

| 文件 | 依赖的文件 |
|------|-----------|
| **background.ts** | services.ts, setting.ts, sync.ts, models.ts |
| **popup.tsx** | exporter.ts, importer.ts, models.ts |
| **options.tsx** | optionsStorage.ts, webdav.ts |
| **sync.ts** | setting.ts, services.ts, models.ts, webdav.ts |
| **services.ts** | setting.ts, http.ts, models.ts |
| **setting.ts** | optionsStorage.ts |
| **webdav.ts** | setting.ts |
| **exporter.ts** | models.ts |
| **importer.ts** | models.ts |
| **models.ts** | (无外部依赖) |
| **optionsStorage.ts** | webext-options-sync |
| **http.ts** | ky |
| **icons.ts** | react-icons/ai |

---

### 6. 关键函数调用链

#### 上传书签流程
```
popup.tsx: browser.runtime.sendMessage({name: 'upload'})
    ↓
background.ts: onMessage listener
    ↓
Setting.build() → 获取用户配置
    ↓
services.ts: BookmarkService.update()
    ↓
http.ts: http.patch() → GitHub Gist API
```

#### 自动同步流程
```
background.ts: startAutoSync()
    ↓
sync.ts: setInterval / onStartup listener
    ↓
sync.ts: performSync()
    ├→ services.ts: getBookmarks()
    ├→ services.ts/ webdav.ts: fetchRemoteData()
    ├→ sync.ts: mergeBookmarks()
    └→ services.ts/ webdav.ts: uploadBookmarks()
```

#### 导出书签流程
```
popup.tsx: handleExport()
    ↓
exporter.ts: exportBookmarks('html', bookmarks)
    ├→ generateHtmlBookmarks()
    └→ downloadFile()
```

#### 导入书签流程
```
popup.tsx: handleImport()
    ↓
importer.ts: importBookmarks(file)
    ├→ parseJsonBookmarks() / parseHtmlBookmarks()
    └→ browser.bookmarks.create()
```

---

### 7. 事件监听关系

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         浏览器扩展事件监听                                    │
└─────────────────────────────────────────────────────────────────────────────┘

background.ts 中的事件监听器:

1. browser.runtime.onInstalled
   └─► 扩展安装时触发
       └─► 检查 enableAutoSync，启动自动同步

2. browser.runtime.onStartup
   └─► 浏览器启动时触发
       └─► performSync() (当 syncMode 包含 event/hybrid 时)

3. browser.runtime.onMessage
   └─► 接收来自 popup 的消息
       ├─► 'upload'  → uploadBookmarks()
       ├─► 'download' → downloadBookmarks()
       ├─► 'removeAll' → clearBookmarkTree()
       ├─► 'setting' → openOptionsPage()
       └─► 'sync' → performSync()

4. browser.bookmarks.onCreated
   └─► 创建书签时触发
       └─► 设置徽章 "!" (当 curOperType === NONE 时)

5. browser.bookmarks.onChanged
   └─► 书签变更时触发
       └─► 设置徽章 "!"

6. browser.bookmarks.onMoved
   └─► 移动书签时触发
       └─► 设置徽章 "!"

7. browser.bookmarks.onRemoved
   └─► 删除书签时触发
       └─► 设置徽章 "!" + refreshLocalCount()
```

---

### 8. 设置存储结构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         设置存储结构                                         │
└─────────────────────────────────────────────────────────────────────────────┘

optionsStorage (webext-options-sync)
│
├── githubToken: string        // GitHub Token
├── gistID: string            // Gist ID
├── gistFileName: string     // Gist 文件名 (默认: "BookmarkHub")
├── enableNotify: boolean    // 启用通知
├── githubURL: string        // GitHub API URL
│
├── [新增] enableAutoSync: boolean    // 启用自动同步
├── [新增] syncMode: 'interval'|'event'|'hybrid'  // 同步模式
├── [新增] syncInterval: number        // 同步间隔(分钟)
├── [新增] conflictMode: 'auto'|'prompt'  // 冲突处理模式
├── [新增] storageType: 'github'|'webdav'   // 存储服务类型
├── [新增] webdavUrl: string          // WebDAV 服务器 URL
├── [新增] webdavUsername: string     // WebDAV 用户名
├── [新增] webdavPassword: string      // WebDAV 密码
└── [新增] webdavPath: string         // WebDAV 路径

browser.storage.local (运行时数据)
│
├── localCount: number        // 本地书签数量
├── remoteCount: number       // 远程书签数量
├── lastSyncTime: number      // 上次同步时间
├── lastSyncDirection: 'upload'|'download'  // 上次同步方向
├── lastSyncStatus: 'success'|'failed'       // 上次同步状态
└── lastSyncError: string     // 上次同步错误信息
```

---

*生成时间: 2026-03-04*
*项目: BookmarkHub - 浏览器书签同步扩展*
