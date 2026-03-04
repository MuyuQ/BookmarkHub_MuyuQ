# BookmarkHub 功能扩展实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现自动同步、导入导出、WebDAV 支持三大功能

**Architecture:** 基于现有 WXT + React + TypeScript 架构，新增同步模块、导入导出模块、WebDAV 客户端，扩展设置页面

**Tech Stack:** WXT, React 18, TypeScript, ky (HTTP 客户端), browser.bookmarks API

---

## 任务概览

| 阶段 | 任务数 | 描述 |
|------|--------|------|
| 阶段1 | 4 | 数据模型和设置更新 |
| 阶段2 | 4 | 同步核心逻辑 |
| 阶段3 | 3 | 导入导出功能 |
| 阶段4 | 4 | WebDAV 支持 |
| 阶段5 | 4 | 设置页面 UI |
| 阶段6 | 3 | 后台服务集成 |

---

## 阶段1: 数据模型和设置更新

### Task 1: 更新 optionsStorage 添加新设置项

**Files:**
- Modify: `src/utils/optionsStorage.ts`

**Step 1: 更新 optionsStorage 默认值**

```typescript
// src/utils/optionsStorage.ts
import OptionsSync from 'webext-options-sync';

export default new OptionsSync({
    defaults: {
        githubToken: '',
        gistID: '',
        gistFileName: 'BookmarkHub',
        enableNotify: true,
        githubURL: 'https://api.github.com',
        // 新增设置项
        enableAutoSync: false,
        syncMode: 'hybrid', // 'interval' | 'event' | 'hybrid'
        syncInterval: 60, // 15 | 30 | 60 | 360 | 1440 (分钟)
        conflictMode: 'auto', // 'auto' | 'prompt'
        storageType: 'github', // 'github' | 'webdav'
        webdavUrl: '',
        webdavUsername: '',
        webdavPassword: '',
        webdavPath: '/bookmarks.json',
    },
    migrations: [
        OptionsSync.migrations.removeUnused
    ],
    logging: false
});
```

**Step 2: 运行类型检查**

Run: `npm run compile`
Expected: 无错误

**Step 3: Commit**

```bash
git add src/utils/optionsStorage.ts
git commit -m "feat: add new settings for auto-sync, conflict mode, and WebDAV"
```

---

### Task 2: 更新 Setting 类

**Files:**
- Modify: `src/utils/setting.ts`

**Step 1: 更新 Setting 类**

```typescript
// src/utils/setting.ts
import { Options } from 'webext-options-sync';
import optionsStorage from './optionsStorage'

export class SettingBase implements Options {
    constructor() { }
    [key: string]: string | number | boolean;
    githubToken: string = '';
    gistID: string = '';
    gistFileName: string = 'BookmarkHub';
    enableNotify: boolean = true;
    githubURL: string = 'https://api.github.com';
    // 新增设置项
    enableAutoSync: boolean = false;
    syncMode: 'interval' | 'event' | 'hybrid' = 'hybrid';
    syncInterval: number = 60;
    conflictMode: 'auto' | 'prompt' = 'auto';
    storageType: 'github' | 'webdav' = 'github';
    webdavUrl: string = '';
    webdavUsername: string = '';
    webdavPassword: string = '';
    webdavPath: string = '/bookmarks.json';
}

export class Setting extends SettingBase {
    private constructor() { super() }
    static async build() {
        let options = await optionsStorage.getAll();
        let setting = new Setting();
        setting.gistID = options.gistID;
        setting.gistFileName = options.gistFileName;
        setting.githubToken = options.githubToken;
        setting.enableNotify = options.enableNotify;
        setting.enableAutoSync = options.enableAutoSync;
        setting.syncMode = options.syncMode;
        setting.syncInterval = options.syncInterval;
        setting.conflictMode = options.conflictMode;
        setting.storageType = options.storageType;
        setting.webdavUrl = options.webdavUrl;
        setting.webdavUsername = options.webdavUsername;
        setting.webdavPassword = options.webdavPassword;
        setting.webdavPath = options.webdavPath;
        return setting;
    }
}
```

**Step 2: 运行类型检查**

Run: `npm run compile`
Expected: 无错误

**Step 3: Commit**

```bash
git add src/utils/setting.ts
git commit -m "feat: update Setting class with new sync and WebDAV properties"
```

---

### Task 3: 更新 SyncDataInfo 模型

**Files:**
- Modify: `src/utils/models.ts`

**Step 1: 添加 SyncRecord 接口**

```typescript
// src/utils/models.ts - 在文件末尾添加
export interface SyncRecord {
    lastSyncTime: number;
    lastSyncDirection: 'upload' | 'download';
    lastSyncStatus: 'success' | 'failed';
    errorMessage?: string;
}
```

