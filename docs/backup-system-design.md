# 备份系统设计方案

**版本**: 1.3  
**日期**: 2026-03-17  
**状态**: ✅ 审查通过，可进入实现阶段

## 修订记录

| 版本 | 日期 | 修改内容 |
|-----|------|---------|
| 1.0 | 2026-03-17 | 初始版本 |
| 1.1 | 2026-03-17 | 根据审查报告修订：修复 Service Worker 锁持久化问题、TypeScript 类型错误、还原流程数据一致性、补充错误处理、UI 状态设计、测试用例等 |
| 1.2 | 2026-03-17 | 根据第二次审查修订：修复上传流程顺序、pendingSync 持久化、首次使用流程描述矛盾、补充数据验证调用时机、详细错误提示、跨设备同步最佳实践、补充测试用例 |
| 1.3 | 2026-03-17 | 根据第三次审查修订：添加还原流程边界检查、下载流程空缓存说明、扩展页面关闭清理说明、扩展错误类型枚举 |

---

## 一、概述

### 背景

原备份系统每次上传时创建独立的备份文件（如 `BookmarkHub_2026-03-17_11-35-57.json`），导致 Gist 中文件数量不断增长。

### 目标

- 所有数据集中存储在单一文件 `BookmarkHub` 中
- 远程和本地分别维护独立的备份历史
- 支持用户还原到任意历史版本
- 防抖机制避免频繁同步

---

## 二、存储架构

```
┌─────────────────────────────────────────────────────────────┐
│                      GitHub Gist (远程)                      │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  BookmarkHub (单文件)                                   │ │
│  │  {                                                      │ │
│  │    "lastSyncTimestamp": 1742191011000,                  │ │
│  │    "sourceBrowser": {                                   │ │
│  │      "browser": "Chrome",                               │ │
│  │      "os": "Windows"                                    │ │
│  │    },                                                   │ │
│  │    "backupRecords": [                                   │ │
│  │      { "backupTimestamp": 1742191011000,                │ │
│  │        "bookmarkData": [...],                           │ │
│  │        "bookmarkCount": 125 },                          │ │
│  │      { "backupTimestamp": 1742190957000,                │ │
│  │        "bookmarkData": [...],                           │ │
│  │        "bookmarkCount": 123 },                          │ │
│  │      { "backupTimestamp": 1742190885000,                │ │
│  │        "bookmarkData": [...],                           │ │
│  │        "bookmarkCount": 120 }                           │ │
│  │    ]                                                    │ │
│  │  }                                                      │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              ↑↓ 同步
┌─────────────────────────────────────────────────────────────┐
│                   Browser Storage (本地)                     │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  bookmarkHubCache                                       │ │
│  │  {                                                      │ │
│  │    "lastSyncTimestamp": 1742191011000,                  │ │
│  │    "sourceBrowser": {                                   │ │
│  │      "browser": "Chrome",                               │ │
│  │      "os": "Windows"                                    │ │
│  │    },                                                   │ │
│  │    "backupRecords": [                                   │ │
│  │      { "backupTimestamp": 1742191011000,                │ │
│  │        "bookmarkData": [...],                           │ │
│  │        "bookmarkCount": 125 },                          │ │
│  │      { "backupTimestamp": 1742190957000,                │ │
│  │        "bookmarkData": [...],                           │ │
│  │        "bookmarkCount": 123 },                          │ │
│  │      { "backupTimestamp": 1742190885000,                │ │
│  │        "bookmarkData": [...],                           │ │
│  │        "bookmarkCount": 120 }                           │ │
│  │    ]                                                    │ │
│  │  }                                                      │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 核心原则

- **本地缓存**：独立维护，记录本地备份历史（下载前的本地数据）
- **远程数据**：独立维护，记录远程备份历史（上传前的远程数据）
- **两者独立**：互不同步，各司其职
- **backupRecords[0]**：始终为当前最新数据

---

## 三、数据结构

### TypeScript 接口定义

```typescript
/**
 * 同步数据结构
 * 远程和本地使用相同的数据结构
 */
interface SyncData {
  lastSyncTimestamp: number;           // 最后同步时间（毫秒时间戳）
  sourceBrowser: BrowserInfo;          // 来源浏览器信息
  backupRecords: BackupRecord[];       // 备份记录数组，索引0为当前最新数据
}

/**
 * 浏览器信息
 * 记录数据来源的浏览器和操作系统信息
 * 用于跨设备、跨浏览器同步时识别来源
 */
interface BrowserInfo {
  browser: string;                     // 浏览器名称，如 "Chrome", "Firefox", "Edge"
  os: string;                          // 操作系统，如 "Windows", "macOS", "Linux"
}

/**
 * 备份记录
 * 每个备份记录包含完整的书签数据
 */
interface BackupRecord {
  backupTimestamp: number;             // 备份时间（毫秒时间戳）
  bookmarkData: BookmarkInfo[];        // 书签数据（完整树形结构）
  bookmarkCount: number;               // 书签数量（冗余存储，方便UI展示）
}
```

### 字段说明

| 字段 | 类型 | 说明 |
|-----|------|------|
| lastSyncTimestamp | number | 最后一次同步的时间，毫秒时间戳 |
| sourceBrowser | BrowserInfo | 数据来源的浏览器和操作系统信息，用于跨设备同步时识别来源 |
| backupRecords | BackupRecord[] | 备份记录数组，索引0为当前最新数据，索引越大越旧 |
| backupTimestamp | number | 该备份创建的时间 |
| bookmarkData | BookmarkInfo[] | 完整的书签树形数据 |
| bookmarkCount | number | 书签总数，用于UI展示，避免每次解析数据计算 |

### 本地缓存存储 Key 定义

```typescript
/**
 * 本地缓存存储 key
 * 用于标识 browser.storage.local 中的缓存数据
 */
const LOCAL_CACHE_KEY = 'bookmarkHubCache';

/**
 * 操作锁存储 key
 * 用于标识 browser.storage.local 中的同步锁状态
 */
const SYNC_LOCK_KEY = 'syncLock';

/**
 * 待同步标志存储 key
 * 用于标识 browser.storage.local 中的待同步状态
 * 解决 Service Worker 休眠后 pendingSync 丢失的问题
 */
