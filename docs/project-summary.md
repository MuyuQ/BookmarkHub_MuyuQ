# BookmarkHub 功能与流程总结

**更新日期:** 2026-03-16

---

## 一、项目定位

**跨浏览器书签同步工具** - 通过 GitHub Gist 或 WebDAV 存储书签数据，实现不同设备/浏览器间的书签同步。

---

## 二、已实现功能

| 功能 | 说明 | 入口 |
|------|------|------|
| **GitHub Gist 同步** | 使用 GitHub Token + Gist ID 存储书签 | 设置页配置 |
| **WebDAV 同步** | 支持 WebDAV 协议作为备选存储后端 | 设置页配置 |
| **一键上传/下载** | 快速同步本地书签到远程 / 从远程恢复 | Popup 弹窗 |
| **自动同步** | 定时同步、事件触发（书签变化）、混合模式 | 设置页配置 |
| **书签导入导出** | 支持 JSON / HTML 格式 | Popup 弹窗 |
| **多备份管理** | 自动备份 + 手动备份，支持恢复/删除 | 设置页备份区 |
| **变更检测** | 检测书签的新增/修改/删除/移动 | 内部逻辑 |
| **智能合并** | 本地/远程书签冲突时自动合并 | 同步流程 |
| **书签计数** | 显示本地和远程书签数量 | Popup 底部 |
| **i18n 国际化** | 支持 11 种语言（见国际化章节） | `_locales/` |
| **加密存储** | AES-GCM 加密敏感凭证（可选） | `crypto.ts` |

---

## 三、核心流程

```
┌─────────────────────────────────────────────────────────────┐
│                      用户触发同步                            │
│                  (Popup/自动同步/快捷键)                     │
└─────────────────────┬───────────────────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    background.ts                            │
│              ┌─────────────────────────┐                    │
│              │   检查 isSyncing 锁     │                    │
│              │   防止并发同步          │                    │
│              └───────────┬─────────────┘                    │
│                          ▼                                  │
│              ┌─────────────────────────┐                    │
│              │   获取本地书签树        │                    │
│              │   browser.bookmarks     │                    │
│              └───────────┬─────────────┘                    │
│                          ▼                                  │
│              ┌─────────────────────────┐                    │
│              │   从远程下载数据        │                    │
│              │   (GitHub: 优先最新备份)│                    │
│              └───────────┬─────────────┘                    │
│                          ▼                                  │
│              ┌─────────────────────────┐                    │
│              │   变更检测 + 智能合并   │                    │
│              │   detectChanges()       │                    │
│              │   mergeBookmarks()      │                    │
│              └───────────┬─────────────┘                    │
│                          ▼                                  │
│              ┌─────────────────────────┐                    │
│              │   上传合并结果到远程    │                    │
│              │   (自动创建备份)        │                    │
│              └───────────┬─────────────┘                    │
│                          ▼                                  │
│              ┌─────────────────────────┐                    │
│              │   更新本地书签 + 统计   │                    │
│              └─────────────────────────┘                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 四、存储后端对比

| 特性 | GitHub Gist | WebDAV |
|------|-------------|--------|
| 配置要求 | Token + Gist ID | URL + 用户名 + 密码 |
| 多备份 | ✅ 支持 | ❌ 不支持 |
| 公开访问 | 可选私有 | 取决于服务配置 |
| 适用场景 | 个人使用、免费 | NAS、自建服务 |

---

## 五、技术架构

```
┌────────────────────────────────────────────────────┐
│                    前端 (React)                    │
│  ┌──────────────┐  ┌──────────────────────────┐   │
│  │   Popup      │  │   Options (设置+备份管理) │   │
│  └──────┬───────┘  └────────────┬─────────────┘   │
└─────────┼───────────────────────┼──────────────────┘
          │ browser.runtime.sendMessage            │
          ▼                       ▼