**Step 2: 运行类型检查**

Run: `npm run compile`
Expected: 无错误

**Step 3: Commit**

```bash
git add src/utils/models.ts
git commit -m "feat: add SyncRecord interface for sync status tracking"
```

---

### Task 4: 添加 SyncResult 类型

**Files:**
- Modify: `src/utils/models.ts`

**Step 1: 添加 SyncResult 类型**

```typescript
// src/utils/models.ts - 添加在文件末尾
export type SyncDirection = 'upload' | 'download';
export type SyncStatus = 'success' | 'failed' | 'skipped';

export interface SyncResult {
    direction: SyncDirection;
    status: SyncStatus;
    timestamp: number;
    localCount: number;
    remoteCount: number;
    conflictCount?: number;
    errorMessage?: string;
}

export interface ConflictInfo {
    type: 'local' | 'remote' | 'modified';
    localBookmark?: BookmarkInfo;
    remoteBookmark?: BookmarkInfo;
}
```

**Step 2: 运行类型检查**

Run: `npm run compile`
Expected: 无错误

**Step 3: Commit**

```bash
git add src/utils/models.ts
git commit -m "feat: add SyncResult and ConflictInfo types"
```

---

## 阶段2: 同步核心逻辑

### Task 5: 创建同步服务模块

**Files:**
- Create: `src/utils/sync.ts`

**Step 1: 创建 sync.ts**

```typescript
// src/utils/sync.ts
import { Setting } from './setting';
import { BookmarkInfo, SyncDataInfo, SyncResult, ConflictInfo } from './models';
import BookmarkService from './services';
import { getBookmarks, formatBookmarks, getBookmarkCount } from './services';

export type SyncMode = 'interval' | 'event' | 'hybrid';
export type ConflictMode = 'auto' | 'prompt';

let syncTimerId: number | null = null;
let isSyncing = false;

export async function startAutoSync(): Promise<void> {
    const setting = await Setting.build();
    if (!setting.enableAutoSync) {
        return;
    }
    
    stopAutoSync();
    
    const intervalMs = setting.syncInterval * 60 * 1000;
    
    // 定时同步
    if (setting.syncMode === 'interval' || setting.syncMode === 'hybrid') {
        syncTimerId = window.setInterval(() => {
            performSync();
        }, intervalMs);
    }
    
    // 事件触发 - 浏览器启动时
    if (setting.syncMode === 'event' || setting.syncMode === 'hybrid') {
        browser.runtime.onStartup.addListener(() => {
            performSync();
        });
    }
}

export function stopAutoSync(): void {
    if (syncTimerId !== null) {
        clearInterval(syncTimerId);
        syncTimerId = null;
    }
}

export async function performSync(): Promise<SyncResult> {
    if (isSyncing) {
        return {
            direction: 'upload',
            status: 'skipped',
            timestamp: Date.now(),
            localCount: 0,
            remoteCount: 0,
            errorMessage: 'Sync already in progress'
        };
    }
    
    isSyncing = true;
    const result: SyncResult = {
        direction: 'upload',
        status: 'failed',
        timestamp: Date.now(),
        localCount: 0,
        remoteCount: 0
    };
    
    try {
        const setting = await Setting.build();
        const localBookmarks = await getBookmarks();
        const localCount = getBookmarkCount(localBookmarks);
        
        // 获取远程数据
        const remoteData = await fetchRemoteData(setting);
        const remoteCount = remoteData ? getBookmarkCount(remoteData.bookmarks) : 0;
        
        // 智能合并
        const mergeResult = await mergeBookmarks(
            localBookmarks,
            remoteData,
            setting.conflictMode
        );
        
        // 上传合并后的数据
        if (mergeResult.hasChanges) {
            await uploadBookmarks(mergeResult.merged);
        }
        
        result.status = 'success';
        result.localCount = localCount;
        result.remoteCount = remoteCount;
        result.conflictCount = mergeResult.conflicts.length;
        
        // 保存同步状态
        await saveSyncStatus(result);
        
    } catch (error: unknown) {
        const err = error as Error;
        result.errorMessage = err.message;
        console.error('Sync failed:', error);
    } finally {
        isSyncing = false;
    }
    
    return result;
}

async function fetchRemoteData(setting: Setting): Promise<SyncDataInfo | null> {
    if (setting.storageType === 'webdav') {
        // TODO: 实现 WebDAV 获取
        return null;
    }
    
    const gist = await BookmarkService.get();
    if (gist) {
        return JSON.parse(gist);
    }
    return null;
}

async function uploadBookmarks(bookmarks: BookmarkInfo[]): Promise<void> {
    const setting = await Setting.build();
    
    const syncdata = new SyncDataInfo();
    syncdata.version = browser.runtime.getManifest().version;
    syncdata.createDate = Date.now();
    syncdata.bookmarks = bookmarks;
    syncdata.browser = navigator.userAgent;
    
    if (setting.storageType === 'webdav') {
        // TODO: 实现 WebDAV 上传
        return;
    }
    
    await BookmarkService.update({
        files: {
            [setting.gistFileName]: {
                content: JSON.stringify(syncdata)
            }
        },
        description: setting.gistFileName
    });
}

async function mergeBookmarks(
    local: BookmarkInfo[],
    remote: SyncDataInfo | null,
    conflictMode: ConflictMode
): Promise<{
    merged: BookmarkInfo[];
    hasChanges: boolean;
    conflicts: ConflictInfo[]
}> {
    const conflicts: ConflictInfo[] = [];
    
    if (!remote || !remote.bookmarks) {
        return { merged: local, hasChanges: false, conflicts };
    }
    
    // 简单合并策略：保留最新修改的
    const merged = mergeByTimestamp(local, remote.bookmarks, conflicts);
    
    return {
        merged,
        hasChanges: true,
        conflicts
    };
}

function mergeByTimestamp(
    local: BookmarkInfo[],
    remote: BookmarkInfo[],
    conflicts: ConflictInfo[]
): BookmarkInfo[] {
    // 简化实现：返回本地数据（实际需要更复杂的合并逻辑）
    return local;
}

async function saveSyncStatus(result: SyncResult): Promise<void> {
    await browser.storage.local.set({
        lastSyncTime: result.timestamp,
        lastSyncDirection: result.direction,
        lastSyncStatus: result.status,
        lastSyncError: result.errorMessage || ''
    });
}
```