const PENDING_SYNC_KEY = 'pendingSync';

/**
 * 获取本地缓存
 */
async function getLocalCache(): Promise<SyncData | null> {
  const result = await browser.storage.local.get(LOCAL_CACHE_KEY);
  return result[LOCAL_CACHE_KEY] || null;
}

/**
 * 保存本地缓存
 */
async function saveLocalCache(data: SyncData): Promise<void> {
  await browser.storage.local.set({ [LOCAL_CACHE_KEY]: data });
}

/**
 * 创建空的本地缓存
 */
function createEmptyLocalCache(): SyncData {
  return {
    lastSyncTimestamp: 0,
    sourceBrowser: { browser: 'Unknown', os: 'Unknown' },
    backupRecords: []
  };
}
```

### 数据验证函数

```typescript
/**
 * 验证备份数据完整性
 * 确保备份记录按时间戳降序排列（最新的在前）
 */
function validateBackupRecords(records: BackupRecord[]): boolean {
  if (!records || records.length === 0) {
    return true; // 空数组是有效的
  }
  
  for (let i = 1; i < records.length; i++) {
    if (records[i].backupTimestamp >= records[i - 1].backupTimestamp) {
      return false; // 时间戳应该递减（最新的在前）
    }
  }
  return true;
}

/**
 * 排序备份记录（按时间戳降序）
 * 用于修复可能的数据顺序问题
 */
function sortBackupRecords(records: BackupRecord[]): BackupRecord[] {
  return records.sort((a, b) => b.backupTimestamp - a.backupTimestamp);
}

/**
 * 验证 SyncData 结构有效性
 */
function validateSyncData(data: SyncData): boolean {
  if (!data) return false;
  
  // 检查必要字段
  if (typeof data.lastSyncTimestamp !== 'number') return false;
  if (!data.sourceBrowser || typeof data.sourceBrowser.browser !== 'string') return false;
  if (!Array.isArray(data.backupRecords)) return false;
  
  // 验证备份记录顺序
  return validateBackupRecords(data.backupRecords);
}
```

### 数据验证调用时机

| 验证函数 | 调用时机 | 处理方式 |
|---------|---------|---------|
| `validateSyncData` | 获取远程数据后 | 无效时尝试修复或提示用户数据损坏 |
| `validateBackupRecords` | 保存本地缓存前 | 无效时调用 `sortBackupRecords` 修复 |
| `sortBackupRecords` | 数据顺序异常时 | 强制按时间戳降序排列 |

```typescript
/**
 * 获取并验证远程数据
 */
async function fetchAndValidateRemoteData(): Promise<SyncData | null> {
  const remoteData = await fetchFromRemoteGist();
  
  if (!remoteData) {
    return null;
  }
  
  // 验证数据结构
  if (!validateSyncData(remoteData)) {
    // 尝试修复数据
    if (remoteData.backupRecords && !validateBackupRecords(remoteData.backupRecords)) {
      remoteData.backupRecords = sortBackupRecords(remoteData.backupRecords);
    }
    
    // 再次验证
    if (!validateSyncData(remoteData)) {
      showNotification("远程数据格式异常，请联系支持");
      return null;
    }
  }
  
  return remoteData;
}
```

### sourceBrowser 字段说明

**用途**：
- 跨设备同步场景下，用户可查看"这批书签是从哪台电脑/哪个浏览器上传的"
- 在备份管理页面展示来源信息，如"Chrome 122 on Windows"

**获取方式**：
```typescript
function getBrowserInfo(): BrowserInfo {
  const ua = navigator.userAgent;
  
  // 解析浏览器名称
  let browser = "Unknown";
  if (ua.includes("Firefox")) {
    browser = "Firefox";
  } else if (ua.includes("Edg/")) {
    browser = "Edge";
  } else if (ua.includes("Chrome")) {
    browser = "Chrome";
  }
  
  // 解析操作系统
  let os = "Unknown";
  if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac")) os = "macOS";
  else if (ua.includes("Linux")) os = "Linux";
  
  return { browser, os };
}
```

**UI 展示例**：
- "上次同步自 Chrome on Windows"
- "备份来源：Firefox on macOS"

---

## 四、数据流

### 4.1 上传流程

```
用户点击"上传" 或 自动同步触发
       │
       ▼
┌──────────────────────────────────────────────────┐
│ 1. 检查操作锁，如果锁定则等待或跳过                 │
│    lockManager.acquire()                          │
│    if (!acquired) return                          │
└──────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│ 2. 获取远程数据（先获取远程，确保网络正常）         │
│    remoteData = await fetchFromRemoteGist()       │
│    if (获取失败) {                                 │
│      提示用户网络错误                              │
│      lockManager.release()                        │
│      结束流程                                     │
│    }                                              │
│                                                  │
│ 3. 获取浏览器当前所有书签                          │
│    currentBrowserBookmarks = getBrowserBookmarks()│
└──────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│ 4. 创建新的备份记录（当前浏览器书签）               │
│    newCurrentRecord = {                           │
│      backupTimestamp: Date.now(),                 │
│      bookmarkData: currentBrowserBookmarks,       │
│      bookmarkCount: currentBrowserBookmarks.length│
│    }                                              │
└──────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│ 5. 构建上传数据                                   │
│    uploadData = {                                 │
│      lastSyncTimestamp: Date.now(),              │
│      sourceBrowser: getBrowserInfo(),            │
│      backupRecords: [newCurrentRecord]            │
│    }                                              │
│                                                  │
│ 6. 将远程历史备份追加到上传数据（处理空数据情况）    │
│    if (remoteData?.backupRecords?.length) {       │
│      uploadData.backupRecords.push(               │
│        ...remoteData.backupRecords                │
│      )                                            │
│    }                                              │
│                                                  │
│ 7. 检查备份数量限制（默认3）                       │
│    while (uploadData.backupRecords.length > maxBackups) {│
│      uploadData.backupRecords.pop()              │
│    }                                             │
└──────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│ 8. 上传到远程 Gist                                │
│    result = await uploadToRemoteGist(uploadData)  │
└──────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│ 9. 检查上传结果                                   │
│    if (上传失败) {                                 │
│      提示用户上传失败，请重试                      │
│      lockManager.release()                        │
│      结束流程                                     │
│    }                                              │
│                                                  │
│ 10. 提示用户上传成功                              │
│    showNotification("上传成功")                   │
│                                                  │
│ 11. 解锁                                         │
│    lockManager.release()                          │
└──────────────────────────────────────────────────┘
```

**说明**：
- **先获取远程数据，再获取书签**：确保网络正常后再采集书签，避免网络失败后用户继续修改书签导致数据不一致
- 上传时，将当前浏览器书签作为新的当前数据插入到备份记录开头
- 原远程当前数据自动顺延为历史备份
- 处理远程数据为空的情况（首次上传）
- **本地缓存不需要更新**（本地缓存记录的是"下载前的本地数据"）
- 远程和本地备份独立维护，互不影响

---

### 4.2 下载流程

```
用户点击"下载" 或 自动同步触发
       │
       ▼