┌────────────────────────────────────────────────────┐
│              Background Service Worker             │
│  ┌──────────────────────────────────────────────┐ │
│  │  消息处理 + 同步调度 + 操作队列 + 备份管理   │ │
│  └──────────────────────────────────────────────┘ │
└─────────────────────┬──────────────────────────────┘
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
┌──────────────────┐    ┌──────────────────┐
│  GitHub Gist API │    │   WebDAV Server  │
│  (services.ts)   │    │   (webdav.ts)    │
└──────────────────┘    └──────────────────┘
```

---

## 六、核心模块说明

### 同步模块 (`sync.ts`)

- `performSync()` - 主同步流程编排
- `downloadBookmarks()` - 下载书签（GitHub 优先使用最新备份）
- `startAutoSync()` / `stopAutoSync()` - 自动同步控制
- `getIsSyncing()` - 检查同步是否正在进行
- `notifyConflict()` - 冲突通知

### 变更检测 (`changeDetection.ts`)

- `detectChanges()` - 检测书签变化
- `formatChangeSummary()` - 格式化变更摘要
- 返回 `ChangeDetectionResult`，包含 created/modified/deleted/moved 四种变化类型

### 合并模块 (`merge.ts`)

- `mergeBookmarks()` - 合并本地和远程书签
- 支持 `auto`（自动解决冲突）和 `prompt`（手动确认）两种模式

### 备份系统 (`services.ts`)

- `createBackup()` - 创建带时间戳的备份
- `listBackups()` - 获取备份列表（按时间降序）
- `getBackup()` - 获取指定备份内容
- `deleteBackup()` - 删除指定备份

### 加密模块 (`crypto.ts`)

- `encrypt()` / `decrypt()` - AES-GCM 加密/解密
- `isEncrypted()` - 检查数据是否已加密
- 用于保护敏感凭证（Token、密码）

### 错误处理 (`errors.ts`)

- `BookmarkHubError` - 统一错误类
- `ErrorCode` - 26 种错误码枚举（认证/网络/资源/同步/WebDAV/导入导出）
- `createError` - 错误工厂函数
- `handleError()` - 错误标准化处理
- `isError` - 错误类型判断工具

### 重试机制 (`retry.ts`)

- `retryOperation()` - 通用重试（指数退避 + 随机抖动）
- `retryFetch()` - HTTP 请求重试包装器
- 默认：3 次重试，1s 初始延迟，10s 最大延迟

### 日志系统 (`logger.ts`)

- `logger` - 结构化日志（debug/info/warn/error）
- `logSync` / `logBookmarks` / `logWebDAV` / `logSettings` - 专用日志器
- 自动脱敏敏感字段（token、password 等）

### 导入导出 (`importer.ts` / `exporter.ts`)

- `importBookmarks()` - 导入书签（JSON/HTML）
- `exportBookmarks()` - 导出书签（JSON/HTML）
- HTML 格式兼容 NETSCAPE-Bookmark-file-1 标准

### 书签工具 (`bookmarkUtils.ts`)

- `getBookmarkCount()` - 递归计算书签数量
- `formatBookmarks()` - 格式化书签树
- `flattenBookmarks()` - 扁平化书签树

---

## 七、设置配置

使用 `webext-options-sync` 存储，敏感字段自动加密。

### GitHub Gist 设置

| 设置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `githubToken` | string | '' | GitHub Personal Access Token |
| `gistID` | string | '' | Gist ID |
| `gistFileName` | string | 'BookmarkHub' | Gist 文件名 |

### 自动同步设置

| 设置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `enableAutoSync` | boolean | false | 启用自动同步 |
| `enableIntervalSync` | boolean | false | 启用定时同步 |
| `syncInterval` | number | 60 | 同步间隔（分钟）：60/720/1440 |
| `enableEventSync` | boolean | true | 启用事件触发同步 |
| `conflictMode` | 'auto'\|'prompt' | 'auto' | 冲突处理模式 |

### WebDAV 设置

| 设置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `storageType` | 'github'\|'webdav' | 'github' | 存储服务类型 |
| `webdavUrl` | string | '' | WebDAV 服务器地址 |
| `webdavUsername` | string | '' | WebDAV 用户名 |
| `webdavPassword` | string | '' | WebDAV 密码（加密存储） |
| `webdavPath` | string | '/bookmarkhub-bookmarks.json' | WebDAV 文件路径 |

### 备份设置

| 设置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `maxBackups` | number | 10 | 最大备份保留数量 |
| `enableAutoBackup` | boolean | true | 启用自动备份（仅 GitHub） |

### 其他设置

| 设置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `enableNotify` | boolean | true | 操作完成通知 |

---

## 八、消息类型

Popup/Options 页面通过 `browser.runtime.sendMessage` 与 background 通信：

| 消息名 | 用途 | 参数 | 响应 |
|--------|------|------|------|
| `upload` | 上传书签到远程 | - | `boolean` 或 `{ error: string }` |
| `download` | 从远程下载书签 | - | `boolean` 或 `{ error: string }` |
| `sync` | 执行双向同步 | - | `SyncResult` |
| `removeAll` | 清空本地书签 | - | `boolean` |
| `setting` | 打开设置页 | - | `boolean` |
| `listBackups` | 获取备份列表 | - | `BackupInfo[]` |
| `getBackup` | 获取备份内容 | `{ backupId: string }` | `string` (JSON) |
| `deleteBackup` | 删除备份 | `{ backupId: string }` | `boolean` |
| `restoreBackup` | 恢复备份 | `{ backupId: string }` | `boolean` |

Background 主动发送的消息：
- `refreshCounts` - 通知 UI 刷新书签计数

---

## 九、数据模型

### 核心类

| 类名 | 说明 | 主要属性 |
|------|------|----------|
| `BookmarkInfo` | 书签节点 | id, title, url, children |
| `SyncDataInfo` | 同步数据包 | browser, version, createDate, bookmarks |

### 核心接口

| 接口名 | 说明 | 主要属性 |
|--------|------|----------|
| `SyncResult` | 同步结果 | direction, status, localCount, remoteCount |
| `ConflictInfo` | 冲突信息 | type, localBookmark, remoteBookmark |
| `BackupInfo` | 备份元数据 | id, timestamp, dateStr, bookmarkCount |
| `BookmarkChange` | 书签变更 | type, bookmark, original |
| `MergeResult` | 合并结果 | merged, conflicts, changeSummary |

### 枚举

| 枚举名 | 说明 | 值 |
|--------|------|-----|
| `BrowserType` | 浏览器类型 | FIREFOX, CHROME, EDGE |
| `OperType` | 操作类型 | NONE, SYNC, CHANGE, CREATE, MOVE, REMOVE |
| `RootBookmarksType` | 根文件夹类型 | MenuFolder, ToolbarFolder, UnfiledFolder, MobileFolder |
| `ErrorCode` | 错误码 | 26 种错误类型 |

---

## 十、错误处理

### 错误码分类

| 类别 | 错误码示例 |
|------|-----------|
| 认证错误 | AUTH_TOKEN_MISSING, AUTH_TOKEN_INVALID, GIST_ID_MISSING |
| 网络错误 | NETWORK_ERROR, REQUEST_TIMEOUT, RATE_LIMIT |
| 资源错误 | FILE_NOT_FOUND, EMPTY_GIST_FILE, SYNC_DATA_CORRUPTED |
| 同步错误 | SYNC_FAILED, SYNC_IN_PROGRESS, MERGE_CONFLICT |
| WebDAV 错误 | WEBDAV_AUTH_FAILED, WEBDAV_CONNECTION_FAILED |
| 导入导出错误 | IMPORT_ERROR, EXPORT_ERROR, PARSE_ERROR |

### 错误处理模式

```typescript
// 1. 标准化错误创建
throw createError.authTokenMissing();

