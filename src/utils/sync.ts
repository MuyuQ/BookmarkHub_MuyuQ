/**
 * BookmarkHub 同步编排模块
 *
 * 同步流程的编排入口，包括:
 * - 自动同步的启动/停止（Alarm + 事件监听）
 * - performSync 三向合并同步主流程
 * - 同步锁的持久化（MV3 Service Worker 休眠恢复）
 * - 同步状态持久化
 *
 * 各职责分别位于 sync/ 子模块：
 * - sync/syncState.ts    同步锁与标志位
 * - sync/listeners.ts    书签事件监听、排队与回调
 * - sync/uploader.ts     统一上传路径
 * - sync/writeback.ts    合并结果写回本地书签树
 * - sync/dataFetcher.ts  远程数据获取与格式解析
 * - sync/storageProvider.ts  存储后端抽象（Gist/WebDAV）
 */

import { Setting } from './setting';
import { SyncResult, SyncData } from './models';
import { getBookmarkCount, normalizeBookmarkIds, normalizeTreeShape } from './bookmarkUtils';
import { handleError } from './errors';
import { logger, logSync } from './logger';
import { threeWayMerge, ConflictMode as MergeConflictMode } from './merge';
import { STORAGE_KEYS, BACKUP_STORAGE_KEYS, BACKUP_DEFAULTS, MV3_CONFIG, MESSAGE_NAMES } from './constants';
import { getLocalCache, saveLocalCache } from './localCache';
import { syncDebouncer } from './debounce';
import { getBrowserInfo } from './browserInfo';
import { fetchRemoteData, extractBookmarksFromData, isSyncData } from './sync/dataFetcher';
import { uploadSnapshot } from './sync/uploader';
import { getLocalBookmarkTree, applyMergeToLocalTree } from './sync/writeback';
import { syncListeners, replayPendingBookmarkEvents, beginBulkBookmarkOperation, endBulkBookmarkOperation } from './sync/listeners';
import {
    getIsSyncing, setSyncing,
    getIsSuppressingEvents, setSuppressingEvents,
    getListenersRegistered, setListenersRegistered,
} from './sync/syncState';

// ---- 对外兼容导出（历史公共 API 保持不变） ----
export { fetchRemoteData, extractBookmarksFromData, isSyncDataInfo, isSyncData } from './sync/dataFetcher';
export { uploadSnapshot } from './sync/uploader';
export { getLocalBookmarkTree, type WritebackStats } from './sync/writeback';
export { registerBookmarkEventCallback, beginBulkBookmarkOperation, endBulkBookmarkOperation, type BookmarkEventType } from './sync/listeners';
export { getIsSyncing, getIsSuppressingEvents } from './sync/syncState';

/**
 * 同步锁状态 (持久化到 storage 以支持 MV3 Service Worker 休眠恢复)
 */
interface SyncState {
    isSyncing: boolean;
    isSuppressingEvents: boolean;
    timestamp: number;
}

// 注意：同步锁/事件抑制/监听器注册等标志位统一由 ./sync/syncState 管理，
// 本模块只通过访问器读写；对外导出见文件头部兼容导出区。

/**
 * 持久化同步状态 (MV3 Service Worker 休眠恢复)
 */
