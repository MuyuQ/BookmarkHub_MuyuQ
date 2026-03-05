/**
 * BookmarkHub 同步核心模块
 * 
 * 提供自动同步功能的核心逻辑，包括:
 * - 自动同步的启动和停止
 * - 同步执行流程
 * - 远程数据获取 (支持 GitHub Gist 和 WebDAV)
 * - 书签合并和冲突处理
 * - 同步状态保存
 */

import { Setting } from './setting';
import { BookmarkInfo, SyncDataInfo, SyncResult, ConflictInfo } from './models';
import BookmarkService from './services';
import { getBookmarks } from './services';
import { formatBookmarks, getBookmarkCount } from './bookmarkUtils';
import { webdavRead, webdavWrite } from './webdav';

/**
 * 同步模式类型定义
 * - interval: 定时同步
 * - event: 事件触发同步 (书签变动、浏览器启动)
 * - hybrid: 混合模式 (同时支持定时和事件)
 */
export type SyncMode = 'interval' | 'event' | 'hybrid';

/**
 * 冲突处理模式类型定义
 * - auto: 自动合并 (保留最新修改的)
 * - prompt: 弹窗提醒用户
 */
export type ConflictMode = 'auto' | 'prompt';

/**
 * 定时同步的 timer ID
 * 用于停止定时同步
 */
let syncTimerId: ReturnType<typeof setInterval> | null = null;

/**
 * 同步锁
 * 防止同时进行多次同步操作
 */
let isSyncing: boolean = false;

/**
 * 启动自动同步
 * 根据设置中的配置启动相应的同步机制
 * 
 * 执行逻辑:
 * 1. 检查是否启用了自动同步
 * 2. 停止现有的定时器
 * 3. 根据同步模式启动定时同步和/或事件监听
 * 
 * @see stopAutoSync 停止自动同步
 */
export async function startAutoSync(): Promise<void> {
    // 获取设置
    const setting = await Setting.build();
    
    // 如果未启用自动同步，直接返回
    if (!setting.enableAutoSync) {
        return;
    }
    
    // 先停止现有的定时器，避免重复启动
    stopAutoSync();
    
    // 计算同步间隔 (毫秒)
    const intervalMs = setting.syncInterval * 60 * 1000;
    
    // 定时同步模式
    if (setting.enableIntervalSync) {
        // 设置定时器，按间隔执行同步
        syncTimerId = setInterval(() => {
            performSync();
        }, intervalMs);
    }
    
    // 事件触发模式
    if (setting.enableEventSync) {
        // 浏览器启动时同步
        browser.runtime.onStartup.addListener(() => {
            performSync();
        });
        
        // 监听书签创建事件
        browser.bookmarks.onCreated.addListener(() => {
            performSync();
        });
        
        // 监听书签变更事件
        browser.bookmarks.onChanged.addListener(() => {
            performSync();
        });
        
        // 监听书签移动事件
        browser.bookmarks.onMoved.addListener(() => {
            performSync();
        });
        
        // 监听书签删除事件
        browser.bookmarks.onRemoved.addListener(() => {
            performSync();
        });
    }
}

/**
 * 停止自动同步
 * 清除定时器，停止自动同步
 * 
 * @see startAutoSync 启动自动同步
 */
export function stopAutoSync(): void {
    if (syncTimerId !== null) {
        // 清除定时器
        clearInterval(syncTimerId);
        syncTimerId = null;
    }
}

/**
 * 执行同步操作
 * 同步流程:
 * 1. 检查是否正在同步 (防止重复)
 * 2. 获取本地和远程书签数据
 * 3. 智能合并数据
 * 4. 上传合并后的数据
 * 5. 保存同步状态
 * 
 * @returns Promise<SyncResult> 同步结果
 */