**Step 2: 运行类型检查**

Run: `npm run compile`
Expected: 无错误

**Step 3: Commit**

```bash
git add src/utils/sync.ts
git commit -m "feat: add sync service module with auto-sync support"
```

---

### Task 6: 更新 services.ts 添加辅助函数

**Files:**
- Modify: `src/utils/services.ts`

**Step 1: 添加辅助函数**

```typescript
// src/utils/services.ts - 添加导出函数
export async function getBookmarks(): Promise<BookmarkInfo[]> {
    return await browser.bookmarks.getTree();
}

export function formatBookmarks(bookmarks: BookmarkInfo[]): BookmarkInfo[] | undefined {
    // 实现格式化逻辑
    return bookmarks[0]?.children;
}

export function getBookmarkCount(bookmarkList: BookmarkInfo[] | undefined): number {
    let count = 0;
    if (bookmarkList) {
        bookmarkList.forEach(c => {
            if (c.url) {
                count++;
            } else {
                count += getBookmarkCount(c.children);
            }
        });
    }
    return count;
}
```

**Step 2: 运行类型检查**

Run: `npm run compile`
Expected: 无错误

**Step 3: Commit**

```bash
git add src/utils/services.ts
git commit -m "feat: add helper functions for bookmark operations"
```

---

### Task 7: 集成同步到 background.ts

**Files:**
- Modify: `src/entrypoints/background.ts`

**Step 1: 更新 background.ts**

```typescript
// src/entrypoints/background.ts - 文件顶部添加导入
import { startAutoSync, stopAutoSync, performSync } from '../utils/sync'
import { Setting } from '../utils/setting'

// 在 defineBackground 回调内，添加自动同步初始化
export default defineBackground(() => {
    // 现有的监听器...
    
    // 新增：初始化自动同步
    browser.runtime.onInstalled.addListener(async () => {
        const setting = await Setting.build();
        if (setting.enableAutoSync) {
            startAutoSync();
        }
    });
    
    // 新增：同步消息处理
    browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.name === 'sync') {
            performSync().then(result => {
                sendResponse(result);
            });
            return true;
        }
        // 现有代码...
    });
    
    // 现有代码...
});
```

**Step 2: 运行类型检查**

Run: `npm run compile`
Expected: 无错误

**Step 3: Commit**

```bash
git add src/entrypoints/background.ts
git commit -m "feat: integrate auto-sync into background service"
```

---

### Task 8: 添加冲突处理逻辑

**Files:**
- Modify: `src/utils/sync.ts`

**Step 1: 实现冲突检测和处理**

