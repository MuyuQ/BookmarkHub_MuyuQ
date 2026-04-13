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
import { BookmarkInfo, SyncDataInfo, SyncResult, ConflictInfo, SyncData, BackupRecord, Tombstone } from './models';
import BookmarkService from './services';
import { getBookmarks } from './services';
import { formatBookmarks, getBookmarkCount, normalizeBookmarkIds } from './bookmarkUtils';
import { webdavRead, webdavWrite } from './webdav';
import { handleError, createError } from './errors';
import { logger, logSync } from './logger';
import { threeWayMerge, ThreeWayMergeResult, ConflictMode as MergeConflictMode } from './merge';
import { STORAGE_KEYS, BACKUP_STORAGE_KEYS, BACKUP_DEFAULTS, MV3_CONFIG } from './constants';
import { Bookmarks } from 'wxt/browser';
import { getLocalCache, saveLocalCache } from './localCache';
import { syncDebouncer } from './debounce';

/**
 * 同步模式类型定义
 * - interval: 定时同步
 * - event: 事件触发同步 (书签变动、浏览器启动)
 * - hybrid: 混合模式 (同时支持定时和事件)
 */
export type SyncMode = 'interval' | 'event' | 'hybrid';

/**
 * 同步锁状态 (持久化到 storage 以支持 MV3 Service Worker 休眠恢复)
 */
interface SyncState {
    isSyncing: boolean;
    isSuppressingEvents: boolean;
    timestamp: number;
}

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
    logger.info('>>> syncListeners.onStartup 触发');
    logger.info(`onStartup: isSuppressingEvents=${isSuppressingEvents}`);
    if (!isSuppressingEvents) {
      logger.info('onStartup: 调用 syncDebouncer.triggerSync()');
      syncDebouncer.triggerSync().catch(err => logger.error('onStartup sync failed', err));
    } else {
      logger.info('onStartup: 跳过，事件正在被抑制');
    }
  },
  onCreated: (id: string, bookmark: Bookmarks.BookmarkTreeNode) => {
    logger.info('>>> syncListeners.onCreated 触发', { id, title: bookmark.title, url: bookmark.url });
    logger.info(`onCreated: isSuppressingEvents=${isSuppressingEvents}, isSyncing=${isSyncing}`);
    if (!isSuppressingEvents) {
      logger.info('onCreated: 调用 syncDebouncer.triggerSync()');
      syncDebouncer.triggerSync().catch(err => logger.error('onCreated sync failed', err));
    } else {
      logger.info('onCreated: 跳过，事件正在被抑制');
    }
  },
  onChanged: (id: string, changeInfo: Bookmarks.OnChangedChangeInfoType) => {
    logger.info('>>> syncListeners.onChanged 触发', { id, changeInfo });
    logger.info(`onChanged: isSuppressingEvents=${isSuppressingEvents}, isSyncing=${isSyncing}`);
    if (!isSuppressingEvents) {
      logger.info('onChanged: 调用 syncDebouncer.triggerSync()');
      syncDebouncer.triggerSync().catch(err => logger.error('onChanged sync failed', err));
    } else {
      logger.info('onChanged: 跳过，事件正在被抑制');
    }
  },
  onMoved: (id: string, moveInfo: Bookmarks.OnMovedMoveInfoType) => {
    logger.info('>>> syncListeners.onMoved 触发', { id, moveInfo });
    logger.info(`onMoved: isSuppressingEvents=${isSuppressingEvents}, isSyncing=${isSyncing}`);
    if (!isSuppressingEvents) {
      logger.info('onMoved: 调用 syncDebouncer.triggerSync()');
      syncDebouncer.triggerSync().catch(err => logger.error('onMoved sync failed', err));
    } else {
      logger.info('onMoved: 跳过，事件正在被抑制');
    }
  },
  onRemoved: (id: string, removeInfo: Bookmarks.OnRemovedRemoveInfoType) => {
    logger.info('>>> syncListeners.onRemoved 触发', { id, removeInfo });
    logger.info(`onRemoved: isSuppressingEvents=${isSuppressingEvents}, isSyncing=${isSyncing}`);
    if (!isSuppressingEvents) {
      logger.info('onRemoved: 调用 syncDebouncer.triggerSync()');
      syncDebouncer.triggerSync().catch(err => logger.error('onRemoved sync failed', err));
    } else {
      logger.info('onRemoved: 跳过，事件正在被抑制');
    }
  },
};

