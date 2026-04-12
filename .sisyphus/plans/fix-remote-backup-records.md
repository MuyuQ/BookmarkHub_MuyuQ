# 修复远程备份历史记录 - Work Plan

## 问题分析

当前远程数据格式（旧格式）：
```json
{
    "browser": "Mozilla/5.0",
    "version": "0.7",
    "createDate": 1773844519793,
    "bookmarks": [...]
}
```

设计文档要求的格式（新格式）：
```json
{
    "lastSyncTimestamp": 1773844519793,
    "sourceBrowser": { "browser": "Chrome", "os": "Windows" },
    "backupRecords": [
        { "backupTimestamp": ..., "bookmarkData": [...], "bookmarkCount": 12 },
        { "backupTimestamp": ..., "bookmarkData": [...], "bookmarkCount": 10 }
    ]
}
```

## 根本原因

`uploadBookmarks` 函数使用的是 `SyncDataInfo` 类（旧格式），没有包含 `backupRecords` 字段。

## 修复方案

修改 `uploadBookmarks` 函数，实现设计文档中的新格式：

### 步骤 1: 修改 `uploadBookmarks` 函数

**文件**: `src/utils/sync.ts`

**当前逻辑**:
```typescript
async function uploadBookmarks(bookmarks: BookmarkInfo[]): Promise<void> {
    const syncdata = new SyncDataInfo();
    syncdata.version = browser.runtime.getManifest().version;
    syncdata.createDate = Date.now();
    syncdata.bookmarks = bookmarks;
    syncdata.browser = navigator.userAgent;
    
    const content = JSON.stringify(syncdata);
    // 上传...
}
```

**修改后逻辑**:
```typescript
async function uploadBookmarks(bookmarks: BookmarkInfo[]): Promise<void> {
    const setting = await Setting.build();
    
    // 1. 获取现有远程数据
    const existingRemoteData = await fetchRemoteData(setting);
    
    // 2. 保存现有数据到本地备份（已有）
    if (existingRemoteData?.bookmarks?.length > 0) {
        await saveBackupToLocalStorage(existingRemoteData.bookmarks);
    }
    
    // 3. 创建新的备份记录
    const newRecord: BackupRecord = {
        backupTimestamp: Date.now(),
        bookmarkData: bookmarks,
        bookmarkCount: getBookmarkCount(bookmarks)
    };
    
    // 4. 构建上传数据（新格式）
    const uploadData: SyncData = {
        lastSyncTimestamp: Date.now(),
        sourceBrowser: getBrowserInfo(),
        backupRecords: [newRecord]  // 当前数据作为最新备份
    };
    
    // 5. 如果远程有备份历史，追加到上传数据
    if (existingRemoteData && 'backupRecords' in existingRemoteData) {
        const remoteSyncData = existingRemoteData as SyncData;
        if (remoteSyncData.backupRecords?.length > 0) {
            // 将远程旧备份追加到后面
            uploadData.backupRecords.push(...remoteSyncData.backupRecords);
        }
    }
    
    // 6. 检查备份数量限制
    const maxBackups = BACKUP_DEFAULTS.MAX_BACKUPS;
    while (uploadData.backupRecords.length > maxBackups) {
        uploadData.backupRecords.pop();  // 删除最旧的备份
    }
    
    // 7. 上传
    const content = JSON.stringify(uploadData);
    // ... 根据 storageType 上传到 Gist 或 WebDAV
}
```

### 步骤 2: 修改 `fetchRemoteData` 函数

**文件**: `src/utils/sync.ts`

需要确保能正确解析新的 `SyncData` 格式和旧的 `SyncDataInfo` 格式（向后兼容）。

```typescript
async function fetchRemoteData(setting: Setting): Promise<SyncDataInfo | SyncData | null> {
    // ... 获取内容 ...
    
    const data = JSON.parse(content);
    
    // 检查是新格式还是旧格式
    if (data.backupRecords) {
        // 新格式 SyncData
        return data as SyncData;
    } else if (data.bookmarks) {
        // 旧格式 SyncDataInfo
        return data as SyncDataInfo;
    }
    
    return null;
}
```

### 步骤 3: 确保类型导入

确保 `SyncData` 和 `BackupRecord` 类型已导入：

```typescript
import { BookmarkInfo, SyncDataInfo, SyncResult, ConflictInfo, SyncData, BackupRecord } from './models';
```

### 步骤 4: 添加辅助函数

在 `sync.ts` 中添加 `getBrowserInfo` 函数（如果 models.ts 中没有）：

```typescript
function getBrowserInfo(): BrowserInfo {
    const ua = navigator.userAgent;
    let browser = "Unknown";
    let os = "Unknown";
    
    if (ua.includes("Firefox")) browser = "Firefox";
    else if (ua.includes("Edg/")) browser = "Edge";
    else if (ua.includes("Chrome")) browser = "Chrome";
    
    if (ua.includes("Windows")) os = "Windows";
    else if (ua.includes("Mac")) os = "macOS";
    else if (ua.includes("Linux")) os = "Linux";
    
    return { browser, os };
}
```

## 数据格式变化

### 上传前（旧格式）:
```json
{
    "browser": "Mozilla/5.0",
    "version": "0.7",
    "createDate": 1773844519793,
    "bookmarks": [...]
}
```

### 上传后（新格式）:
```json
{
    "lastSyncTimestamp": 1773844519793,
    "sourceBrowser": { "browser": "Chrome", "os": "Windows" },
    "backupRecords": [
        {
            "backupTimestamp": 1773844519793,
            "bookmarkData": [...],
            "bookmarkCount": 9
        }
    ]
}
```

## 向后兼容性

- **读取**: `fetchRemoteData` 需要能处理旧格式（无 backupRecords）和新格式
- **恢复**: 下载时需要能处理两种格式

## 验证步骤

1. 编译: `npm run compile`
2. 测试: `npm test`
3. 构建: `npm run build`
4. 手动测试:
   - 上传书签
   - 检查 Gist 内容是否包含 `backupRecords`
   - 再次上传，检查是否追加了新的备份记录
   - 检查备份数量限制（默认3个）