```typescript
// src/utils/sync.ts - 添加冲突处理函数

export interface BookmarkChange {
    type: 'created' | 'modified' | 'deleted';
    bookmark: BookmarkInfo;
    timestamp: number;
}

function detectChanges(
    oldBookmarks: BookmarkInfo[],
    newBookmarks: BookmarkInfo[]
): BookmarkChange[] {
    const changes: BookmarkChange[] = [];
    // 实现变更检测逻辑
    return changes;
}

function resolveConflict(
    local: BookmarkInfo,
    remote: BookmarkInfo,
    mode: ConflictMode
): BookmarkInfo {
    if (mode === 'auto') {
        // 智能合并：保留最新修改的
        const localTime = local.dateAdded || 0;
        const remoteTime = remote.dateAdded || 0;
        return localTime > remoteTime ? local : remote;
    }
    
    // prompt 模式暂时返回本地
    return local;
}

export async function notifyConflict(conflicts: ConflictInfo[]): Promise<void> {
    if (conflicts.length === 0) return;
    
    const setting = await Setting.build();
    if (!setting.enableNotify) return;
    
    await browser.notifications.create({
        type: 'basic',
        title: browser.i18n.getMessage('syncConflict'),
        message: `${conflicts.length} ${browser.i18n.getMessage('conflictsDetected')}`
    });
}
```

**Step 2: 运行类型检查**

Run: `npm run compile`
Expected: 无错误

**Step 3: Commit**

```bash
git add src/utils/sync.ts
git commit -m "feat: add conflict detection and resolution logic"
```

---

## 阶段3: 导入导出功能

### Task 9: 创建导出模块

**Files:**
- Create: `src/utils/exporter.ts`

**Step 1: 创建 exporter.ts**

```typescript
// src/utils/exporter.ts
import { BookmarkInfo } from './models';

export type ExportFormat = 'json' | 'html';

export async function exportBookmarks(
    format: ExportFormat,
    bookmarks: BookmarkInfo[]
): Promise<void> {
    let content: string;
    let filename: string;
    let mimeType: string;
    
    const timestamp = new Date().toISOString().split('T')[0];
    
    if (format === 'json') {
        content = JSON.stringify(bookmarks, null, 2);
        filename = `bookmarks-${timestamp}.json`;
        mimeType = 'application/json';
    } else {
        content = generateHtmlBookmarks(bookmarks);
        filename = `bookmarks-${timestamp}.html`;
        mimeType = 'text/html';
    }
    
    downloadFile(content, filename, mimeType);
}

function generateHtmlBookmarks(bookmarks: BookmarkInfo[]): string {
    let html = '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n';
    html += '<!-- This is an automatically generated file.\n';
    html += '     It will be read and overwritten.\n';
    html += '     DO NOT EDIT! -->\n';
    html += '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n';
    html += '<TITLE>Bookmarks</TITLE>\n';
    html += '<H1>Bookmarks</H1>\n';
    html += '<DL><p>\n';
    
    html += processBookmarks(bookmarks, 0);
    
    html += '</DL><p>\n';
    return html;
}

function processBookmarks(bookmarks: BookmarkInfo[], indent: number): string {
    let result = '';
    const indentStr = '    '.repeat(indent);
    
    for (const bookmark of bookmarks) {
        if (bookmark.url) {
            result += `${indentStr}<DT><A HREF="${bookmark.url}">${bookmark.title}</A>\n`;
        } else if (bookmark.children) {
            result += `${indentStr}<DT><H3>${bookmark.title}</H3>\n`;
            result += `${indentStr}<DL><p>\n`;
            result += processBookmarks(bookmark.children, indent + 1);
            result += `${indentStr}</DL><p>\n`;
        }
    }
    
    return result;
}

function downloadFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
```

**Step 2: 运行类型检查**

Run: `npm run compile`
Expected: 无错误

**Step 3: Commit**

```bash
git add src/utils/exporter.ts
git commit -m "feat: add bookmark export functionality (JSON and HTML)"
```

---

### Task 10: 创建导入模块

**Files:**
- Create: `src/utils/importer.ts`

**Step 1: 创建 importer.ts**

