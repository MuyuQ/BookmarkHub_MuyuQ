# 修复远程数据格式 - Work Plan (方案A + version字段)

## 目标
将远程数据从旧格式 `SyncDataInfo` 完全切换到新格式 `SyncData`，并添加 `version` 字段用于版本管理。同时确保本地缓存数据格式一致。

## 数据格式对比

### 旧格式 (v1.0) - SyncDataInfo
```json
{
    "browser": "Mozilla/5.0...",
    "version": "1.0.0",
    "createDate": 1773844519793,
    "bookmarks": [...]
}
```

### 新格式 (v2.0) - SyncData
```json
{
    "version": "2.0",
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

### version 字段说明
- `"1.0"` - 旧格式（SyncDataInfo）
- `"2.0"` - 新格式（SyncData with backupRecords）
- 将来 `"3.0"` - 可能的未来版本

## 影响范围分析

### 需要修改的文件清单

| 文件 | 类型 | 修改内容 |
|------|------|----------|
| `models.ts` | 接口定义 | ① SyncData 添加 version 字段 |
| `localCache.ts` | 本地缓存 | ② createEmptyLocalCache 添加 version ③ createSyncData 添加 version ④ validateSyncData 验证 version |
| `sync.ts` | 远程同步 | ⑤ fetchRemoteData 向后兼容 ⑥ uploadBookmarks 生成 v2.0 ⑦ saveBackupToLocalStorage 处理格式转换 |
| `background.ts` | 后台脚本 | ⑧ downloadBookmarks 解析 v2.0 格式 |

### 数据流全景

```
上传流程:
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ 本地书签数据      │────→│ uploadBookmarks  │────→│ 远程 (Gist/WebDAV)│
│ BookmarkInfo[]   │     │ 创建 SyncData    │     │ v2.0 格式 JSON   │
└──────────────────┘     └──────────────────┘     └──────────────────┘

下载流程:
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ 远程 (Gist/WebDAV)│────→│ downloadBookmarks│────→│ 本地书签树        │
│ v1.0/v2.0 JSON   │     │ 解析为书签数组    │     │ Browser API      │
└──────────────────┘     └──────────────────┘     └──────────────────┘