/**
 * 监听器注册状态
 * 防止重复注册
 */
let listenersRegistered = false;

/**
 * 持久化同步状态 (MV3 Service Worker 休眠恢复)
 */
async function saveSyncState(): Promise<void> {
    try {
        const state: SyncState = {
            isSyncing,
            isSuppressingEvents,
            timestamp: Date.now(),
        };
        await browser.storage.local.set({ [BACKUP_STORAGE_KEYS.SYNC_STATE_KEY]: state });
    } catch (error) {
        logger.error('saveSyncState failed', error);
    }
}

/**
 * 恢复同步状态 (MV3 Service Worker 唤醒时调用)
 */
async function restoreSyncState(): Promise<void> {
    try {
        const result = await browser.storage.local.get(BACKUP_STORAGE_KEYS.SYNC_STATE_KEY);
        const state = result[BACKUP_STORAGE_KEYS.SYNC_STATE_KEY] as SyncState | undefined;
        if (state) {
            // 如果状态超过 5 分钟，认为是过期的 (Service Worker 休眠后)
            if (Date.now() - state.timestamp > 5 * 60 * 1000) {
                isSyncing = false;
                isSuppressingEvents = false;
                logger.info('restoreSyncState: Cleared stale sync state');
            } else {
                isSyncing = state.isSyncing;
                isSuppressingEvents = state.isSuppressingEvents;
                logger.info('restoreSyncState: Restored sync state', { isSyncing, isSuppressingEvents });
            }
        }
    } catch (error) {
        logger.error('restoreSyncState failed', error);
    }
}

/**
 * 清除持久化同步状态
 */
async function clearSyncState(): Promise<void> {
    try {
        await browser.storage.local.remove(BACKUP_STORAGE_KEYS.SYNC_STATE_KEY);
    } catch (error) {
        logger.error('clearSyncState failed', error);
    }
}

/**
 * 启动自动同步
 * 根据设置中的配置启动相应的同步机制
 * 
 * 执行逻辑:
 * 1. 检查是否启用了自动同步
 * 2. 停止现有的定时器和 Alarm
 * 3. 根据同步模式启动定时同步和/或事件监听
 * 
 * @see stopAutoSync 停止自动同步
 */