┌──────────────────────────────────────────────────┐
│ 1. 检查操作锁，如果锁定则等待或跳过                 │
│    lockManager.acquire()                          │
│    if (!acquired) return                          │
└──────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│ 2. 检查本地缓存是否存在                            │
│    localCache = await getLocalCache()             │
│    if (!localCache) {                             │
│      localCache = createEmptyLocalCache()         │
│    }                                              │
└──────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│ 3. 获取远程数据                                   │
│    remoteData = await fetchFromRemoteGist()       │
│    if (获取失败) {                                 │
│      提示用户网络错误                              │
│      lockManager.release()                        │
│      结束流程                                     │
│    }                                              │
│                                                  │
│ 4. 检查远程数据是否为空                            │
│    if (!remoteData || remoteData.backupRecords.length === 0) {│
│      提示用户：远程数据为空，请先上传              │
│      lockManager.release()                        │
│      结束流程                                     │
│    }                                              │
└──────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│ 5. 将远程最新数据插入到本地备份记录开头             │
│    localCache.backupRecords.unshift(              │
│      remoteData.backupRecords[0]                  │
│    )                                              │
│                                                  │
│ 6. 检查备份数量限制                               │
│    while (localCache.backupRecords.length > maxBackups) {│
│      localCache.backupRecords.pop()              │
│    }                                             │
│                                                  │
│ 7. 更新同步时间和来源浏览器                        │
│    localCache.lastSyncTimestamp = remoteData.lastSyncTimestamp│
│    localCache.sourceBrowser = remoteData.sourceBrowser│
└──────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│ 8. 替换浏览器书签（使用本地最新数据）              │
│    await clearAllBrowserBookmarks()               │
│    await importBookmarksToBrowser(                │
│      localCache.backupRecords[0].bookmarkData     │
│    )                                              │
└──────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│ 9. 保存本地缓存（浏览器书签替换成功后再保存）       │
│    await saveLocalCache(localCache)               │
│                                                  │
│ 10. 解锁                                         │
│    lockManager.release()                          │
└──────────────────────────────────────────────────┘
```

**说明**：
- 下载时，将远程最新数据插入到本地备份记录的开头（索引0）
- 本地原当前数据自动顺延为历史备份
- **先替换浏览器书签，成功后再保存本地缓存**
- 避免书签替换失败但缓存已保存的数据不一致问题
- **空缓存情况**：如果本地缓存为空（backupRecords 为空数组），unshift 操作正常，此时本地备份记录将只有一条：远程最新数据

---

### 4.3 还原流程

```
用户在设置页面选择备份记录，点击"还原"
       │
       ▼
┌──────────────────────────────────────────────────┐
│ 1. 弹出确认对话框                                 │
│    "确定要将书签还原到 [备份时间] 的版本吗？       │
│     当前书签将被替换。"                            │
│    用户点击"取消" → 结束流程                      │
│    用户点击"确认还原" → 继续                      │
└──────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│ 2. 检查操作锁，如果锁定则等待或跳过                 │
│    lockManager.acquire()                          │
│    if (!acquired) return                          │
└──────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│ 3. 获取本地缓存                                   │
│    localCache = await getLocalCache()             │
│                                                  │
│ 4. 边界检查                                       │
│    if (!localCache.backupRecords.length) {        │
│      提示用户："无可用备份记录"                     │
│      lockManager.release()                        │
│      结束流程                                     │
│    }                                              │
│                                                  │
│ 5. 获取用户选中的备份记录（带边界检查）             │
│    if (selectedIndex < 0 ||                       │
│        selectedIndex >= localCache.backupRecords.length) {│
│      提示用户："选择的备份记录不存在"               │
│      lockManager.release()                        │
│      结束流程                                     │
│    }                                              │
│    selectedBackupRecord = localCache.backupRecords[selectedIndex]│
└──────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│ 6. 创建新的备份记录（还原的数据）                   │
│    restoredCurrentRecord = {                      │
│      backupTimestamp: Date.now(),                 │
│      bookmarkData: selectedBackupRecord.bookmarkData,│
│      bookmarkCount: selectedBackupRecord.bookmarkCount│
│    }                                              │
└──────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│ 7. 刷新本地备份数据                               │
│    localCache.backupRecords.unshift(restoredCurrentRecord)│
│    while (localCache.backupRecords.length > maxBackups) {│
│      localCache.backupRecords.pop()              │
│    }                                             │
│    localCache.lastSyncTimestamp = Date.now()      │
│    localCache.sourceBrowser = getBrowserInfo()   │
└──────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│ 8. 替换浏览器书签                                 │
│    await clearAllBrowserBookmarks()               │
│    await importBookmarksToBrowser(                │
│      restoredCurrentRecord.bookmarkData           │
│    )                                              │
└──────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│ 9. 保存本地缓存（浏览器书签替换成功后再保存）       │
│    await saveLocalCache(localCache)               │
└──────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│ 10. 获取远程数据                                  │
│    remoteData = await fetchFromRemoteGist()       │
│    if (获取失败) {                                 │
│      提示用户："还原成功，但同步失败，请稍后重试同步"│
│      lockManager.release()                        │
│      结束流程                                     │
│    }                                              │
└──────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│ 11. 刷新远程备份数据                              │
│    remoteData.backupRecords.unshift(restoredCurrentRecord)│
│    while (remoteData.backupRecords.length > maxBackups) {│
│      remoteData.backupRecords.pop()              │
│    }                                             │
│    remoteData.lastSyncTimestamp = localCache.lastSyncTimestamp│
│    remoteData.sourceBrowser = localCache.sourceBrowser│
└──────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│ 12. 上传到远程 Gist                               │
│    result = await uploadToRemoteGist(remoteData)  │
└──────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│ 13. 检查上传结果                                  │
│    if (上传失败) {                                 │
│      提示用户："还原成功，但同步失败，请稍后重试同步"│
│      lockManager.release()                        │
│      结束流程                                     │
│    }                                              │
└──────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│ 14. 提示用户还原成功                              │
│    showNotification("已还原到 [备份时间]")        │
│                                                  │
│ 15. 解锁                                         │
│    lockManager.release()                          │
└──────────────────────────────────────────────────┘
```

**说明**：
- 还原时，同时刷新本地和远程的备份数据
- **边界检查**：确保本地有备份记录，且 selectedIndex 在有效范围内
- **先替换浏览器书签，成功后再保存本地缓存**
- 避免书签替换失败但缓存已保存的数据不一致问题
- **再尝试网络操作**，网络失败不影响本地还原结果
- 网络失败时提示用户"还原成功，但同步失败"，用户可稍后手动同步
- 用户确认后才执行还原操作

---

### 4.4 备份触发总结

| 操作 | 本地缓存变化 | 远程数据变化 |
|-----|-------------|-------------|
| 上传 | 不变 | 本地当前数据插入到远程[0]，原远程数据顺延 |
| 下载 | 远程[0]插入到本地[0]，原本地数据顺延 | 不变 |
| 还原 | 还原数据插入到本地[0]，原本地数据顺延 | 还原数据插入到远程[0]，原远程数据顺延 |

---

## 五、防抖机制

### 5.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                        书签变动事件                          │
│              （用户在浏览器中增删改书签）                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        防抖层                               │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  事件触发 → 启动计时器（debounceTime）                   ││
│  │           ↓                                             ││
│  │  期间又有新事件？ → 是 → 重置计时器                       ││
│  │           ↓                                             ││
│  │          否（计时器到期 或 达到maxWaitTime）             ││
│  │           ↓                                             ││
│  │       触发同步                                          ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        操作锁层                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  检查锁状态：                                            ││
│  │  - 已锁定 → 标记为待执行，等待                           ││
│  │  - 未锁定 → 加锁，执行同步                              ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        同步执行层                            │
│           （上传流程 / 下载流程 / 还原流程）                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        完成解锁                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  解锁 → 检查是否有待执行的同步 → 有 → 再次触发           ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### 5.2 防抖流程

```
书签变动事件触发（添加/删除/修改书签）
       │
       ▼
