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
import { handleError, createError } from './errors';
import { logger, logSync } from './logger';
import { mergeBookmarks as mergeBookmarksImpl, ConflictMode as MergeConflictMode, MergeResult } from './merge';
import { STORAGE_KEYS } from './constants';

/**
 * 同步模式类型定义
 * - interval: 定时同步
 * - event: 事件触发同步 (书签变动、浏览器启动)
 * - hybrid: 混合模式 (同时支持定时和事件)
 */
export type SyncMode = 'interval' | 'event' | 'hybrid';

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
 * 事件抑制标志
 * 在同步操作期间抑制书签事件触发，防止递归同步
 */
let isSuppressingEvents: boolean = false;

/**
 * 获取同步锁状态
 * @returns 是否正在同步
 */
export function getIsSyncing(): boolean {
    return isSyncing;
}

/**
 * 获取事件抑制状态
 * @returns 是否正在抑制事件
 */
export function getIsSuppressingEvents(): boolean {
    return isSuppressingEvents;
}

/**
 * 事件监听器引用
 * 用于移除监听器，防止内存泄漏
 * 在同步操作期间检查事件抑制标志，防止递归同步
 */
const syncListeners = {
  onStartup: () => {
    if (!isSuppressingEvents) {
      performSync();
    }
  },
  onCreated: () => {
    if (!isSuppressingEvents) {
      performSync();
    }
  },
  onChanged: () => {
    if (!isSuppressingEvents) {
      performSync();
    }
  },
  onMoved: () => {
    if (!isSuppressingEvents) {
      performSync();
    }
  },
  onRemoved: () => {
    if (!isSuppressingEvents) {
      performSync();
    }
  },
};

/**
 * 监听器注册状态
 * 防止重复注册
 */
let listenersRegistered = false;

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
    if (setting.enableEventSync && !listenersRegistered) {
        // 浏览器启动时同步
        browser.runtime.onStartup.addListener(syncListeners.onStartup);
        
        // 监听书签创建事件
        browser.bookmarks.onCreated.addListener(syncListeners.onCreated);
        
        // 监听书签变更事件
        browser.bookmarks.onChanged.addListener(syncListeners.onChanged);
        
        // 监听书签移动事件
        browser.bookmarks.onMoved.addListener(syncListeners.onMoved);
        
        // 监听书签删除事件
        browser.bookmarks.onRemoved.addListener(syncListeners.onRemoved);
        
        listenersRegistered = true;
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
        clearInterval(syncTimerId);
        syncTimerId = null;
    }
    
    if (listenersRegistered) {
        browser.runtime.onStartup.removeListener(syncListeners.onStartup);
        browser.bookmarks.onCreated.removeListener(syncListeners.onCreated);
        browser.bookmarks.onChanged.removeListener(syncListeners.onChanged);
        browser.bookmarks.onMoved.removeListener(syncListeners.onMoved);
        browser.bookmarks.onRemoved.removeListener(syncListeners.onRemoved);
        listenersRegistered = false;
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
        logSync.skipped('Sync already in progress');
        return {
            direction: 'upload',
            status: 'skipped',
            timestamp: Date.now(),
            localCount: 0,
            remoteCount: 0,
            errorMessage: 'Sync already in progress'
        };
    }
    
    // 设置同步锁和事件抑制标志
    isSyncing = true;
    isSuppressingEvents = true;
    logSync.start();
    
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
        
        // 4. 智能合并书签 (使用 merge.ts 中的实现)
        const mergeResult = mergeBookmarksImpl(
            localBookmarks,
            remoteData,
            setting.conflictMode as MergeConflictMode
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
        
        logSync.success(result.remoteCount);
        
    } catch (error: unknown) {
        // 捕获并记录错误
        const err = handleError(error);
        result.errorMessage = err.message;
        logSync.failed(err.toLogString());
    } finally {
        // 释放同步锁和事件抑制标志
        isSyncing = false;
        isSuppressingEvents = false;
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
 * 保存同步状态到浏览器本地存储
 * 
 * @param result - 同步结果
 */
async function saveSyncStatus(result: SyncResult): Promise<void> {
    await browser.storage.local.set({
        [STORAGE_KEYS.LAST_SYNC_TIME]: result.timestamp,
        lastSyncDirection: result.direction,
        [STORAGE_KEYS.LAST_SYNC_STATUS]: result.status,
        [STORAGE_KEYS.LAST_SYNC_ERROR]: result.errorMessage || '',
        [STORAGE_KEYS.LOCAL_COUNT]: result.localCount,
        [STORAGE_KEYS.REMOTE_COUNT]: result.remoteCount
    });
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