本地缓存流程:
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ 远程数据备份      │────→│ saveLocalCache   │────→│ browser.storage  │
│ SyncData/v1.0    │     │ 统一为 SyncData  │     │ 本地存储 v2.0    │
└──────────────────┘     └──────────────────┘     └──────────────────┘
```

## 详细修改计划

### 任务 1: models.ts - 更新 SyncData 接口

**位置**: `src/utils/models.ts:280`

**修改内容**:
```typescript
export interface SyncData {
    version: string;                    // 新增: 数据格式版本
    lastSyncTimestamp: number;
    sourceBrowser: BrowserInfo;
    backupRecords: BackupRecord[];
}
```

**影响**:
- 所有创建 SyncData 的地方都需要提供 version
- 所有验证 SyncData 的地方都需要检查 version

---

### 任务 2: localCache.ts - 更新 createEmptyLocalCache

**位置**: `src/utils/localCache.ts:61`

**修改内容**:
```typescript
export function createEmptyLocalCache(): SyncData {
    return {
        version: '2.0',                   // 新增
        lastSyncTimestamp: 0,
        sourceBrowser: { browser: 'Unknown', os: 'Unknown' },
        backupRecords: []
    };
}
```

---

### 任务 3: localCache.ts - 更新 createSyncData

**位置**: `src/utils/localCache.ts:163`

**修改内容**:
```typescript
export function createSyncData(
    bookmarkData: BookmarkInfo[], 
    maxBackups: number = BACKUP_DEFAULTS.MAX_BACKUPS
): SyncData {
    const now = Date.now();
    const backupRecord = createBackupRecord(bookmarkData, now);
    
    return {
        version: '2.0',                   // 新增
        lastSyncTimestamp: now,
        sourceBrowser: getBrowserInfo(),
        backupRecords: [backupRecord].slice(0, maxBackups)
    };
}
```

---

### 任务 4: localCache.ts - 更新 validateSyncData

**位置**: `src/utils/localCache.ts:120`

**修改内容**:
```typescript
export function validateSyncData(data: SyncData): boolean {
    if (!data) {
        return false;
    }
    
    // 新增: 验证 version 字段
    if (typeof data.version !== 'string') {
        return false;
    }
    
    if (typeof data.lastSyncTimestamp !== 'number') {
        return false;
    }
    if (!data.sourceBrowser || typeof data.sourceBrowser.browser !== 'string') {
        return false;
    }
    if (!Array.isArray(data.backupRecords)) {
        return false;
    }
    
    return validateBackupRecords(data.backupRecords);
}
```

**向后兼容处理**:
如果读取到没有 version 字段的旧缓存数据，应该视为无效，重新创建空缓存。

---

### 任务 5: sync.ts - 重写 fetchRemoteData 函数 ✅

**位置**: `src/utils/sync.ts:470`

**状态**: 已完成
- 添加了 type guards: isSyncDataInfo, isSyncData
- 添加了 extractBookmarksFromData 辅助函数
- 版本检测逻辑正确实现

**当前问题**: 直接返回 `SyncDataInfo`，没有版本检测

**修改后逻辑**:
```typescript
async function fetchRemoteData(setting: Setting): Promise<SyncData | SyncDataInfo | null> {
    let content: string | null = null;
    
    // WebDAV 存储
    if (setting.storageType === 'webdav') {
        content = await webdavRead();
    } else {
        // GitHub Gist 存储
        content = await BookmarkService.get();
    }
    
    if (!content) return null;
    
    try {
        const data = JSON.parse(content);
        
        // 版本检测
        if (data.version === '2.0') {
            logger.info('fetchRemoteData: 检测到格式 v2.0');
            return data as SyncData;
        } else if (data.bookmarks && !data.backupRecords) {
            logger.info('fetchRemoteData: 检测到格式 v1.0（旧格式）');
            return data as SyncDataInfo;
        }
        
        logger.warn('fetchRemoteData: 未知数据格式', { keys: Object.keys(data) });
        return null;
    } catch (error) {
        logger.error('fetchRemoteData: 解析远程数据失败', error);
        return null;
    }
}
```

---

### 任务 6: sync.ts - 重写 uploadBookmarks 函数 ✅

**位置**: `src/utils/sync.ts`

**状态**: 已完成
- 生成 v2.0 格式（version: '2.0', backupRecords[]）
- 读取现有远程数据并追加到 backupRecords
- 旧格式自动转换为历史备份记录
- 限制备份数量为 MAX_BACKUPS

**当前问题**: 创建 `SyncDataInfo` 并直接上传，没有 backupRecords

**新逻辑**:
```typescript
async function uploadBookmarks(bookmarks: BookmarkInfo[]): Promise<void> {
    const setting = await Setting.build();
    
    // 1. 获取现有远程数据
    logger.info('uploadBookmarks: 步骤1 - 获取现有远程数据...');
    const existingData = await fetchRemoteData(setting);
    
    // 2. 创建新的备份记录（当前书签）
    logger.info('uploadBookmarks: 步骤2 - 创建新的备份记录...');
    const newRecord: BackupRecord = {
        backupTimestamp: Date.now(),
        bookmarkData: bookmarks,
        bookmarkCount: getBookmarkCount(bookmarks)
    };
    
    // 3. 构建上传数据（新格式 v2.0）
    logger.info('uploadBookmarks: 步骤3 - 构建上传数据（格式 v2.0）...');
    const uploadData: SyncData = {
        version: '2.0',
        lastSyncTimestamp: Date.now(),
        sourceBrowser: getBrowserInfo(),
        backupRecords: [newRecord]
    };
    
    // 4. 处理现有远程数据，追加到上传数据
    if (existingData) {
        const existingVersion = (existingData as any).version;
        
        if (existingVersion === '2.0') {
            // 新格式，直接追加 backupRecords
            const remoteSyncData = existingData as SyncData;
            if (remoteSyncData.backupRecords?.length > 0) {
                uploadData.backupRecords.push(...remoteSyncData.backupRecords);
            }
        } else {
            // 旧格式（v1.0 或无 version），将旧数据作为历史备份
            const oldSyncData = existingData as SyncDataInfo;
            const oldRecord: BackupRecord = {
                backupTimestamp: oldSyncData.createDate || Date.now() - 1000,
                bookmarkData: oldSyncData.bookmarks || [],
                bookmarkCount: getBookmarkCount(oldSyncData.bookmarks || [])
            };
            if (oldRecord.bookmarkCount > 0) {
                uploadData.backupRecords.push(oldRecord);
            }
        }
    }
    
    // 5. 检查备份数量限制（默认3个）
    while (uploadData.backupRecords.length > BACKUP_DEFAULTS.MAX_BACKUPS) {
        uploadData.backupRecords.pop();
    }
    
    // 6. 上传
    logger.info(`uploadBookmarks: 步骤4 - 上传数据（${uploadData.backupRecords.length} 个备份）...`);
    const content = JSON.stringify(uploadData, null, 2);
    
    if (setting.storageType === 'webdav') {
        await webdavWrite(content);
    } else {
        await BookmarkService.update({
            files: { [setting.gistFileName]: { content } },
            description: setting.gistFileName
        });
    }
    
    logger.info('uploadBookmarks: 上传完成（格式 v2.0）');
}
```

---

### 任务 7: sync.ts - 更新 saveBackupToLocalStorage ✅

**位置**: `src/utils/sync.ts`

**状态**: 已完成（代码已包含 `version: '2.0'`）
- 创建的 SyncData 包含 version: '2.0'

**当前问题**: 创建的是 SyncData，但没有 version 字段

**修改内容**:
```typescript
async function saveBackupToLocalStorage(bookmarks: BookmarkInfo[]): Promise<void> {
    try {
        const existingCache = await getLocalCache();
        const localCache = existingCache || createEmptyLocalCache();
        
        const newBackupRecord = createBackupRecord(bookmarks);
        
        // 注意：这里保持原有逻辑，但确保 version 字段存在
        const updatedCache: SyncData = {
            version: '2.0',                   // 确保 version 存在
            lastSyncTimestamp: Date.now(),
            sourceBrowser: localCache.sourceBrowser,
            backupRecords: [newBackupRecord, ...localCache.backupRecords].slice(0, BACKUP_DEFAULTS.MAX_BACKUPS)
        };
        
        await saveLocalCache(updatedCache);
        
        logger.info('saveBackupToLocalStorage: 备份保存成功', {
            bookmarkCount: newBackupRecord.bookmarkCount,
            totalBackups: updatedCache.backupRecords.length
        });
    } catch (error) {
        logger.error('saveBackupToLocalStorage: 备份保存失败', error);
    }
}
```

---

### 任务 8: background.ts - 重写 downloadBookmarks 函数 ✅

**位置**: `src/entrypoints/background.ts`

**状态**: 已完成
- 检测到 `data.version === '2.0'` 从 `backupRecords[0].bookmarkData` 获取
- 检测到 `data.bookmarks` 直接获取（旧格式）
- 添加了 `logger.info` 输出

**当前问题**: 假设远程数据是 `SyncDataInfo` 格式，直接访问 `.bookmarks`

**新逻辑**:
```typescript
async function downloadBookmarks() {
    try {
        const setting = await Setting.build();
        const gist = await BookmarkService.get();
        
        if (!gist) {
            throw createError.fileNotFound(setting.gistFileName);
        }
        
        const data = JSON.parse(gist);
        let bookmarks: BookmarkInfo[];
        
        // 版本检测和格式转换
        if (data.version === '2.0') {
            logger.info('downloadBookmarks: 检测到格式 v2.0');
            const syncData = data as SyncData;
            if (!syncData.backupRecords || syncData.backupRecords.length === 0) {
                throw createError.emptyGistFile(setting.gistFileName);
            }
            // 取最新的备份记录
            bookmarks = syncData.backupRecords[0].bookmarkData;
        } else if (data.bookmarks) {
            logger.info('downloadBookmarks: 检测到格式 v1.0（旧格式）');
            const syncData = data as SyncDataInfo;
            bookmarks = syncData.bookmarks;
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
        await browser.storage.local.set({ 
            [STORAGE_KEYS.REMOTE_COUNT]: count, 
            [STORAGE_KEYS.LOCAL_COUNT]: count 
        });
        
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
```

**注意**: 需要添加新的错误类型 `invalidDataFormat`

---

### 任务 9: errors.ts - 添加新错误类型

**位置**: `src/utils/errors.ts`

**添加内容**:
```typescript
case 'INVALID_DATA_FORMAT':
    return new BookmarkHubError(
        'Invalid data format',
        '远程数据格式无效，无法解析书签数据',
        code
    );
```

并在 `createError` 对象中添加:
```typescript
invalidDataFormat: () => create('INVALID_DATA_FORMAT'),
```

---

### 任务 10: sync.ts - 更新 performSync 中的远程数据处理 ✅

**位置**: `src/utils/sync.ts`

**状态**: 已完成
- 使用 `extractBookmarksFromData(remoteData)` 函数
- 支持两种格式（v1.0 和 v2.0）

**修改内容**:
```typescript
// 3. 获取远程数据
logger.info('performSync: 步骤3 - 获取远程数据...');
const remoteData = await fetchRemoteData(setting);

// 兼容处理：支持 v1.0 和 v2.0 格式
let remoteBookmarks: BookmarkInfo[] = [];
if (remoteData) {
    if ((remoteData as SyncData).version === '2.0') {
        const syncData = remoteData as SyncData;
        remoteBookmarks = syncData.backupRecords?.[0]?.bookmarkData || [];
    } else {
        const oldData = remoteData as SyncDataInfo;
        remoteBookmarks = oldData.bookmarks || [];
    }
}
const remoteCount = getBookmarkCount(remoteBookmarks);
```

---

## 数据迁移策略

### 首次上传（从旧格式迁移）

```
旧格式 Gist: { browser: "...", version: "1.0.0", createDate: ..., bookmarks: [...] }
                    ↓
步骤1: 读取并识别为 v1.0 格式
步骤2: 创建新格式 v2.0
步骤3: 将旧书签数据转换为历史备份记录
步骤4: 上传新格式

新格式 Gist: { 
    version: "2.0",
    lastSyncTimestamp: ...,
    sourceBrowser: { browser: "Chrome", os: "Windows" },
    backupRecords: [
        { 新书签（当前数据） },
        { 旧书签（从 v1.0 转换的历史备份）}
    ]
}
```

### 下载时的向后兼容

```
Gist 数据: { version: "2.0", backupRecords: [...] } 或 { bookmarks: [...] }
                ↓
步骤1: 检测 version 字段
步骤2: 如果是 v2.0，取 backupRecords[0].bookmarkData
步骤3: 如果是 v1.0，取 bookmarks 字段
步骤4: 还原到本地浏览器
```

---

## 潜在风险与对策

### 风险 1: 用户有旧版本扩展创建的 Gist
**对策**: downloadBookmarks 和 fetchRemoteData 都要检测 version，支持 v1.0 和 v2.0

### 风险 2: 本地缓存没有 version 字段
**对策**: validateSyncData 会拒绝无 version 的缓存，自动重新创建空缓存（数据丢失风险低，因为本地缓存只是备份，远程才是主数据）

### 风险 3: 新旧版本扩展混用
**对策**: 
- 新扩展可以读取旧格式的 Gist（向后兼容）
- 新扩展总是写入新格式
- 如果旧扩展读取新格式的 Gist，会失败（这是预期的，促使用户升级）

### 风险 4: merge.ts 使用 SyncDataInfo
**对策**: 检查 merge.ts 是否需要更新以支持 v2.0 格式（当前合并逻辑被注释掉了，暂时不影响）

### 风险 5: 测试文件使用旧格式
**对策**: 更新 merge.test.ts 中的测试数据创建函数

---

## 验证清单

### 编译和测试
- [ ] `npm run compile` 无错误
- [ ] `npm test` 通过（如有测试）
- [ ] `npm run build` 成功

### 功能测试
- [ ] 首次上传（空 Gist）→ 格式 v2.0
- [ ] 第二次上传 → 2 个 backupRecords
- [ ] 第三次上传 → 3 个 backupRecords
- [ ] 第四次上传 → 保持 3 个（最旧被删除）
- [ ] 从旧格式 Gist 上传 → 正确迁移（旧数据变历史备份）
- [ ] 下载 v2.0 格式 Gist → 正常还原书签
- [ ] 下载 v1.0 格式 Gist → 正常还原书签（向后兼容）
- [ ] 本地缓存验证 → 包含 version 字段

### 边界情况
- [ ] Gist 为空/null
- [ ] Gist 包含无法解析的 JSON
- [ ] Gist 包含未知格式数据
- [ ] backupRecords 为空数组
- [ ] 网络中断时上传/下载

---

## 日志输出示例

```
[INFO] uploadBookmarks: 步骤1 - 获取现有远程数据...
[INFO] fetchRemoteData: 检测到格式 v1.0（旧格式）
[INFO] uploadBookmarks: 步骤2 - 创建新的备份记录...
[INFO] uploadBookmarks: 步骤3 - 构建上传数据（格式 v2.0）...
[INFO] uploadBookmarks: 步骤4 - 上传数据（2 个备份）...
[INFO] uploadBookmarks: 上传完成（格式 v2.0）

[INFO] downloadBookmarks: 检测到格式 v2.0
[INFO] downloadBookmarks: 从备份记录还原 9 个书签
```

---

## 预期结果

上传后 Gist 内容:
```json
{
    "version": "2.0",
    "lastSyncTimestamp": 1773844519793,
    "sourceBrowser": { "browser": "Chrome", "os": "Windows" },
    "backupRecords": [
        {
            "backupTimestamp": 1773844519793,
            "bookmarkData": [ /* 当前书签 */ ],
            "bookmarkCount": 9
        }
    ]
}
```

---

## 执行顺序

```
波浪 1 (基础类型 - 可并行):
├── 任务 1: models.ts - SyncData 添加 version
├── 任务 9: errors.ts - 添加 invalidDataFormat 错误
└── 任务 2: localCache.ts - createEmptyLocalCache 添加 version

波浪 2 (本地缓存 - 依赖波浪 1):
├── 任务 3: localCache.ts - createSyncData 添加 version
├── 任务 4: localCache.ts - validateSyncData 验证 version

波浪 3 (远程同步 - 依赖波浪 2):
├── 任务 5: sync.ts - fetchRemoteData 向后兼容
├── 任务 6: sync.ts - uploadBookmarks 生成 v2.0
├── 任务 7: sync.ts - saveBackupToLocalStorage 更新
└── 任务 10: sync.ts - performSync 更新

波浪 4 (后台脚本 - 依赖波浪 3):
└── 任务 8: background.ts - downloadBookmarks 更新

波浪 5 (验证):
├── 编译检查
├── 功能测试
└── 边界情况测试
```