export async function performSync(): Promise<SyncResult> {
    // 如果正在同步，跳过这次操作
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
    
    // 设置同步锁
    isSyncing = true;
    
    // 初始化结果对象
    const result: SyncResult = {
        direction: 'upload',
        status: 'failed',
        timestamp: Date.now(),
        localCount: 0,
        remoteCount: 0
    };
    
    try {
        // 1. 获取设置
        const setting = await Setting.build();
        
        // 2. 获取本地书签
        const localBookmarks = await getBookmarks();
        const localCount = getBookmarkCount(localBookmarks);
        
        // 3. 获取远程数据
        const remoteData = await fetchRemoteData(setting);
        const remoteCount = remoteData ? getBookmarkCount(remoteData.bookmarks) : 0;
        
        // 4. 智能合并书签
        const mergeResult = await mergeBookmarks(
            localBookmarks,
            remoteData,
            setting.conflictMode
        );
        
        // 5. 如果有变更，上传合并后的数据
        if (mergeResult.hasChanges) {
            await uploadBookmarks(mergeResult.merged);
        }
        
        // 6. 设置成功状态和统计
        result.status = 'success';
        result.localCount = localCount;
        // 上传成功后，远程数量 = 合并后的数量
        result.remoteCount = getBookmarkCount(mergeResult.merged);
        result.conflictCount = mergeResult.conflicts.length;
        
        // 7. 保存同步状态
        await saveSyncStatus(result);
        
        // 8. 通知 popup 刷新数量显示
        try {
            browser.runtime.sendMessage({ name: 'refreshCounts' });
        } catch (e) {
            // popup 可能未打开，忽略错误
        }
        
    } catch (error: unknown) {
        // 捕获并记录错误
        const err = error as Error;
        result.errorMessage = err.message;
        console.error('Sync failed:', error);
    } finally {
        // 释放同步锁
        isSyncing = false;
    }
    
    return result;
}

/**
 * 获取远程数据
 * 根据存储类型从 GitHub Gist 或 WebDAV 获取数据
 * 
 * @param setting - 用户设置
 * @returns Promise<SyncDataInfo | null> 远程同步数据
 */
async function fetchRemoteData(setting: Setting): Promise<SyncDataInfo | null> {
    // WebDAV 存储
    if (setting.storageType === 'webdav') {
        const content = await webdavRead();
        if (content) {
            return JSON.parse(content);
        }
        return null;
    }
    
    // GitHub Gist 存储
    const gist = await BookmarkService.get();
    if (gist) {
        return JSON.parse(gist);
    }
    return null;
}

/**
 * 上传书签数据
 * 根据存储类型上传到 GitHub Gist 或 WebDAV
 * 
 * @param bookmarks - 要上传的书签数据
 */
async function uploadBookmarks(bookmarks: BookmarkInfo[]): Promise<void> {
    const setting = await Setting.build();
    
    // 创建同步数据对象
    const syncdata = new SyncDataInfo();
    syncdata.version = browser.runtime.getManifest().version;
    syncdata.createDate = Date.now();
    syncdata.bookmarks = bookmarks;
    syncdata.browser = navigator.userAgent;
    
    // 序列化为 JSON
    const content = JSON.stringify(syncdata);
    
    // 根据存储类型选择上传方式
    if (setting.storageType === 'webdav') {
        // WebDAV 上传
        await webdavWrite(content);
        return;
    }
    
    // GitHub Gist 上传
    await BookmarkService.update({
        files: {
            [setting.gistFileName]: {
                content
            }
        },
        description: setting.gistFileName
    });
}

/**
 * 合并书签
 * 智能合并本地和远程书签数据
 * 
 * @param local - 本地书签
 * @param remote - 远程同步数据
 * @param conflictMode - 冲突处理模式
 * @returns 合并结果 { merged, hasChanges, conflicts }
 */