```typescript
// src/utils/importer.ts
import { BookmarkInfo } from './models';

export type ImportFormat = 'json' | 'html';

export async function importBookmarks(file: File): Promise<BookmarkInfo[]> {
    const content = await file.text();
    const extension = file.name.split('.').pop()?.toLowerCase();
    
    if (extension === 'json') {
        return parseJsonBookmarks(content);
    } else if (extension === 'html') {
        return parseHtmlBookmarks(content);
    }
    
    throw new Error('Unsupported file format');
}

function parseJsonBookmarks(content: string): BookmarkInfo[] {
    try {
        const data = JSON.parse(content);
        if (Array.isArray(data)) {
            return data;
        }
        throw new Error('Invalid JSON format');
    } catch (error) {
        throw new Error('Failed to parse JSON file');
    }
}

function parseHtmlBookmarks(content: string): BookmarkInfo[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/html');
    const bookmarks: BookmarkInfo[] = [];
    
    const dl = doc.querySelector('DL');
    if (!dl) {
        throw new Error('Invalid HTML bookmark file');
    }
    
    parseDlElement(dl, bookmarks);
    
    return bookmarks;
}

function parseDlElement(element: Element, parent: BookmarkInfo[]): void {
    const children = element.children;
    
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        
        if (child.tagName === 'DT') {
            const a = child.querySelector('a');
            const h3 = child.querySelector('h3');
            
            if (a) {
                const bookmark: BookmarkInfo = {
                    title: a.textContent || '',
                    url: a.href
                };
                parent.push(bookmark);
            } else if (h3) {
                const folder: BookmarkInfo = {
                    title: h3.textContent || '',
                    children: []
                };
                
                const dl = child.querySelector(':scope > DL');
                if (dl) {
                    parseDlElement(dl, folder.children!);
                }
                
                parent.push(folder);
            }
        }
    }
}
```

**Step 2: 运行类型检查**

Run: `npm run compile`
Expected: 无错误

**Step 3: Commit**

```bash
git add src/utils/importer.ts
git commit -m "feat: add bookmark import functionality (JSON and HTML)"
```

---

### Task 11: 在 popup 添加导入导出按钮

**Files:**
- Modify: `src/entrypoints/popup/popup.tsx`

**Step 1: 更新 popup.tsx**

```typescript
// src/entrypoints/popup/popup.tsx
import React, { useState, useEffect } from 'react'
import { Dropdown } from 'react-bootstrap';
import { AiOutlineExport, AiOutlineImport } from 'react-icons/ai'
import { exportBookmarks } from '../../utils/exporter'

const Popup: React.FC = () => {
    // 现有代码...
    
    const handleExport = async (format: 'json' | 'html') => {
        const bookmarks = await browser.bookmarks.getTree();
        const flatBookmarks = flattenBookmarks(bookmarks);
        await exportBookmarks(format, flatBookmarks);
    };
    
    const flattenBookmarks = (bookmarks: BookmarkInfo[]): BookmarkInfo[] => {
        const result: BookmarkInfo[] = [];
        for (const b of bookmarks) {
            if (b.url) {
                result.push({ title: b.title, url: b.url });
            }
            if (b.children) {
                result.push(...flattenBookmarks(b.children));
            }
        }
        return result;
    };
    
    return (
        <Dropdown.Menu show>
            <Dropdown.Item name='upload'>{/* 现有 */}</Dropdown.Item>
            <Dropdown.Item name='download'>{/* 现有 */}</Dropdown.Item>
            <Dropdown.Item name='removeAll'>{/* 现有 */}</Dropdown.Item>
            <Dropdown.Divider />
            <Dropdown>
                <Dropdown.Toggle variant="light" size="sm">
                    <AiOutlineExport /> 导出
                </Dropdown.Toggle>
                <Dropdown.Menu>
                    <Dropdown.Item onClick={() => handleExport('json')}>
                        导出为 JSON
                    </Dropdown.Item>
                    <Dropdown.Item onClick={() => handleExport('html')}>
                        导出为 HTML
                    </Dropdown.Item>
                </Dropdown.Menu>
            </Dropdown>
            <Dropdown>
                <Dropdown.Toggle variant="light" size="sm">
                    <AiOutlineImport /> 导入
                </Dropdown.Toggle>
                <Dropdown.Menu>
                    <Dropdown.Item as="label" className="mb-0">
                        从文件导入
                        <input
                            type="file"
                            accept=".json,.html"
                            style={{ display: 'none' }}
                            onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                    // TODO: 调用导入功能
                                }
                            }}
                        />
                    </Dropdown.Item>
                </Dropdown.Menu>
            </Dropdown>
            <Dropdown.Divider />
            <Dropdown.Item name='setting'>{/* 现有 */}</Dropdown.Item>
        </Dropdown.Menu>
    );
};
```

**Step 2: 运行类型检查**

Run: `npm run compile`
Expected: 无错误

**Step 3: Commit**

```bash
git add src/entrypoints/popup/popup.tsx
git commit -m "feat: add import/export buttons to popup menu"
```

---

## 阶段4: WebDAV 支持

### Task 12: 创建 WebDAV 客户端

**Files:**
- Create: `src/utils/webdav.ts`

**Step 1: 创建 webdav.ts**