export async function startAutoSync(): Promise<void> {
    // 恢复持久化状态 (MV3 Service Worker 休眠恢复)
    await restoreSyncState();

    // 获取设置
    const setting = await Setting.build();
    
    // ========== 诊断日志 START ==========
    logger.info('========== startAutoSync 被调用 ==========');
    logger.info('startAutoSync: 设置状态', {
        enableAutoSync: setting.enableAutoSync,
        enableIntervalSync: setting.enableIntervalSync,
        enableEventSync: setting.enableEventSync,
        syncInterval: setting.syncInterval,
        listenersRegistered,
        isSyncing,
        isSuppressingEvents
    });
    // ========== 诊断日志 END ==========
    
    // 如果未启用自动同步，直接返回
    if (!setting.enableAutoSync) {
        logger.info('startAutoSync: 自动同步未启用，直接返回');
        return;
    }
    
    // 先停止现有的定时器和 Alarm，避免重复启动
    stopAutoSync();
    
    // 配置防抖器
    syncDebouncer.setSyncCallback(async () => {
        await performSync().catch(err => logger.error('syncDebouncer callback failed', err));
    });
    syncDebouncer.updateConfig({
        debounceTime: BACKUP_DEFAULTS.DEBOUNCE_TIME,
        maxWaitTime: BACKUP_DEFAULTS.MAX_WAIT_TIME,
    });
    
    // 定时同步模式 - 使用 Alarm API (MV3 兼容)
    if (setting.enableIntervalSync) {
        const intervalMinutes = setting.syncInterval / 60; // 转换为分钟
        if (browser.alarms) {
            browser.alarms.create(MV3_CONFIG.SYNC_ALARM_NAME, {
                periodInMinutes: Math.max(intervalMinutes, 1), // Alarm API 最小间隔 1 分钟
            });
        }
        logger.info(`startAutoSync: 定时同步已启动 (Alarm)，间隔 ${setting.syncInterval} 分钟`);
    } else {
        logger.info('startAutoSync: 定时同步未启用');
    }
    
    // 事件触发模式
    if (setting.enableEventSync && !listenersRegistered) {
        logger.info('startAutoSync: 开始注册事件监听器...');
        
        // 浏览器启动时同步
        browser.runtime.onStartup.addListener(syncListeners.onStartup);
        logger.info('startAutoSync: onStartup 监听器已注册');
        
        // 监听书签创建事件
        browser.bookmarks.onCreated.addListener(syncListeners.onCreated);
        logger.info('startAutoSync: bookmarks.onCreated 监听器已注册');
        
        // 监听书签变更事件
        browser.bookmarks.onChanged.addListener(syncListeners.onChanged);
        logger.info('startAutoSync: bookmarks.onChanged 监听器已注册');
        
        // 监听书签移动事件
        browser.bookmarks.onMoved.addListener(syncListeners.onMoved);
        logger.info('startAutoSync: bookmarks.onMoved 监听器已注册');
        
        // 监听书签删除事件
        browser.bookmarks.onRemoved.addListener(syncListeners.onRemoved);
        logger.info('startAutoSync: bookmarks.onRemoved 监听器已注册');
        
        listenersRegistered = true;
        logger.info('startAutoSync: 所有事件监听器注册完成，listenersRegistered = true');
    } else if (!setting.enableEventSync) {
        logger.info('startAutoSync: 事件同步未启用 (enableEventSync = false)');
    } else if (listenersRegistered) {
        logger.info('startAutoSync: 监听器已注册，跳过重复注册');
    }
    
    logger.info('========== startAutoSync 完成 ==========');
}

/**
 * 停止自动同步
 * 清除定时器和 Alarm，停止自动同步
 * 
 * @see startAutoSync 启动自动同步
 */