┌──────────────────────────────────────────────────┐
│ 1. 检查是否有最大等待计时器                       │
│    if (!maxTimer) {                              │
│      maxTimer = setTimeout(executeSync, maxWaitTime)│
│    }                                             │
└──────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│ 2. 清除之前的防抖计时器                           │
│    if (timer) clearTimeout(timer)                │
└──────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│ 3. 启动新的防抖计时器                             │
│    timer = setTimeout(executeSync, debounceTime) │
└──────────────────────────────────────────────────┘
       │
       │ ← 期间又有新书签变动事件？
       │
┌──────┴──────┐
│     是      │──── 返回步骤2，重置计时器
└──────┬──────┘
       │ 否（计时器到期）
       ▼
┌──────────────────────────────────────────────────┐
│ 4. 清除所有计时器                                 │
│    clearTimeout(timer)                           │
│    clearTimeout(maxTimer)                        │
└──────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│ 5. 检查操作锁                                     │
│    if (isLocked) {                               │
│      pendingSync = true                          │
│      return                                      │
│    }                                             │
└──────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│ 6. 加锁                                          │
│    isLocked = true                               │
└──────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│ 7. 执行同步操作（上传/下载）                       │
│    await performSync()                           │
└──────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│ 8. 解锁                                          │
│    isLocked = false                              │
└──────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│ 9. 检查是否有待执行的同步                         │
│    if (pendingSync) {                            │
│      pendingSync = false                         │
│      重新触发防抖流程                             │
│    }                                             │
└──────────────────────────────────────────────────┘
```

### 5.3 时间线示例

#### 正常情况

```
10:00:00 ─── 添加书签 A
              │
              └─ 启动防抖计时器（5秒）
                 启动最大等待计时器（30秒）

10:00:01 ─── 删除书签 B
              │
              └─ 重置防抖计时器（5秒）

10:00:02 ─── 添加书签 C
              │
              └─ 重置防抖计时器（5秒）

10:00:03 ─── 修改书签 D
              │
              └─ 重置防抖计时器（5秒）

10:00:04 ─── 添加书签 E
              │
              └─ 重置防抖计时器（5秒）

... 用户停止操作 ...

10:00:09 ─── 防抖计时器到期（距离最后一次操作5秒）
              │
              └─ 触发同步（只执行1次）
```

#### 极端情况：持续操作超过最大等待时间

```
10:00:00 ─── 操作 ─ 启动计时器
10:00:05 ─── 操作 ─ 重置防抖计时器
10:00:10 ─── 操作 ─ 重置防抖计时器
...
10:00:30 ─── 最大等待计时器到期
              │
              └─ 强制触发同步（不管用户是否还在操作）
```

#### 同步期间又有新事件

```
10:00:00 ─── 操作 ─ 防抖等待
10:00:05 ─── 计时器到期 ─ 加锁，开始同步
10:00:06 ─── 操作 ─ 检测到锁定，标记 pendingSync = true
10:00:10 ─── 同步完成 ─ 解锁
              │
              └─ 检测到 pendingSync ─ 重新触发防抖
                 │
                 └─ 再次同步
```

### 5.4 代码实现

```typescript
/**
 * 防抖配置
 */
interface DebounceConfig {
  debounceTime: number;        // 防抖等待时间，默认 5000ms（5秒）
  maxWaitTime: number;         // 最大等待时间，默认 30000ms（30秒）
}

/**
 * 持久化锁管理器
 * 使用 browser.storage.local 实现锁持久化
 * 解决 Service Worker 休眠导致内存锁失效的问题
 */