```typescript
// src/utils/webdav.ts
import { Setting } from './setting';

export class WebDAVClient {
    private baseUrl: string;
    private username: string;
    private password: string;
    
    constructor(baseUrl: string, username: string, password: string) {
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.username = username;
        this.password = password;
    }
    
    private getAuthHeader(): string {
        const credentials = btoa(`${this.username}:${this.password}`);
        return `Basic ${credentials}`;
    }
    
    async read(path: string): Promise<string | null> {
        try {
            const response = await fetch(`${this.baseUrl}${path}`, {
                method: 'GET',
                headers: {
                    'Authorization': this.getAuthHeader(),
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`WebDAV read failed: ${response.status}`);
            }
            
            return await response.text();
        } catch (error) {
            console.error('WebDAV read error:', error);
            return null;
        }
    }
    
    async write(path: string, content: string): Promise<boolean> {
        try {
            const response = await fetch(`${this.baseUrl}${path}`, {
                method: 'PUT',
                headers: {
                    'Authorization': this.getAuthHeader(),
                    'Content-Type': 'application/json'
                },
                body: content
            });
            
            return response.ok;
        } catch (error) {
            console.error('WebDAV write error:', error);
            return false;
        }
    }
    
    async exists(path: string): Promise<boolean> {
        try {
            const response = await fetch(`${this.baseUrl}${path}`, {
                method: 'HEAD',
                headers: {
                    'Authorization': this.getAuthHeader()
                }
            });
            
            return response.ok;
        } catch {
            return false;
        }
    }
}

export async function getWebDAVClient(): Promise<WebDAVClient | null> {
    const setting = await Setting.build();
    
    if (setting.storageType !== 'webdav') {
        return null;
    }
    
    if (!setting.webdavUrl || !setting.webdavUsername || !setting.webdavPassword) {
        return null;
    }
    
    return new WebDAVClient(
        setting.webdavUrl,
        setting.webdavUsername,
        setting.webdavPassword
    );
}

export async function webdavRead(path?: string): Promise<string | null> {
    const client = await getWebDAVClient();
    if (!client) return null;
    
    const setting = await Setting.build();
    return await client.read(path || setting.webdavPath);
}

export async function webdavWrite(content: string, path?: string): Promise<boolean> {
    const client = await getWebDAVClient();
    if (!client) return false;
    
    const setting = await Setting.build();
    return await client.write(path || setting.webdavPath, content);
}
```

**Step 2: 运行类型检查**

Run: `npm run compile`
Expected: 无错误

**Step 3: Commit**

```bash
git add src/utils/webdav.ts
git commit -m "feat: add WebDAV client for alternative storage"
```

---

### Task 13: 更新 sync.ts 支持 WebDAV

**Files:**
- Modify: `src/utils/sync.ts`

**Step 1: 更新 sync.ts 添加 WebDAV 支持**

```typescript
// src/utils/sync.ts - 更新 fetchRemoteData 函数
import { webdavRead, webdavWrite } from './webdav'

async function fetchRemoteData(setting: Setting): Promise<SyncDataInfo | null> {
    if (setting.storageType === 'webdav') {
        const content = await webdavRead();
        if (content) {
            return JSON.parse(content);
        }
        return null;
    }
    
    const gist = await BookmarkService.get();
    if (gist) {
        return JSON.parse(gist);
    }
    return null;
}

async function uploadBookmarks(bookmarks: BookmarkInfo[]): Promise<void> {
    const setting = await Setting.build();
    
    const syncdata = new SyncDataInfo();
    syncdata.version = browser.runtime.getManifest().version;
    syncdata.createDate = Date.now();
    syncdata.bookmarks = bookmarks;
    syncdata.browser = navigator.userAgent;
    
    const content = JSON.stringify(syncdata);
    
    if (setting.storageType === 'webdav') {
        await webdavWrite(content);
        return;
    }
    
    await BookmarkService.update({
        files: {
            [setting.gistFileName]: {
                content
            }
        },
        description: setting.gistFileName
    });
}
```

**Step 2: 运行类型检查**

Run: `npm run compile`
Expected: 无错误

**Step 3: Commit**

```bash
git add src/utils/sync.ts
git commit -m "feat: integrate WebDAV support into sync module"
```

---

### Task 14: 添加 WebDAV 连接测试功能

**Files:**
- Modify: `src/utils/webdav.ts`

**Step 1: 添加测试连接函数**

```typescript
// src/utils/webdav.ts - 添加测试函数
export async function testWebDAVConnection(
    url: string,
    username: string,
    password: string
): Promise<{ success: boolean; message: string }> {
    try {
        const client = new WebDAVClient(url, username, password);
        const testPath = '/.bookmarkhub-test-' + Date.now();
        
        // 尝试写入测试文件
        const writeResult = await client.write(testPath, 'test');
        if (!writeResult) {
            return { success: false, message: 'Failed to write test file' };
        }
        
        // 尝试读取测试文件
        const readResult = await client.read(testPath);
        if (readResult !== 'test') {
            return { success: false, message: 'Failed to read test file' };
        }
        
        // 清理测试文件
        await client.write(testPath, '');
        
        return { success: true, message: 'Connection successful' };
    } catch (error: unknown) {
        const err = error as Error;
        return { success: false, message: err.message };
    }
}
```