export function stopAutoSync(): void {
    logger.info('========== stopAutoSync 被调用 ==========');
    logger.info(`stopAutoSync: listenersRegistered=${listenersRegistered}`);
    
    // 清除 Alarm (MV3 兼容)
    if (browser.alarms) {
        browser.alarms.clear(MV3_CONFIG.SYNC_ALARM_NAME).then(cleared => {
            if (cleared) {
                logger.info('stopAutoSync: Alarm 已清除');
            }
        });
    }
    
    // 取消防抖器
    syncDebouncer.cancel();
    
    if (listenersRegistered) {
        logger.info('stopAutoSync: 移除事件监听器...');
        browser.runtime.onStartup.removeListener(syncListeners.onStartup);
        browser.bookmarks.onCreated.removeListener(syncListeners.onCreated);
        browser.bookmarks.onChanged.removeListener(syncListeners.onChanged);
        browser.bookmarks.onMoved.removeListener(syncListeners.onMoved);
        browser.bookmarks.onRemoved.removeListener(syncListeners.onRemoved);
        listenersRegistered = false;
        logger.info('stopAutoSync: 所有事件监听器已移除');
    }
    logger.info('========== stopAutoSync 完成 ==========');
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
    logger.info('========== performSync 开始 ==========');
    logger.info(`performSync: isSyncing=${isSyncing}, isSuppressingEvents=${isSuppressingEvents}`);
    
    // 如果正在同步，跳过这次操作
    if (isSyncing) {
        logSync.skipped('Sync already in progress');
        logger.info('performSync: 已有同步进行中，跳过');
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
    logger.info('performSync: 设置同步锁 isSyncing=true, isSuppressingEvents=true');
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
        logger.info('performSync: 步骤1 - 获取设置...');
        const setting = await Setting.build();
        logger.info('performSync: 设置获取成功', {
            storageType: setting.storageType,
            enableAutoSync: setting.enableAutoSync,
            conflictMode: setting.conflictMode,
            hasGithubToken: !!setting.githubToken,
            hasGistID: !!setting.gistID
        });
        
        // 2. 获取本地书签
        logger.info('performSync: 步骤2 - 获取本地书签...');
        const localBookmarks = await getBookmarks();
        const localCount = getBookmarkCount(localBookmarks);
        logger.info(`performSync: 本地书签获取成功，共 ${localCount} 个`);
        
        // 3. 获取远程数据
        logger.info('performSync: 步骤3 - 获取远程数据...');
        const remoteData = await fetchRemoteData(setting);
        let remoteBookmarks: BookmarkInfo[] = [];
        if (remoteData) {
            remoteBookmarks = extractBookmarksFromData(remoteData) || [];
        }
        const remoteCount = getBookmarkCount(remoteBookmarks);
        logger.info(`performSync: 远程数据获取成功，共 ${remoteCount} 个书签`, { hasRemoteData: !!remoteData });
        
        // 4. 标准化 ID - 确保本地和远程使用相同的稳定 ID
        logger.info('performSync: 步骤4 - 标准化书签ID...');
        normalizeBookmarkIds(localBookmarks);
        logger.info('performSync: 本地书签ID标准化完成');
        if (remoteBookmarks) {
            normalizeBookmarkIds(remoteBookmarks);
            logger.info('performSync: 远程书签ID标准化完成');
        }
        
        // 5. 获取本地缓存作为基准点（baseline）
        logger.info('performSync: 步骤5 - 获取本地缓存作为基准点...');
        const localCache = await getLocalCache();
        const baseline = localCache?.backupRecords?.[0]?.bookmarkData || null;
        const localTombstones = localCache?.tombstones || [];
        logger.info('performSync: 基准点获取完成', {
            hasBaseline: !!baseline,
            baselineCount: baseline ? getBookmarkCount(baseline) : 0,
            localTombstones: localTombstones.length
        });

        // 6. 提取远程墓碑（如果是 v2.0 格式）
        const remoteTombstones = (remoteData && isSyncData(remoteData))
            ? (remoteData as SyncData).tombstones || []
            : [];
        logger.info('performSync: 远程墓碑提取完成', { remoteTombstones: remoteTombstones.length });

        // 7. 执行三向合并
        logger.info('performSync: 步骤7 - 执行三向合并...');
        const mergeResult = threeWayMerge({
            baseline,
            local: localBookmarks,
            remote: remoteBookmarks,
            localTombstones,
            remoteTombstones,
            conflictMode: setting.conflictMode as MergeConflictMode
        });
        logger.info('performSync: 三向合并完成', {
            hasChanges: mergeResult.hasChanges,
            mergedCount: getBookmarkCount(mergeResult.merged),
            conflictCount: mergeResult.conflicts.length,
            tombstoneCount: mergeResult.tombstones.length,
            changeSummary: mergeResult.changeSummary
        });

        // 8. 如果有变更，上传合并后的数据
        if (mergeResult.hasChanges) {
            logger.info('performSync: 步骤8 - 有变更，上传合并后的数据...');
            await uploadBookmarks(mergeResult.merged, mergeResult.tombstones);
            logger.info('performSync: 上传完成');
        } else {
            logger.info('performSync: 步骤8 - 无变更，跳过上传');
        }

        // 9. 更新本地缓存为新基准点
        logger.info('performSync: 步骤9 - 更新本地缓存为新基准点...');
        const newCache: SyncData = {
            version: '2.0',
            lastSyncTimestamp: Date.now(),
            sourceBrowser: {
                browser: getBrowserName(navigator.userAgent),
                os: getOsFromUserAgent(navigator.userAgent)
            },
            backupRecords: [{
                backupTimestamp: Date.now(),
                bookmarkData: mergeResult.merged,
                bookmarkCount: getBookmarkCount(mergeResult.merged)
            }],
            tombstones: mergeResult.tombstones
        };
        await saveLocalCache(newCache);
        logger.info('performSync: 本地缓存更新完成');

        // 10. 设置成功状态和统计
        result.status = 'success';
        result.localCount = localCount;
        result.remoteCount = getBookmarkCount(mergeResult.merged);
        result.conflictCount = mergeResult.conflicts.length;
        logger.info('performSync: 步骤10 - 设置成功状态', result);

        // 11. 保存同步状态
        logger.info('performSync: 步骤11 - 保存同步状态...');
        await saveSyncStatus(result);
        logger.info('performSync: 同步状态保存完成');

        // 12. 通知 popup 刷新数量显示
        logger.info('performSync: 步骤12 - 通知 popup 刷新...');
        try {
            await browser.runtime.sendMessage({ name: 'refreshCounts' });
            logger.info('performSync: popup 通知发送成功');
        } catch (e) {
            logger.info('performSync: popup 未打开，忽略通知错误');
        }

        logSync.success(result.remoteCount);
        logger.info('========== performSync 成功完成 ==========');
        
    } catch (error: unknown) {
        // 捕获并记录错误
        logger.error('performSync: 发生错误', error);
        const err = handleError(error);
        result.errorMessage = err.message;
        logSync.failed(err.toLogString());
        logger.error('========== performSync 失败 ==========');
    } finally {
        // 释放同步锁和事件抑制标志
        isSyncing = false;
        isSuppressingEvents = false;
        logger.info(`performSync: 释放同步锁 isSyncing=false, isSuppressingEvents=false`);
        // 持久化状态 (MV3 Service Worker 休眠恢复)
        await saveSyncState();
    }
    
    return result;
}