class LockManager {
  private lockKey = SYNC_LOCK_KEY;
  private lockTimeout: number = 60000; // 锁超时时间，防止死锁

  /**
   * 获取锁
   * @returns true 表示成功获取锁，false 表示锁已被占用
   */
  async acquire(): Promise<boolean> {
    // 先清理过期的锁
    await this.checkAndCleanStaleLock();
    
    const result = await browser.storage.local.get(this.lockKey);
    if (result[this.lockKey]?.locked) {
      return false; // 已被锁定
    }
    
    await browser.storage.local.set({
      [this.lockKey]: {
        locked: true,
        timestamp: Date.now()
      }
    });
    return true;
  }
  
  /**
   * 释放锁
   */
  async release(): Promise<void> {
    await browser.storage.local.remove(this.lockKey);
  }
  
  /**
   * 检查并清理过期锁
   * 防止因异常导致的死锁
   */
  async checkAndCleanStaleLock(): Promise<void> {
    const result = await browser.storage.local.get(this.lockKey);
    const lock = result[this.lockKey];
    if (lock && Date.now() - lock.timestamp > this.lockTimeout) {
      await this.release();
    }
  }
}

/**
 * 同步防抖器
 * 负责防抖控制，避免频繁同步
 */
class SyncDebouncer {
  // 使用 ReturnType<typeof setTimeout> 兼容浏览器环境
  private timer: ReturnType<typeof setTimeout> | null = null;
  private maxTimer: ReturnType<typeof setTimeout> | null = null;
  private debounceTime: number = 5000;    // 5秒
  private maxWaitTime: number = 30000;    // 30秒
  private lockManager: LockManager = new LockManager();

  /**
   * 触发同步（带防抖）
   * 当书签变动事件触发时调用
   */
  async triggerSync(): Promise<void> {
    // 检查锁状态
    const isLocked = await this.isLocked();
    if (isLocked) {
      // 持久化 pendingSync 标志，防止 Service Worker 休眠后丢失
      await this.setPendingSync(true);
      return;
    }

    // 清除之前的计时器
    if (this.timer) {
      clearTimeout(this.timer);
    }

    // 启动最大等待计时器（只启动一次）
    if (!this.maxTimer) {
      this.maxTimer = setTimeout(() => {
        this.executeSync();
      }, this.maxWaitTime);
    }

    // 启动防抖计时器
    this.timer = setTimeout(() => {
      this.executeSync();
    }, this.debounceTime);
  }

  /**
   * 检查是否锁定
   */
  private async isLocked(): Promise<boolean> {
    const result = await browser.storage.local.get(SYNC_LOCK_KEY);
    return result[SYNC_LOCK_KEY]?.locked || false;
  }

  /**
   * 设置/清除 pendingSync 标志（持久化）
   */
  private async setPendingSync(value: boolean): Promise<void> {
    if (value) {
      await browser.storage.local.set({ [PENDING_SYNC_KEY]: true });
    } else {
      await browser.storage.local.remove(PENDING_SYNC_KEY);
    }
  }

  /**
   * 获取 pendingSync 标志
   */
  private async getPendingSync(): Promise<boolean> {
    const result = await browser.storage.local.get(PENDING_SYNC_KEY);
    return result[PENDING_SYNC_KEY] || false;
  }

  /**
   * 执行同步
   * 计时器到期后调用
   */
  private async executeSync(): Promise<void> {
    // 清除所有计时器
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.maxTimer) {
      clearTimeout(this.maxTimer);
      this.maxTimer = null;
    }

    // 如果正在同步，跳过
    const acquired = await this.lockManager.acquire();
    if (!acquired) {
      await this.setPendingSync(true);
      return;
    }

    try {
      await performSync();
    } finally {
      // 解锁
      await this.lockManager.release();

      // 如果期间有新事件，再次触发
      const hasPending = await this.getPendingSync();
      if (hasPending) {
        await this.setPendingSync(false);
        this.triggerSync();
      }
    }
  }

  /**
   * 更新防抖配置
   */
  updateConfig(config: Partial<DebounceConfig>): void {
    if (config.debounceTime !== undefined) {
      this.debounceTime = config.debounceTime;
    }
    if (config.maxWaitTime !== undefined) {
      this.maxWaitTime = config.maxWaitTime;
    }
  }

  /**
   * 检查并恢复待执行的同步
   * Service Worker 唤醒时调用，确保不丢失待执行的同步
   */
  async checkAndResumePendingSync(): Promise<void> {
    const hasPending = await this.getPendingSync();
    if (hasPending) {
      await this.setPendingSync(false);
      await this.triggerSync();
    }
  }
}
```

### 5.5 扩展生命周期处理

当浏览器关闭或扩展被禁用时，需要清理持久化状态：

```typescript
// 在 background.ts 中
/**
 * 扩展挂起时的清理处理
 * 清理锁和 pendingSync 状态，避免下次启动时出现脏状态
 */
browser.runtime.onSuspend.addListener(async () => {
  try {
    await browser.storage.local.remove([SYNC_LOCK_KEY, PENDING_SYNC_KEY]);
  } catch (error) {
    // 忽略清理错误，下次启动时会自动处理
  }
});

/**
 * 扩展安装/更新时的初始化
 * 清理可能遗留的脏状态
 */
browser.runtime.onInstalled.addListener(async () => {
  await browser.storage.local.remove([SYNC_LOCK_KEY, PENDING_SYNC_KEY]);
});

/**
 * 扩展启动时的恢复检查
 * 检查是否有未完成的同步需要恢复
 */