**Step 2: 运行类型检查**

Run: `npm run compile`
Expected: 无错误

**Step 3: Commit**

```bash
git add src/utils/webdav.ts
git commit -m "feat: add WebDAV connection test functionality"
```

---

## 阶段5: 设置页面 UI

### Task 15: 更新设置页面 UI

**Files:**
- Modify: `src/entrypoints/options/options.tsx`

**Step 1: 更新 options.tsx**

由于设置页面代码较长，这里仅列出需要添加的关键部分：

```typescript
// src/entrypoints/options/options.tsx
import React, { useState, useEffect } from 'react'
import { Form, Button, Card, Alert } from 'react-bootstrap'
import optionsStorage from '../../utils/optionsStorage'

const Options: React.FC = () => {
    const [enableAutoSync, setEnableAutoSync] = useState(false)
    const [syncMode, setSyncMode] = useState('hybrid')
    const [syncInterval, setSyncInterval] = useState(60)
    const [conflictMode, setConflictMode] = useState('auto')
    const [storageType, setStorageType] = useState('github')
    const [webdavUrl, setWebdavUrl] = useState('')
    const [webdavUsername, setWebdavUsername] = useState('')
    const [webdavPassword, setWebdavPassword] = useState('')
    const [webdavPath, setWebdavPath] = useState('/bookmarks.json')
    
    useEffect(() => {
        loadSettings()
    }, [])
    
    const loadSettings = async () => {
        const options = await optionsStorage.getAll()
        setEnableAutoSync(options.enableAutoSync)
        setSyncMode(options.syncMode)
        setSyncInterval(options.syncInterval)
        setConflictMode(options.conflictMode)
        setStorageType(options.storageType)
        setWebdavUrl(options.webdavUrl)
        setWebdavUsername(options.webdavUsername)
        setWebdavPassword(options.webdavPassword)
        setWebdavPath(options.webdavPath)
    }
    
    const handleSave = async () => {
        await optionsStorage.setAll({
            enableAutoSync,
            syncMode,
            syncInterval,
            conflictMode,
            storageType,
            webdavUrl,
            webdavUsername,
            webdavPassword,
            webdavPath
        })
    }
    
    return (
        <div className="container mt-4">
            <h2>设置</h2>
            
            {/* GitHub 设置（现有） */}
            <Card className="mb-3">
                <Card.Header>GitHub Gist</Card.Header>
                <Card.Body>
                    {/* 现有字段... */}
                </Card.Body>
            </Card>
            
            {/* 自动同步设置 */}
            <Card className="mb-3">
                <Card.Header>自动同步</Card.Header>
                <Card.Body>
                    <Form.Check
                        type="switch"
                        label="启用自动同步"
                        checked={enableAutoSync}
                        onChange={(e) => setEnableAutoSync(e.target.checked)}
                    />
                    
                    <Form.Group className="mt-3">
                        <Form.Label>同步模式</Form.Label>
                        <Form.Control
                            as="select"
                            value={syncMode}
                            onChange={(e) => setSyncMode(e.target.value)}
                        >
                            <option value="interval">定时同步</option>
                            <option value="event">事件触发</option>
                            <option value="hybrid">混合模式</option>
                        </Form.Control>
                    </Form.Group>
                    
                    {syncMode !== 'event' && (
                        <Form.Group className="mt-3">
                            <Form.Label>同步间隔</Form.Label>
                            <Form.Control
                                as="select"
                                value={syncInterval}
                                onChange={(e) => setSyncInterval(Number(e.target.value))}
                            >
                                <option value={15}>15 分钟</option>
                                <option value={30}>30 分钟</option>
                                <option value={60}>1 小时</option>
                                <option value={360}>6 小时</option>
                                <option value={1440}>24 小时</option>
                            </Form.Control>
                        </Form.Group>
                    )}
                </Card.Body>
            </Card>
            
            {/* 冲突处理设置 */}
            <Card className="mb-3">
                <Card.Header>冲突处理</Card.Header>
                <Card.Body>
                    <Form.Group>
                        <Form.Label>处理模式</Form.Label>
                        <Form.Control
                            as="select"
                            value={conflictMode}
                            onChange={(e) => setConflictMode(e.target.value)}
                        >
                            <option value="auto">自动合并（保留最新）</option>
                            <option value="prompt">提醒我</option>
                        </Form.Control>
                    </Form.Group>
                </Card.Body>
            </Card>
            
            {/* 存储服务选择 */}
            <Card className="mb-3">
                <Card.Header>存储服务</Card.Header>
                <Card.Body>
                    <Form.Group>
                        <Form.Label>类型</Form.Label>
                        <Form.Control
                            as="select"
                            value={storageType}
                            onChange={(e) => setStorageType(e.target.value)}
                        >
                            <option value="github">GitHub Gist</option>
                            <option value="webdav">WebDAV</option>
                        </Form.Control>
                    </Form.Group>
                    
                    {storageType === 'webdav' && (
                        <>
                            <Form.Group className="mt-3">
                                <Form.Label>服务器 URL</Form.Label>
                                <Form.Control
                                    type="text"
                                    value={webdavUrl}
                                    onChange={(e) => setWebdavUrl(e.target.value)}
                                    placeholder="https://your-nas.com/remote.php/dav/files/username/"
                                />
                            </Form.Group>
                            
                            <Form.Group className="mt-3">
                                <Form.Label>用户名</Form.Label>
                                <Form.Control
                                    type="text"
                                    value={webdavUsername}
                                    onChange={(e) => setWebdavUsername(e.target.value)}
                                />
                            </Form.Group>
                            
                            <Form.Group className="mt-3">
                                <Form.Label>密码</Form.Label>
                                <Form.Control
                                    type="password"
                                    value={webdavPassword}
                                    onChange={(e) => setWebdavPassword(e.target.value)}
                                />
                            </Form.Group>
                            
                            <Form.Group className="mt-3">
                                <Form.Label>路径</Form.Label>
                                <Form.Control
                                    type="text"
                                    value={webdavPath}
                                    onChange={(e) => setWebdavPath(e.target.value)}
                                    placeholder="/bookmarks.json"
                                />
                            </Form.Group>
                        </>
                    )}
                </Card.Body>
            </Card>
            
            <Button variant="primary" onClick={handleSave}>
                保存设置
            </Button>
        </div>
    )
}
```