/**
 * Type guard to check if data is in the v1.0 format (SyncDataInfo)
 * @param obj - The data object to check
 */
function isSyncDataInfo(obj: unknown): obj is SyncDataInfo {
    if (obj == null || typeof obj !== 'object') return false;
    if ('version' in obj && (obj as Record<string, unknown>).version === '2.0') return false;
    return 'bookmarks' in obj && Array.isArray((obj as Record<string, unknown>).bookmarks);
}

/**
 * Type guard to check if data is in the v2.0 format (SyncData)
 * @param obj - The data object to check
 */
function isSyncData(obj: unknown): obj is SyncData {
    return obj != null &&
           typeof obj === 'object' &&
           'version' in obj && 
           obj.version === '2.0';
}

/**
 * Helper to extract bookmark data regardless of version format
 * For v2.0, extracts from the most recent backup record
 * @param data - SyncData or SyncDataInfo object
 * @returns BookmarkInfo[] or undefined if not available
 */
function extractBookmarksFromData(data: SyncData | SyncDataInfo | null): BookmarkInfo[] | undefined {
    if (!data) return undefined;

    if (isSyncData(data)) {
        // It's v2.0 format - get bookmarks from the most recent backup record
        if (data.backupRecords && data.backupRecords.length > 0) {
            return data.backupRecords[0].bookmarkData;
        }
        return undefined;
    } else if (isSyncDataInfo(data)) {
        // It's v1.0 format - get bookmarks directly
        return data.bookmarks;
    }

    return undefined;
}