browser.runtime.onStartup.addListener(async () => {
  const syncDebouncer = new SyncDebouncer();
  await syncDebouncer.checkAndResumePendingSync();
});
```

**说明**：
- `onSuspend`: 扩展即将被挂起时清理状态
- `onInstalled`: 扩展安装或更新时清理脏状态
- `onStartup`: 浏览器启动时检查并恢复待执行的同步

---

## 六、设置项

### 6.1 配置参数

| 设置项 | 默认值 | 说明 | 可选值 |
|-------|-------|------|-------|
| maxBackups | 3 | 备份数量上限 | 1-10 |
| debounceTime | 5000ms | 防抖等待时间 | 3000ms / 5000ms / 10000ms |
| maxWaitTime | 30000ms | 最大等待时间 | 30000ms / 60000ms |

### 6.2 内部常量说明

以下常量为系统内部使用，不对外暴露配置：

| 常量 | 默认值 | 说明 |
|-----|-------|------|
| LOCAL_CACHE_KEY | 'bookmarkHubCache' | 本地缓存存储 key |
| SYNC_LOCK_KEY | 'syncLock' | 操作锁存储 key |
| PENDING_SYNC_KEY | 'pendingSync' | 待同步标志存储 key |
| lockTimeout | 60000ms | 锁超时时间 |

**锁超时时间设定依据**：
- 60秒足以覆盖大多数同步场景（包括 5000+ 书签的上传/下载）
- 正常情况下，单次同步耗时在 5-30 秒内
- 超时机制防止因异常导致的死锁，用户无需手动干预
- 如果用户书签量极大（10000+），可能需要适当增加此值

### 6.3 存储位置

设置项存储在 `browser.storage.sync` 中，通过 `webext-options-sync` 管理。

```typescript
// optionsStorage.ts
import OptionsSync from 'webext-options-sync';

export default new OptionsSync({
  defaults: {
    // 现有设置...
    
    // 备份系统设置
    maxBackups: 3,
    debounceTime: 5000,
    maxWaitTime: 30000,
  },
});
```

---

## 七、错误处理

### 7.1 错误场景

| 场景 | 处理方式 | 用户提示 |
|-----|---------|---------|
| 上传失败 | 提示用户，不修改本地数据 | "上传失败，请检查网络连接后重试" |
| 下载失败 | 提示用户，不修改本地缓存和浏览器书签 | "下载失败，请检查网络连接后重试" |
| 远程数据为空 | 提示用户先上传 | "远程数据为空，请先上传书签" |
| 还原时上传失败 | 提示用户，不替换浏览器书签 | "还原失败，上传时发生错误" |
| 本地缓存不存在 | 创建空结构 | 无提示，正常流程 |
| 操作超时 | 解锁，提示用户 | "操作超时，请重试" |

### 7.2 详细错误提示

根据实际错误类型提供更具体的提示：

| 错误场景 | 具体错误原因 | 用户提示 |
|---------|------------|---------|
| 网络超时 | 请求超时 | "网络连接超时，请检查网络后重试" |
| Token 无效 | GitHub Token 失效或权限不足 | "GitHub Token 无效或已过期，请重新配置" |
| Gist 不存在 | Gist ID 错误或文件被删除 | "Gist 文件不存在，请检查 Gist ID" |
| 存储空间不足 | Gist 文件大小超限 | "Gist 存储空间不足，请减少备份数量" |
| 网络断开 | 无网络连接 | "网络连接失败，请检查网络后重试" |
| 服务器错误 | GitHub 服务异常 | "服务器暂时不可用，请稍后重试" |
| 数据格式错误 | 远程数据损坏 | "远程数据格式异常，请联系支持" |

### 7.3 错误处理代码

```typescript
/**
 * 错误类型枚举
 * 包含基础错误类型和详细错误类型
 */
enum BackupErrorCode {
  // 基础错误类型
  UPLOAD_FAILED = 'UPLOAD_FAILED',
  DOWNLOAD_FAILED = 'DOWNLOAD_FAILED',
  REMOTE_EMPTY = 'REMOTE_EMPTY',
  RESTORE_FAILED = 'RESTORE_FAILED',
  TIMEOUT = 'TIMEOUT',
  LOCKED = 'LOCKED',
  
  // 详细错误类型
  NETWORK_TIMEOUT = 'NETWORK_TIMEOUT',           // 网络超时
  NETWORK_DISCONNECTED = 'NETWORK_DISCONNECTED', // 网络断开
  TOKEN_INVALID = 'TOKEN_INVALID',               // Token 无效
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',               // Token 过期
  GIST_NOT_FOUND = 'GIST_NOT_FOUND',             // Gist 不存在
  STORAGE_FULL = 'STORAGE_FULL',                 // 存储空间不足
  SERVER_ERROR = 'SERVER_ERROR',                 // 服务器错误
  DATA_CORRUPTED = 'DATA_CORRUPTED',             // 数据损坏
  NO_BACKUP_RECORD = 'NO_BACKUP_RECORD',         // 无备份记录
  INVALID_SELECTION = 'INVALID_SELECTION',       // 无效选择
}

/**
 * 错误消息映射
 */
const BackupErrorMessages: Record<BackupErrorCode, string> = {
  // 基础错误
  [BackupErrorCode.UPLOAD_FAILED]: '上传失败，请检查网络连接后重试',
  [BackupErrorCode.DOWNLOAD_FAILED]: '下载失败，请检查网络连接后重试',
  [BackupErrorCode.REMOTE_EMPTY]: '远程数据为空，请先上传书签',
  [BackupErrorCode.RESTORE_FAILED]: '还原失败，上传时发生错误',
  [BackupErrorCode.TIMEOUT]: '操作超时，请重试',
  [BackupErrorCode.LOCKED]: '正在同步中，请稍候',
  
  // 详细错误
  [BackupErrorCode.NETWORK_TIMEOUT]: '网络连接超时，请检查网络后重试',
  [BackupErrorCode.NETWORK_DISCONNECTED]: '网络连接失败，请检查网络后重试',
  [BackupErrorCode.TOKEN_INVALID]: 'GitHub Token 无效，请重新配置',
  [BackupErrorCode.TOKEN_EXPIRED]: 'GitHub Token 已过期，请重新配置',
  [BackupErrorCode.GIST_NOT_FOUND]: 'Gist 文件不存在，请检查 Gist ID',
  [BackupErrorCode.STORAGE_FULL]: 'Gist 存储空间不足，请减少备份数量',
  [BackupErrorCode.SERVER_ERROR]: '服务器暂时不可用，请稍后重试',
  [BackupErrorCode.DATA_CORRUPTED]: '远程数据格式异常，请联系支持',
  [BackupErrorCode.NO_BACKUP_RECORD]: '无可用备份记录',
  [BackupErrorCode.INVALID_SELECTION]: '选择的备份记录不存在',
};

/**
 * 处理错误
 */