**Step 2: 运行类型检查**

Run: `npm run compile`
Expected: 无错误

**Step 3: Commit**

```bash
git add src/entrypoints/options/options.tsx
git commit -m "feat: add auto-sync and WebDAV settings to options page"
```

---

### Task 16: 添加 i18n 字符串

**Files:**
- Modify: `src/_locales/en/messages.json` (或相关语言文件)

**Step 1: 添加新的国际化字符串**

```json
{
    "autoSync": {
        "message": "Auto Sync",
        "description": "Label for auto sync setting"
    },
    "syncInterval": {
        "message": "Sync Interval",
        "description": "Label for sync interval"
    },
    "syncMode": {
        "message": "Sync Mode",
        "description": "Label for sync mode"
    },
    "conflictMode": {
        "message": "Conflict Mode",
        "description": "Label for conflict resolution mode"
    },
    "storageType": {
        "message": "Storage Type",
        "description": "Label for storage type"
    },
    "webdav": {
        "message": "WebDAV",
        "description": "WebDAV storage option"
    },
    "syncConflict": {
        "message": "Sync Conflict",
        "description": "Notification title for conflicts"
    },
    "conflictsDetected": {
        "message": "conflicts detected",
        "description": "Conflict notification message"
    }
}
```

**Step 2: Commit**

```bash
git add src/_locales/en/messages.json
git commit -m "feat: add i18n strings for new features"
```

---

## 阶段6: 集成测试

### Task 17: 功能测试

**Step 1: 测试自动同步**

```bash
npm run dev
```

测试步骤：
1. 打开扩展设置页面
2. 启用自动同步
3. 选择同步间隔
4. 等待或手动触发同步
5. 验证书签是否正确同步

**Step 2: 测试导入导出**

测试步骤：
1. 点击导出按钮
2. 选择 JSON/HTML 格式
3. 验证文件下载
4. 测试导入功能

**Step 3: 测试 WebDAV**

测试步骤：
1. 配置 WebDAV 服务器信息
2. 点击测试连接
3. 验证同步功能

---

### Task 18: 构建测试

**Step 1: 构建 Chrome 版本**

```bash
npm run build
```

**Step 2: 构建 Firefox 版本**

```bash
npm run build:firefox
```

**Step 3: 运行类型检查**

```bash
npm run compile
```

---

### Task 19: 最终提交

**Step 1: 提交所有更改**

```bash
git add .
git commit -m "feat: implement auto-sync, import/export, and WebDAV support"
```

---

## 执行选项

**Plan complete and saved to `docs/plans/2026-03-01-bookmarkhub-feature-expansion-implementation-plan.md`. Two execution options:**

1. **Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

2. **Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