/**
 * 获取远程同步数据
 * 根据存储类型从 GitHub Gist 或 WebDAV 获取数据
 * 支持检测 v1.0 和 v2.0 数据格式
 * 
 * @param setting - 用户设置
 * @returns Promise<SyncData | SyncDataInfo | null> 远程同步数据
 */
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

/**
 * 上传书签数据
 * 根据存储类型上传到 GitHub Gist 或 WebDAV
 * 上传前会先保存现有远程数据到备份记录
 *
 * @param bookmarks - 要上传的书签数据
 * @param tombstones - 合并后的墓碑数据（可选）
 */
async function uploadBookmarks(bookmarks: BookmarkInfo[], tombstones: Tombstone[] = []): Promise<void> {
    const setting = await Setting.build();

    // 步骤1: 获取现有远程数据
    logger.info('uploadBookmarks: 步骤1 - 获取现有远程数据...');
    const existingData = await fetchRemoteData(setting);

    // 步骤2: 创建新的备份记录
    logger.info('uploadBookmarks: 步骤2 - 创建新的备份记录...');
    const newRecord: BackupRecord = {
        backupTimestamp: Date.now(),
        bookmarkData: bookmarks,
        bookmarkCount: getBookmarkCount(bookmarks)
    };

    // 步骤3: 构建 v2.0 格式的数据
    logger.info('uploadBookmarks: 步骤3 - 构建 v2.0 格式数据...');
    const uploadData: SyncData = {
        version: '2.0',
        lastSyncTimestamp: Date.now(),
        sourceBrowser: {
            browser: getBrowserName(navigator.userAgent),
            os: getOsFromUserAgent(navigator.userAgent)
        },
        backupRecords: [newRecord],
        tombstones: tombstones
    };
    
    // 步骤4: 追加现有数据（迁移旧格式）
    if (existingData) {
        if (isSyncData(existingData)) {
            // 现有数据已经是 v2.0 格式
            const remote = existingData as SyncData;
            uploadData.backupRecords.push(...remote.backupRecords || []);
        } else {
            // 旧格式 (SyncDataInfo)，转为历史备份记录
            const old = existingData as SyncDataInfo;
            const oldRecord: BackupRecord = {
                backupTimestamp: old.createDate || Date.now() - 1000,
                bookmarkData: old.bookmarks || [],
                bookmarkCount: getBookmarkCount(old.bookmarks || [])
            };
            if (oldRecord.bookmarkCount > 0) {
                uploadData.backupRecords.push(oldRecord);
            }
        }
    }
    
    // 步骤5: 限制备份数量
    while (uploadData.backupRecords.length > BACKUP_DEFAULTS.MAX_BACKUPS) {
        uploadData.backupRecords.pop();
    }
    
    logger.info(`uploadBookmarks: 总计 ${uploadData.backupRecords.length} 个备份记录...`);
    
    // 序列化为 JSON
    const content = JSON.stringify(uploadData, null, 2);
    logger.info(`uploadBookmarks: 步骤6 - 上传数据 (${getBookmarkCount(bookmarks)} 个书签)...`);
    
    // 步骤6: 根据存储类型选择上传方式
    if (setting.storageType === 'webdav') {
        await webdavWrite(content);
        logger.info('uploadBookmarks: WebDAV 上传完成');
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
    logger.info('uploadBookmarks: GitHub Gist 上传完成');
}

/**
 * Helper function to get browser name from user agent
 */
function getBrowserName(userAgent: string): string {
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Edg')) return 'Edge';
    if (userAgent.includes('Chrome')) return 'Chrome';
    return 'Unknown';
}

/**
 * Helper function to get OS from user agent
 */
function getOsFromUserAgent(userAgent: string): string {
    if (userAgent.includes('Win')) return 'Windows';
    if (userAgent.includes('Mac')) return 'macOS';
    if (userAgent.includes('Linux')) return 'Linux';
    if (userAgent.includes('Android')) return 'Android';
    if (userAgent.includes('iOS')) return 'iOS';
    return 'Unknown';
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