async function saveSyncState(): Promise<void> {
    try {
        const state: SyncState = {
            isSyncing: getIsSyncing(),
            isSuppressingEvents: getIsSuppressingEvents(),
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
            // 如果状态超过设定时间，认为是过期的 (Service Worker 休眠后)
            if (Date.now() - state.timestamp > MV3_CONFIG.SYNC_STATE_EXPIRY_MS) {
                setSyncing(false);
                setSuppressingEvents(false);
                logger.info('restoreSyncState: Cleared stale sync state');
            } else {
                setSyncing(state.isSyncing);
                setSuppressingEvents(state.isSuppressingEvents);
                logger.info('restoreSyncState: Restored sync state', { isSyncing: state.isSyncing, isSuppressingEvents: state.isSuppressingEvents });
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

    logger.debug('========== startAutoSync 被调用 ==========');
    logger.debug('startAutoSync: 设置状态', {
        enableAutoSync: setting.enableAutoSync,
        enableIntervalSync: setting.enableIntervalSync,
        enableEventSync: setting.enableEventSync,
        syncInterval: setting.syncInterval,
        listenersRegistered: getListenersRegistered(),
        isSyncing: getIsSyncing(),
        isSuppressingEvents: getIsSuppressingEvents()
    });

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
        const intervalMinutes = setting.syncInterval; // 存储值单位已是分钟（60/720/1440），无需换算
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
    if (setting.enableEventSync && !getListenersRegistered()) {
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
        
        setListenersRegistered(true);
        logger.info('startAutoSync: 所有事件监听器注册完成，listenersRegistered = true');
    } else if (!setting.enableEventSync) {
        logger.info('startAutoSync: 事件同步未启用 (enableEventSync = false)');
    } else if (getListenersRegistered()) {
        logger.info('startAutoSync: 监听器已注册，跳过重复注册');
    }
    
    logger.debug('========== startAutoSync 完成 ==========');
}

/**
 * 停止自动同步
 * 清除定时器和 Alarm，停止自动同步
 * 
 * @see startAutoSync 启动自动同步
 */
export function stopAutoSync(): void {
    logger.debug('========== stopAutoSync 被调用 ==========');
    logger.info(`stopAutoSync: listenersRegistered=${getListenersRegistered()}`);
    
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
    
    if (getListenersRegistered()) {
        logger.info('stopAutoSync: 移除事件监听器...');
        browser.runtime.onStartup.removeListener(syncListeners.onStartup);
        browser.bookmarks.onCreated.removeListener(syncListeners.onCreated);
        browser.bookmarks.onChanged.removeListener(syncListeners.onChanged);
        browser.bookmarks.onMoved.removeListener(syncListeners.onMoved);
        browser.bookmarks.onRemoved.removeListener(syncListeners.onRemoved);
        setListenersRegistered(false);
        logger.info('stopAutoSync: 所有事件监听器已移除');
    }
    logger.debug('========== stopAutoSync 完成 ==========');
}

/**
 * 检查持久化同步锁 (MV3 Service Worker 休眠恢复)
 * 返回 true 表示锁有效且正在同步中，应跳过本次操作
 */
async function checkPersistentSyncLock(): Promise<boolean> {
    try {
        const result = await browser.storage.local.get(BACKUP_STORAGE_KEYS.SYNC_STATE_KEY);
        const state = result[BACKUP_STORAGE_KEYS.SYNC_STATE_KEY] as SyncState | undefined;
        if (state && state.isSyncing) {
            // 如果锁状态超过设定时间，认为是过期的 (Service Worker 休眠后)
            if (Date.now() - state.timestamp > MV3_CONFIG.SYNC_STATE_EXPIRY_MS) {
                logger.info('checkPersistentSyncLock: 发现过期锁，已清除');
                await clearSyncState();
                return false;
            }
            logger.info('checkPersistentSyncLock: 发现活跃锁，跳过同步');
            return true;
        }
    } catch (error) {
        logger.error('checkPersistentSyncLock failed', error);
    }
    return false;
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
    logger.debug('========== performSync 开始 ==========');
    logger.info(`performSync: isSyncing=${getIsSyncing()}, isSuppressingEvents=${getIsSuppressingEvents()}`);

    // 恢复持久化状态 (MV3 Service Worker 休眠恢复)
    await restoreSyncState();

    // 检查持久化同步锁
    if (await checkPersistentSyncLock()) {
        logSync.skipped('Sync lock held in persistent storage');
        logger.info('performSync: 持久化锁已激活，跳过');
        return {
            direction: 'upload',
            status: 'skipped',
            timestamp: Date.now(),
            localCount: 0,
            remoteCount: 0,
            errorMessage: 'Sync lock held'
        };
    }

    // 如果正在同步，跳过这次操作
    if (getIsSyncing()) {
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
    setSyncing(true);
    setSuppressingEvents(true);
    logger.info('performSync: 设置同步锁 isSyncing=true, isSuppressingEvents=true');
    await saveSyncState();
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
        logger.debug('performSync: 步骤1 - 获取设置...');
        const setting = await Setting.build();
        logger.info('performSync: 设置获取成功', {
            storageType: setting.storageType,
            enableAutoSync: setting.enableAutoSync,
            conflictMode: setting.conflictMode,
            hasGithubToken: !!setting.githubToken,
            hasGistID: !!setting.gistID
        });
        
        // 2. 获取本地书签（剥根 + 标准化，与远程数据格式一致 P0-4）
        logger.debug('performSync: 步骤2 - 获取本地书签...');
        const localBookmarks = await getLocalBookmarkTree();
        const localCount = getBookmarkCount(localBookmarks);
        logger.info(`performSync: 本地书签获取成功，共 ${localCount} 个`);
        
        // 3. 获取远程数据
        logger.debug('performSync: 步骤3 - 获取远程数据...');
        const remoteData = await fetchRemoteData(setting);
        let remoteBookmarks: BookmarkInfo[] = [];
        if (remoteData) {
            remoteBookmarks = extractBookmarksFromData(remoteData) || [];
        }
        const remoteCount = getBookmarkCount(remoteBookmarks);
        logger.info(`performSync: 远程数据获取成功，共 ${remoteCount} 个书签`, { hasRemoteData: !!remoteData });
        
        // 4. 标准化 ID - 确保本地和远程使用相同的稳定 ID
        logger.debug('performSync: 步骤4 - 标准化书签ID...');
        if (remoteBookmarks.length > 0) {
            normalizeBookmarkIds(remoteBookmarks);
            logger.info('performSync: 远程书签ID标准化完成');
        }
        
        // 5. 获取本地缓存作为基准点（baseline）
        logger.debug('performSync: 步骤5 - 获取本地缓存作为基准点...');
        const localCache = await getLocalCache();
        // 基线同样按当前稳定 ID 方案重新标准化，保证与本地/远程可比
        // （方案升级后旧缓存的 ID 与新 ID 不同，不重标准化会导致误判删除+新建）
        const baselineRaw = localCache?.backupRecords?.[0]?.bookmarkData || null;
        const baseline = baselineRaw ? normalizeBookmarkIds(normalizeTreeShape(baselineRaw)) : null;
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
        logger.debug('performSync: 步骤7 - 执行三向合并...');
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

        // 8. 如果有变更：先写回本地书签树，再上传（P0-2）
        //    finalTree 是"写回后的真实本地树"，作为上传内容与新基线，
        //    保证 远程 == 基线 == 本地 三者一致，避免下次同步产生虚假变更
        let finalTree = mergeResult.merged;
        if (mergeResult.hasChanges) {
            logger.debug('performSync: 步骤8 - 应用合并结果到本地书签树...');
            beginBulkBookmarkOperation();
            try {
                await applyMergeToLocalTree(mergeResult.merged);
                // 以写回后的真实本地树为准（浏览器生成的 dateAdded/index 与 merged 不同）
                finalTree = await getLocalBookmarkTree();
            } catch (writebackError) {
                // 写回失败时退回旧行为：以 merged 为准上传，本地树保持现状
                logger.error('performSync: 写回本地书签树失败，退回合并结果', writebackError);
                finalTree = mergeResult.merged;
            } finally {
                endBulkBookmarkOperation();
            }

            logger.debug('performSync: 步骤8b - 上传合并后的数据...');
            await uploadSnapshot(finalTree, mergeResult.tombstones);
            logger.info('performSync: 上传完成');
        } else {
            logger.debug('performSync: 步骤8 - 无变更，跳过写回与上传');
        }

        // 9. 更新本地缓存为新基准点（以真实树为准）
        logger.debug('performSync: 步骤9 - 更新本地缓存为新基准点...');
        const newCache: SyncData = {
            version: '2.0',
            lastSyncTimestamp: Date.now(),
            sourceBrowser: getBrowserInfo(),
            backupRecords: [{
                backupTimestamp: Date.now(),
                bookmarkData: finalTree,
                bookmarkCount: getBookmarkCount(finalTree)
            }],
            tombstones: mergeResult.tombstones
        };
        await saveLocalCache(newCache);
        logger.info('performSync: 本地缓存更新完成');

        // 10. 设置成功状态和统计
        result.status = 'success';
        result.localCount = getBookmarkCount(finalTree);
        result.remoteCount = getBookmarkCount(finalTree);
        result.conflictCount = mergeResult.conflicts.length;
        logger.debug('performSync: 步骤10 - 设置成功状态', result);

        // 11. 保存同步状态
        logger.debug('performSync: 步骤11 - 保存同步状态...');
        await saveSyncStatus(result);
        logger.info('performSync: 同步状态保存完成');

        // 12. 通知 popup 刷新数量显示
        logger.debug('performSync: 步骤12 - 通知 popup 刷新...');
        try {
            await browser.runtime.sendMessage({ name: MESSAGE_NAMES.REFRESH_COUNTS });
            logger.info('performSync: popup 通知发送成功');
        } catch (e) {
            logger.info('performSync: popup 未打开，忽略通知错误');
        }

        logSync.success(result.remoteCount);
        logger.debug('========== performSync 成功完成 ==========');
        
    } catch (error: unknown) {
        // 捕获并记录错误
        logger.error('performSync: 发生错误', error);
        const err = handleError(error);
        result.errorMessage = err.message;
        logSync.failed(err.toLogString());
    } finally {
        // 释放同步锁和事件抑制标志
        setSyncing(false);
        setSuppressingEvents(false);
        logger.info(`performSync: 释放同步锁 isSyncing=false, isSuppressingEvents=false`);
        await clearSyncState();
        // P1-1: 重放同步期间排队的事件（用户操作不丢失，墓碑/计数回调补执行）
        await replayPendingBookmarkEvents();
    }
    
    return result;
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
        [STORAGE_KEYS.LAST_SYNC_CONFLICTS]: result.conflictCount || 0,
        [STORAGE_KEYS.LOCAL_COUNT]: result.localCount,
        [STORAGE_KEYS.REMOTE_COUNT]: result.remoteCount
    });
}