// 2. 错误统一处理
catch (error: unknown) {
    const err = handleError(error);
    console.error(err.toLogString());    // 日志用
    alert(err.toUserString());            // 用户显示
}

// 3. 错误类型判断
if (isError.networkError(err)) {
    // 重试逻辑
}
```

---

## 十一、国际化 (i18n)

支持 11 种语言，存储于 `public/_locales/`：

| 语言 | 代码 | 完整度 |
|------|------|--------|
| 简体中文 | zh_CN | ✅ 完整 |
| English | en | ✅ 完整 |

---

## 十二、文件结构

```
src/
├── entrypoints/
│   ├── background.ts      # 后台服务 - 消息处理、同步调度、备份管理
│   ├── popup/             # 弹窗 UI
│   └── options/           # 设置页面 UI
├── utils/
│   ├── models.ts          # 数据模型
│   ├── sync.ts            # 同步逻辑
│   ├── services.ts        # GitHub Gist API + 备份操作
│   ├── webdav.ts          # WebDAV 客户端
│   ├── changeDetection.ts # 变更检测
│   ├── merge.ts           # 合并逻辑
│   ├── crypto.ts          # 加密模块
│   ├── constants.ts       # 常量定义
│   ├── errors.ts          # 错误处理
│   ├── retry.ts           # 重试机制
│   ├── logger.ts          # 日志系统
│   ├── http.ts            # HTTP 客户端 (ky)
│   ├── importer.ts        # 书签导入
│   ├── exporter.ts        # 书签导出
│   ├── bookmarkUtils.ts   # 书签工具函数
│   ├── setting.ts         # 设置访问类
│   ├── optionsStorage.ts  # 设置存储
│   └── icons.ts           # 图标定义
└── public/_locales/       # 国际化文件 (11 种语言)
```

---

## 十三、开发命令

```bash
npm run dev              # 开发模式 (Chrome)
npm run dev:firefox      # 开发模式 (Firefox)
npm run build            # 生产构建 (Chrome)
npm run build:firefox    # 生产构建 (Firefox)
npm run zip              # 打包 zip (Chrome)
npm run zip:firefox      # 打包 zip (Firefox)
npm run compile          # TypeScript 类型检查
npm run test             # 运行测试
npm run test:watch       # 测试监听模式
npm run test:coverage    # 测试覆盖率
npm run test:e2e         # E2E 测试
```

---

## 十四、技术栈

| 类型 | 技术 |
|------|------|
| 框架 | WXT 0.19 |
| UI | React 18 + Bootstrap 4 |
| 语言 | TypeScript |
| HTTP | ky |
| 设置存储 | webext-options-sync |
| 压缩 | lz-string |
| 图标 | react-icons |
| 测试 | vitest + @testing-library/react |

---

## 十五、依赖关系

```
optionsStorage.ts ← setting.ts ←─┬── services.ts ← sync.ts
                                 │        ↑
                                 │      http.ts
                                 │        ↑
                                 │     retry.ts
                                 │
                                 ├── webdav.ts ← sync.ts
                                 │
                                 └── bookmarkUtils.ts
                                         ↑
                                    models.ts (共享)

changeDetection.ts ← merge.ts ← sync.ts
        ↑
   models.ts
```

---

## 十六、安全注意事项

- GitHub Token 和 WebDAV 密码使用 AES-GCM 加密存储
- 日志系统自动脱敏敏感字段
- WebDAV 使用 Basic Auth（Base64 编码，非加密）
- 生产环境应移除所有 `console.log`
- 公开 Gist 的书签可能被他人搜索到