function handleBackupError(error: BackupErrorCode): void {
  showNotification(BackupErrorMessages[error]);
}

/**
 * 根据原始错误推断错误类型
 */
function inferBackupError(originalError: Error): BackupErrorCode {
  const message = originalError.message.toLowerCase();
  
  if (message.includes('timeout')) {
    return BackupErrorCode.NETWORK_TIMEOUT;
  }
  if (message.includes('network') || message.includes('fetch')) {
    return BackupErrorCode.NETWORK_DISCONNECTED;
  }
  if (message.includes('401') || message.includes('unauthorized')) {
    return BackupErrorCode.TOKEN_INVALID;
  }
  if (message.includes('404') || message.includes('not found')) {
    return BackupErrorCode.GIST_NOT_FOUND;
  }
  if (message.includes('422') || message.includes('too large')) {
    return BackupErrorCode.STORAGE_FULL;
  }
  if (message.includes('500') || message.includes('502') || message.includes('503')) {
    return BackupErrorCode.SERVER_ERROR;
  }
  
  return BackupErrorCode.UPLOAD_FAILED;
}
```

---

## 八、数据体积估算

### 8.1 单个书签大小估算

| 字段 | 大小估算 |
|-----|---------|
| id | ~20 bytes |
| title | ~50 bytes（中文更长） |
| url | ~80 bytes |
| parentId | ~20 bytes |
| dateAdded | ~8 bytes |
| 其他字段 | ~20 bytes |
| **单个书签合计** | **~200 bytes** |

### 8.2 总体积估算

| 书签数量 | 单份大小 | 3份备份（默认） | 5份备份 |
|---------|---------|---------------|--------|
| 500 | ~100KB | ~300KB | ~500KB |
| 1000 | ~200KB | ~600KB | ~1MB |
| 5000 | ~1MB | ~3MB | ~5MB |

### 8.3 结论

- 大多数用户书签数量 < 1000，体积可接受
- 默认 3 份备份，总体积控制在 1MB 以内
- 极端情况（5000+ 书签）需要考虑优化，但暂不处理

---

## 九、实现计划

### 9.1 需要修改的文件

| 文件 | 修改内容 |
|-----|---------|
| `src/utils/models.ts` | 新增 `SyncData`、`BackupRecord`、`BrowserInfo` 接口 |
| `src/utils/browserInfo.ts` | 新增文件，实现 `getBrowserInfo()` 函数 |
| `src/utils/services.ts` | 重写 `createBackup`、`listBackups`、`getBackup`、`deleteBackup` 方法，适配新数据结构 |
| `src/utils/sync.ts` | 调整上传/下载逻辑，集成防抖机制 |
| `src/utils/localCache.ts` | 新增文件，管理本地缓存 |
| `src/utils/debounce.ts` | 新增文件，实现防抖机制 |
| `src/utils/optionsStorage.ts` | 新增备份相关设置项 |
| `src/entrypoints/options/` | 新增备份管理子页面 |
| `_locales/*/messages.json` | 新增 UI 展示相关的国际化文本 |

### 9.2 实现步骤

1. **数据结构定义** - 在 `models.ts` 中定义新接口（`SyncData`、`BackupRecord`、`BrowserInfo`）
2. **浏览器信息获取** - 实现 `browserInfo.ts`，解析 User-Agent
3. **本地缓存管理** - 实现 `localCache.ts`
4. **防抖机制** - 实现 `debounce.ts`
5. **服务层重构** - 重写 `services.ts` 中的备份相关方法
6. **同步逻辑调整** - 修改 `sync.ts` 中的上传/下载流程
7. **设置项添加** - 在 `optionsStorage.ts` 中添加新配置
8. **UI 实现** - 在设置页面添加备份管理子页面
9. **国际化** - 添加 UI 展示相关的翻译文本
10. **测试** - 单元测试 + 集成测试

### 9.3 UI 展示计划

#### 备份管理页面

在设置页面中新增子页面，展示以下内容：

**当前数据展示**：
- 同步时间：格式化显示 `lastSyncTimestamp`
- 来源信息：`sourceBrowser.browser on sourceBrowser.os`
- 书签数量：`backupRecords[0].bookmarkCount`

**备份列表展示**：
| 列名 | 内容 |
|-----|------|
| 备份时间 | 格式化显示 `backupTimestamp` |
| 书签数量 | `bookmarkCount` |
| 来源 | `browser on os`（如果有） |
| 操作 | "还原"按钮 |

**设置项**：
- 备份数量上限（maxBackups）：下拉选择 1-10

#### 还原确认对话框

用户点击"还原"按钮后，弹出确认对话框：

- **标题**："确认还原"
- **内容**："确定要将书签还原到 [备份时间] 的版本吗？当前书签将被替换。"
- **按钮**：
  - "取消" - 关闭对话框
  - "确认还原" - 执行还原流程

#### UI 状态设计

**加载状态**：
- 同步进行中：显示加载动画 + "正在同步..."
- 还原进行中：显示加载动画 + "正在还原..."
- 按钮禁用，防止重复操作

**错误提示**（Toast 通知）：
- 网络错误："网络连接失败，请检查网络后重试"
- 上传失败："上传失败，请重试"
- 下载失败："下载失败，请重试"
- 还原失败："还原失败，请重试"

**成功提示**（Toast 通知）：
- 同步成功："同步成功"
- 还原成功："已还原到 [备份时间]"

#### Popup 展示

在弹出窗口中展示：
- "上次同步自 Chrome on Windows"
- "2026-03-17 12:00:00 同步"

---

## 十、向后兼容

### 10.1 旧数据处理

- 不迁移旧的备份文件（如 `BookmarkHub_2026-03-17_11-35-57.json`）
- 用户首次使用新版本时，本地缓存为空
- 首次上传时，会创建新的数据结构

### 10.2 旧版本识别

- 新数据结构中不包含版本号字段
- 通过检查 `backupRecords` 字段是否存在来判断是否为新格式
- 如果旧格式数据存在，按旧逻辑处理（不自动迁移）

---

## 十一、备注

- 本方案经过多轮讨论确认
- 核心设计原则：远程和本地备份独立维护
- 防抖机制确保频繁操作不会导致性能问题
- 错误处理完善，保证数据一致性

---

## 十二、首次使用流程

### 12.1 新用户流程

1. 用户安装扩展
2. 配置 GitHub Token 和 Gist ID
3. 点击"上传"按钮
4. 系统检测远程数据为空
5. 创建初始备份数据结构并上传
6. 完成（**本地缓存保持为空**，下次下载时初始化）

**说明**：
- 首次上传时，只更新远程数据，本地缓存保持为空
- 这符合"远程和本地备份独立维护"的核心原则
- 用户首次下载时，本地缓存才会被初始化

### 12.2 已有旧版本数据的用户

1. 用户更新扩展到新版本
2. 本地缓存为空（不迁移旧数据）
3. 用户首次点击"上传"：
   - 获取远程数据（可能是旧格式）
   - 检测到旧格式，创建新格式数据
   - 上传新格式数据
4. 后续按新流程运行

### 12.3 跨浏览器首次使用

1. 用户在浏览器 A 已有数据
2. 在浏览器 B 安装扩展并配置相同的 Token/Gist
3. 点击"下载"按钮
4. 获取远程数据，替换本地书签
5. 本地缓存初始化
6. 完成

### 12.4 跨设备同步最佳实践

**注意事项**：

1. **避免同时在多设备修改书签**
   - 建议在一个设备上完成所有书签修改后再同步到其他设备
   - 如果必须在多设备同时修改，请先在备份管理页面查看远程数据

2. **同步前检查**
   - 下载前会自动备份当前书签到本地历史
   - 上传会覆盖远程数据，请确认远程数据已备份或不再需要

3. **推荐同步流程**：
   ```
   设备 A 修改书签 → 设备 A 上传 → 设备 B 下载 → 设备 B 修改书签 → ...
   ```

4. **冲突处理**：
   - 当前设计不自动合并冲突，后上传的数据会覆盖先上传的
   - 如果发生数据丢失，可通过备份历史还原

---

## 十三、测试用例

### 13.1 单元测试

| 测试项 | 测试内容 | 预期结果 |
|-------|---------|---------|
| getBrowserInfo | 解析各种 User-Agent | 正确返回 browser 和 os |
| createEmptyLocalCache | 创建空缓存 | 返回有效的空 SyncData |
| validateBackupRecords | 验证备份数据 | 正确识别无效排序 |
| sortBackupRecords | 排序备份数据 | 按时间戳降序排列 |
| validateSyncData | 验证同步数据结构 | 正确识别无效数据 |
| LockManager.acquire | 获取锁 | 成功获取锁，持久化存储 |
| LockManager.release | 释放锁 | 锁被正确释放 |
| SyncDebouncer.setPendingSync | 设置 pendingSync | 持久化到 storage.local |
| SyncDebouncer.getPendingSync | 获取 pendingSync | 从 storage.local 读取 |

### 13.2 集成测试

| 测试项 | 测试场景 | 预期结果 |
|-------|---------|---------|
| 首次上传 | 本地和远程都为空 | 创建初始数据并上传成功 |
| 正常上传 | 有历史备份数据 | 新数据插入，旧数据顺延 |
| 正常下载 | 远程有数据 | 本地数据更新，备份保留 |
| 还原操作 | 选择历史备份还原 | 书签替换，备份更新 |
| 并发保护 | 同时触发多个同步 | 只执行一个，其他排队 |
| 网络失败 | 模拟网络错误 | 提示用户，不修改数据 |
| 锁超时清理 | 模拟死锁场景 | 超时后自动清理锁 |
| pendingSync 恢复 | Service Worker 休眠后唤醒 | 检查并恢复待执行同步 |

### 13.3 边界测试

| 测试项 | 测试场景 | 预期结果 |
|-------|---------|---------|
| 空书签 | 用户无书签 | 正常处理，bookmarkCount = 0 |
| 大量书签 | 5000+ 书签 | 正常处理，可能耗时较长 |
| 备份达到上限 | 备份数量超过 maxBackups | 自动删除最旧备份 |
| 远程数据损坏 | 远程数据格式错误 | 提示用户，不崩溃 |
| 本地缓存损坏 | 本地缓存格式错误 | 重建空缓存 |
| 边界：备份数量为1 | maxBackups = 1 | 只保留最新一条备份 |
| 边界：备份数量为10 | maxBackups = 10 | 保留10条备份 |

### 13.4 并发与异常测试

| 测试项 | 测试场景 | 预期结果 |
|-------|---------|---------|
| 并发上传 | 用户快速连续点击上传 | 只执行一次，其他被锁阻止 |
| 断网重连 | 同步过程中断网 | 提示网络错误，解锁，不修改数据 |
| 浏览器休眠 | 同步过程中浏览器休眠 | 锁超时自动清理 |
| 远程数据格式错误 | Gist 被手动修改为无效格式 | 尝试修复，失败则提示数据损坏 |
| 本地缓存格式错误 | 本地存储被手动修改 | 自动创建空缓存 |
| Token 过期 | 同步过程中 Token 失效 | 提示 Token 无效，请重新配置 |

### 13.5 性能测试

| 测试项 | 测试场景 | 预期结果 |
|-------|---------|---------|
| 大量书签上传 | 5000 书签上传 | 30秒内完成 |
| 大量书签下载 | 5000 书签下载 | 30秒内完成 |
| 内存占用 | 5000 书签 × 3备份 | 内存增长 < 100MB |
| 本地缓存读写 | 频繁读写操作 | 无明显延迟 |
| 锁竞争 | 高频并发请求 | 正确排队，无死锁 |

---

## 十四、数据安全

### 14.1 数据加密

当前设计中，书签数据以明文存储在 Gist 中。如果用户使用公开 Gist，数据可能被他人访问。

**建议**：
- 提示用户使用私有 Gist
- 在 UI 中明确提示数据存储位置
- 考虑在未来版本添加可选的数据加密功能

### 14.2 敏感信息

书签数据可能包含敏感 URL（如内部系统、私人页面）。

**建议**：
- 在设置页面提供数据清除功能
- 提示用户定期检查备份内容
- 不记录敏感日志（Token、书签内容）

### 14.3 凭证安全

- GitHub Token 存储在 `browser.storage.sync` 中
- 建议使用最小权限 Token（只需 gist 权限）
- 不在控制台输出 Token