async function mergeBookmarks(
    local: BookmarkInfo[],
    remote: SyncDataInfo | null,
    conflictMode: ConflictMode
): Promise<{
    merged: BookmarkInfo[];
    hasChanges: boolean;
    conflicts: ConflictInfo[]
}> {
    // 冲突列表
    const conflicts: ConflictInfo[] = [];
    
    // 如果没有远程数据，直接返回本地数据
    if (!remote || !remote.bookmarks) {
        return { merged: local, hasChanges: false, conflicts };
    }
    
    // 按时间戳合并
    const merged = mergeByTimestamp(local, remote.bookmarks, conflicts);
    
    return {
        merged,
        hasChanges: true,
        conflicts
    };
}

/**
 * 按时间戳合并
 * 简化的合并逻辑 (当前版本直接返回本地数据)
 * 
 * TODO: 实现更复杂的合并逻辑
 * - 检测新增书签
 * - 检测删除书签
 * - 检测修改书签
 * - 根据时间戳解决冲突
 * 
 * @param local - 本地书签
 * @param remote - 远程书签
 * @param conflicts - 冲突列表
 * @returns 合并后的书签
 */
function mergeByTimestamp(
    local: BookmarkInfo[],
    remote: BookmarkInfo[],
    conflicts: ConflictInfo[]
): BookmarkInfo[] {
    // 当前实现: 直接返回本地数据
    // 后续可实现更复杂的合并逻辑
    return local;
}

/**
 * 保存同步状态到浏览器本地存储
 * 
 * @param result - 同步结果
 */
async function saveSyncStatus(result: SyncResult): Promise<void> {
    await browser.storage.local.set({
        lastSyncTime: result.timestamp,
        lastSyncDirection: result.direction,
        lastSyncStatus: result.status,
        lastSyncError: result.errorMessage || '',
        localCount: result.localCount,
        remoteCount: result.remoteCount
    });
}

/**
 * 书签变更记录
 * 用于追踪书签的变化
 */
export interface BookmarkChange {
    /** 变更类型 */
    type: 'created' | 'modified' | 'deleted';
    /** 变更的书签 */
    bookmark: BookmarkInfo;
    /** 变更时间戳 */
    timestamp: number;
}

/**
 * 检测书签变更
 * 预留的变更检测函数
 * 
 * TODO: 实现完整的变更检测逻辑
 * 
 * @param oldBookmarks - 旧书签数据
 * @param newBookmarks - 新书签数据
 * @returns 变更列表
 */
function detectChanges(
    oldBookmarks: BookmarkInfo[],
    newBookmarks: BookmarkInfo[]
): BookmarkChange[] {
    const changes: BookmarkChange[] = [];
    // TODO: 实现变更检测
    return changes;
}

/**
 * 解决冲突
 * 根据冲突模式解决本地和远程的冲突
 * 
 * @param local - 本地书签
 * @param remote - 远程书签
 * @param mode - 冲突处理模式
 * @returns 解决后的书签
 */
function resolveConflict(
    local: BookmarkInfo,
    remote: BookmarkInfo,
    mode: ConflictMode
): BookmarkInfo {
    // 自动模式: 保留最新修改的
    if (mode === 'auto') {
        const localTime = local.dateAdded || 0;
        const remoteTime = remote.dateAdded || 0;
        return localTime > remoteTime ? local : remote;
    }
    
    // 默认返回本地数据
    return local;
}

/**
 * 发送冲突通知
 * 当检测到冲突时，发送系统通知
 * 
 * @param conflicts - 冲突列表
 */
export async function notifyConflict(conflicts: ConflictInfo[]): Promise<void> {
    // 没有冲突则跳过
    if (conflicts.length === 0) return;
    
    // 获取设置，检查是否启用通知
    const setting = await Setting.build();
    if (!setting.enableNotify) return;
    
    // 发送系统通知
    await browser.notifications.create({
        type: 'basic',
        iconUrl: '../assets/icon.png',
        title: 'Sync Conflict',
        message: `${conflicts.length} conflicts detected`
    });
}
