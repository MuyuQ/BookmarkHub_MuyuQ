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
// SyncDataInfo 用于向后兼容旧数据格式的迁移逻辑
import { SyncResult, SyncData, BackupRecord, Tombstone, SyncDataInfo } from './models';
import BookmarkService from './services';
import {
    getBookmarkCount,
    normalizeBookmarkIds,
    normalizeTreeShape,
    generateStableId,
    isStructuralRootId,
} from './bookmarkUtils';
import { webdavWrite } from './webdav';
import { handleError, createError } from './errors';
import { logger, logSync } from './logger';
import { threeWayMerge, mergeTombstones, ConflictMode as MergeConflictMode } from './merge';
import { STORAGE_KEYS, BACKUP_STORAGE_KEYS, BACKUP_DEFAULTS, MV3_CONFIG, ROOT_NODE_IDS, ROOT_FOLDER_NAMES } from './constants';
import { Bookmarks } from 'wxt/browser';
import { getLocalCache, saveLocalCache, sortBackupRecords } from './localCache';
import { syncDebouncer } from './debounce';
import { getBrowserInfo, detectBookmarkBrowserType, resolveRootTargetBrowserId } from './browserInfo';
import { fetchRemoteData as _fetchRemoteData, extractBookmarksFromData as _extractBookmarksFromData, isSyncDataInfo as _isSyncDataInfo, isSyncData as _isSyncData } from './sync/dataFetcher';

// Re-export for backward compatibility
export { fetchRemoteData, extractBookmarksFromData, isSyncDataInfo, isSyncData } from './sync/dataFetcher';

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
 * 书签事件回调类型
 */
export type BookmarkEventType = 'onCreated' | 'onChanged' | 'onMoved' | 'onRemoved';

/**
 * 批量书签操作标志
 * 扩展自身对书签树的批量修改（合并写回、下载重建、备份恢复）产生的事件
 * 不代表用户操作，必须完全忽略——否则会产生虚假墓碑并引发递归同步
 */
let isBulkBookmarkOperation = false;

/** 进入批量书签操作（下载/恢复等，期间书签事件被完全忽略） */
export function beginBulkBookmarkOperation(): void {
    isBulkBookmarkOperation = true;
}

/** 退出批量书签操作 */
export function endBulkBookmarkOperation(): void {
    isBulkBookmarkOperation = false;
}

/**
 * 同步期间排队的事件（P1-1）
 * 同步过程中用户的书签操作不再被静默丢弃，而是排队等待同步结束后重放，
 * 保证墓碑创建（如删除事件）不丢失
 */
interface QueuedBookmarkEvent {
    type: BookmarkEventType;
    id: string;
    info: unknown;
}
const pendingBookmarkEvents: QueuedBookmarkEvent[] = [];
const MAX_PENDING_EVENTS = 200;
let pendingStartupSync = false;

function enqueueBookmarkEvent(type: BookmarkEventType, id: string, info: unknown): void {
    if (pendingBookmarkEvents.length >= MAX_PENDING_EVENTS) {
        pendingBookmarkEvents.shift();
    }
    pendingBookmarkEvents.push({ type, id, info });
}

/**
 * 重放同步期间排队的事件
 * 在 performSync 的 finally 中、事件抑制解除后调用
 */
async function replayPendingBookmarkEvents(): Promise<void> {
    if (pendingBookmarkEvents.length === 0 && !pendingStartupSync) return;

    const events = pendingBookmarkEvents.splice(0, pendingBookmarkEvents.length);
    logger.info(`replayPendingBookmarkEvents: 重放 ${events.length} 个同步期间排队的事件`);

    if (pendingStartupSync) {
        pendingStartupSync = false;
        syncDebouncer.triggerSync().catch(err => logger.error('replay startup sync failed', err));
    }
    for (const event of events) {
        executeCallbacks(event.type, event.id, event.info);
        syncDebouncer.triggerSync().catch(err => logger.error('replay triggerSync failed', err));
    }
}

/**
 * 书签事件回调函数
 */
type BookmarkEventCallback = (id: string, info: unknown) => void | Promise<void>;

/**
 * 已注册的书签事件回调
 */
const bookmarkEventCallbacks: Map<BookmarkEventType, BookmarkEventCallback[]> = new Map();

/**
 * 注册书签事件回调
 * 当书签事件触发时，回调会被执行（仅在非抑制状态下）
 *
 * @param eventType - 事件类型
 * @param callback - 回调函数
 * @returns 取消注册的函数
 */
export function registerBookmarkEventCallback(
    eventType: BookmarkEventType,
    callback: BookmarkEventCallback
): () => void {
    if (!bookmarkEventCallbacks.has(eventType)) {
        bookmarkEventCallbacks.set(eventType, []);
    }
    bookmarkEventCallbacks.get(eventType)!.push(callback);
    return () => {
        const callbacks = bookmarkEventCallbacks.get(eventType);
        if (callbacks) {
            const index = callbacks.indexOf(callback);
            if (index >= 0) callbacks.splice(index, 1);
        }
    };
}

/**
 * 执行已注册的回调
 */
function executeCallbacks(eventType: BookmarkEventType, id: string, info: unknown): void {
    const callbacks = bookmarkEventCallbacks.get(eventType);
    if (callbacks) {
        for (const cb of callbacks) {
            try {
                const result = cb(id, info);
                if (result instanceof Promise) {
                    result.catch(err => logger.error(`bookmarkEventCallback ${eventType} failed`, err));
                }
            } catch (err) {
                logger.error(`bookmarkEventCallback ${eventType} error`, err);
            }
        }
    }
}

/**
 * 事件监听器引用
 * 用于移除监听器，防止内存泄漏
 * 在同步操作期间检查事件抑制标志，防止递归同步
 */
const syncListeners = {
  onStartup: () => {
    logger.debug('>>> syncListeners.onStartup 触发');
    if (isBulkBookmarkOperation) return;
    if (!isSuppressingEvents) {
      syncDebouncer.triggerSync().catch(err => logger.error('onStartup sync failed', err));
    } else {
      // 同步期间浏览器启动：标记待同步，同步结束后补触发
      pendingStartupSync = true;
    }
  },
  onCreated: (id: string, bookmark: Bookmarks.BookmarkTreeNode) => {
    logger.debug('>>> syncListeners.onCreated 触发', { id, title: bookmark.title, url: bookmark.url });
    if (isBulkBookmarkOperation) return;
    if (isSuppressingEvents) {
      // P1-1: 同步期间的用户操作排队重放，而不是静默丢弃
      enqueueBookmarkEvent('onCreated', id, bookmark);
      return;
    }
    syncDebouncer.triggerSync().catch(err => logger.error('onCreated sync failed', err));
    executeCallbacks('onCreated', id, bookmark);
  },
  onChanged: (id: string, changeInfo: Bookmarks.OnChangedChangeInfoType) => {
    logger.debug('>>> syncListeners.onChanged 触发', { id, changeInfo });
    if (isBulkBookmarkOperation) return;
    if (isSuppressingEvents) {
      enqueueBookmarkEvent('onChanged', id, changeInfo);
      return;
    }
    syncDebouncer.triggerSync().catch(err => logger.error('onChanged sync failed', err));
    executeCallbacks('onChanged', id, changeInfo);
  },
  onMoved: (id: string, moveInfo: Bookmarks.OnMovedMoveInfoType) => {
    logger.debug('>>> syncListeners.onMoved 触发', { id, moveInfo });
    if (isBulkBookmarkOperation) return;
    if (isSuppressingEvents) {
      enqueueBookmarkEvent('onMoved', id, moveInfo);
      return;
    }
    syncDebouncer.triggerSync().catch(err => logger.error('onMoved sync failed', err));
    executeCallbacks('onMoved', id, moveInfo);
  },
  onRemoved: (id: string, removeInfo: Bookmarks.OnRemovedRemoveInfoType) => {
    logger.debug('>>> syncListeners.onRemoved 触发', { id, removeInfo });
    if (isBulkBookmarkOperation) return;
    if (isSuppressingEvents) {
      enqueueBookmarkEvent('onRemoved', id, removeInfo);
      return;
    }
    syncDebouncer.triggerSync().catch(err => logger.error('onRemoved sync failed', err));
    executeCallbacks('onRemoved', id, removeInfo);
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
            // 如果状态超过设定时间，认为是过期的 (Service Worker 休眠后)
            if (Date.now() - state.timestamp > MV3_CONFIG.SYNC_STATE_EXPIRY_MS) {
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

// ============== 合并结果写回本地书签树 (P0-2) ==============

/**
 * 获取剥根并标准化后的本地书签树
 * 所有同步路径统一使用该形态（与远程数据格式一致）
 */
async function getLocalBookmarkTree(): Promise<BookmarkInfo[]> {
    const tree = await browser.bookmarks.getTree();
    const stripped = normalizeTreeShape(tree as unknown as BookmarkInfo[]);
    return normalizeBookmarkIds(stripped);
}

/** 本地书签节点的引用信息（稳定 ID ↔ 浏览器 ID 映射） */
interface BookmarkNodeRef {
    browserId: string;
    stableId: string;
    parentBrowserId?: string;
    parentStableId?: string;
    title: string;
    url?: string;
    index?: number;
    depth: number;
}

/**
 * 遍历本地书签树，建立 stableId → 浏览器节点引用 的映射
 * 不修改原节点（浏览器 ID 需要保留用于 API 调用）
 */
function collectLocalRefs(
    nodes: BookmarkInfo[],
    parentBrowserId: string | undefined,
    parentStableId: string | undefined,
    parentPath: string,
    depth: number,
    out: Map<string, BookmarkNodeRef>
): void {
    for (const node of nodes) {
        const stableId = generateStableId(node, parentPath);
        out.set(stableId, {
            browserId: node.id || '',
            stableId,
            parentBrowserId,
            parentStableId,
            title: node.title,
            url: node.url,
            index: node.index,
            depth,
        });
        if (node.children) {
            const childPath = parentPath ? `${parentPath}/${node.title}` : node.title;
            collectLocalRefs(node.children, node.id || parentBrowserId, stableId, childPath, depth + 1, out);
        }
    }
}

/** 写回操作统计 */
interface WritebackStats {
    created: number;
    removed: number;
    updated: number;
    moved: number;
    failed: number;
}

/**
 * 将合并结果应用回本地浏览器书签树
 *
 * 三向合并完成后，merged 包含双方的所有变更，但本地浏览器书签树
 * 并不会自动更新——若不写回，merged 中"仅远程存在的书签"在下次同步时
 * 会被 detectChanges 误判为本地删除并生成墓碑，导致远程书签被误杀。
 *
 * 执行顺序：删除（子先于父）→ 创建（父先于子）→ 更新/移动。
 * 必须在 beginBulkBookmarkOperation 保护区和事件抑制状态下调用。
 *
 * @param merged - 合并后的书签树（已标准化稳定 ID，剥根格式）
 */
async function applyMergeToLocalTree(merged: BookmarkInfo[]): Promise<WritebackStats> {
    const stats: WritebackStats = { created: 0, removed: 0, updated: 0, moved: 0, failed: 0 };

    // 建立本地树映射
    const rawTree = await browser.bookmarks.getTree();
    const localRefs = new Map<string, BookmarkNodeRef>();
    const stripped = normalizeTreeShape(rawTree as unknown as BookmarkInfo[]);
    collectLocalRefs(stripped, rawTree[0]?.id, undefined, '', 0, localRefs);

    // 建立 merged 索引（节点 ID 已标准化）
    const mergedNodes = new Map<string, BookmarkInfo>();
    const mergedParentOf = new Map<string, string | undefined>();
    (function index(nodes: BookmarkInfo[], parentStableId?: string): void {
        for (const node of nodes) {
            if (!node.id) continue;
            mergedNodes.set(node.id, node);
            mergedParentOf.set(node.id, parentStableId);
            if (node.children) index(node.children, node.id);
        }
    })(merged, undefined);

    // 1. 删除：本地存在但合并结果中不存在（深度降序，子先于父）
    const localList = [...localRefs.values()].sort((a, b) => b.depth - a.depth);
    for (const ref of localList) {
        if (isStructuralRootId(ref.browserId)) continue;
        if (!mergedNodes.has(ref.stableId)) {
            try {
                await browser.bookmarks.removeTree(ref.browserId);
                stats.removed++;
            } catch (err) {
                // 可能已随父级删除，忽略
                logger.debug('writeback: remove failed (可能已随父级删除)', { id: ref.browserId, err });
            }
        }
    }

    // 2. 创建：合并结果中存在但本地不存在（父先于子）
    const browserType = await detectBookmarkBrowserType();
    const createMissing = async (nodes: BookmarkInfo[], parentBrowserId: string): Promise<void> => {
        for (const node of nodes) {
            if (!node.id) continue;
            const existingRef = localRefs.get(node.id);
            if (existingRef) {
                if (node.children) {
                    await createMissing(node.children, existingRef.browserId);
                }
                continue;
            }
            try {
                const created = await browser.bookmarks.create({
                    parentId: parentBrowserId,
                    title: node.title,
                    url: node.url,
                    index: node.index,
                });
                stats.created++;
                localRefs.set(node.id, {
                    browserId: created.id,
                    stableId: node.id,
                    parentBrowserId,
                    title: node.title,
                    url: node.url,
                    depth: 0,
                });
                logger.debug('writeback: created', { title: node.title, parentId: parentBrowserId });
                if (node.children) {
                    await createMissing(node.children, created.id);
                }
            } catch (err) {
                stats.failed++;
                logger.warn('writeback: create failed', { id: node.id, title: node.title, err });
            }
        }
    };
    for (const topNode of merged) {
        if (!topNode.id) continue;
        const existingRef = localRefs.get(topNode.id);
        if (existingRef) {
            if (topNode.children) {
                await createMissing(topNode.children, existingRef.browserId);
            }
        } else {
            await createMissing([topNode], resolveRootTargetBrowserId(topNode, browserType));
        }
    }

    // 3. 更新与移动
    for (const [stableId, node] of mergedNodes) {
        const ref = localRefs.get(stableId);
        if (!ref || !ref.browserId) continue;
        if (isStructuralRootId(ref.browserId)) continue;

        // 内容更新
        const contentChanged = ref.title !== node.title || (ref.url || undefined) !== (node.url || undefined);
        if (contentChanged) {
            try {
                const changes: { title: string; url?: string } = { title: node.title };
                if (node.url) changes.url = node.url;
                await browser.bookmarks.update(ref.browserId, changes);
                stats.updated++;
            } catch (err) {
                stats.failed++;
                logger.warn('writeback: update failed', { id: ref.browserId, err });
            }
        }

        // 移动（父变化或位置变化）
        const targetParentStableId = mergedParentOf.get(stableId);
        let moveTarget: { parentId?: string; index?: number } | null = null;
        if (targetParentStableId !== ref.parentStableId) {
            const parentRef = targetParentStableId ? localRefs.get(targetParentStableId) : undefined;
            const parentId = parentRef?.browserId ?? resolveRootTargetBrowserId(node, browserType);
            moveTarget = { parentId, index: node.index };
        } else if (node.index !== undefined && node.index !== ref.index) {
            moveTarget = { parentId: ref.parentBrowserId, index: node.index };
        }
        if (moveTarget) {
            try {
                await browser.bookmarks.move(ref.browserId, moveTarget);
                stats.moved++;
            } catch (err) {
                logger.debug('writeback: move failed', { id: ref.browserId, err });
            }
        }
    }

    logger.info(`applyMergeToLocalTree: 写回完成`, { ...stats });
    return stats;
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
        listenersRegistered,
        isSyncing,
        isSuppressingEvents
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
    logger.info(`performSync: isSyncing=${isSyncing}, isSuppressingEvents=${isSuppressingEvents}`);

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
        const remoteData = await _fetchRemoteData(setting);
        let remoteBookmarks: BookmarkInfo[] = [];
        if (remoteData) {
            remoteBookmarks = _extractBookmarksFromData(remoteData) || [];
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
        const remoteTombstones = (remoteData && _isSyncData(remoteData))
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
            isBulkBookmarkOperation = true;
            try {
                await applyMergeToLocalTree(mergeResult.merged);
                // 以写回后的真实本地树为准（浏览器生成的 dateAdded/index 与 merged 不同）
                finalTree = await getLocalBookmarkTree();
            } catch (writebackError) {
                // 写回失败时退回旧行为：以 merged 为准上传，本地树保持现状
                logger.error('performSync: 写回本地书签树失败，退回合并结果', writebackError);
                finalTree = mergeResult.merged;
            } finally {
                isBulkBookmarkOperation = false;
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
            await browser.runtime.sendMessage({ name: 'refreshCounts' });
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
        isSyncing = false;
        isSuppressingEvents = false;
        logger.info(`performSync: 释放同步锁 isSyncing=false, isSuppressingEvents=false`);
        await clearSyncState();
        // P1-1: 重放同步期间排队的事件（用户操作不丢失，墓碑/计数回调补执行）
        await replayPendingBookmarkEvents();
    }
    
    return result;
}

/**
 * 上传书签快照（自动同步与手动上传共用的统一上传路径 P0-3/P0-4）
 *
 * 读取现有远程数据以保留备份历史，将新快照追加为最新备份记录，
 * 合并墓碑后整体写回。序列化使用紧凑格式以控制远程文件体积。
 *
 * @param bookmarks - 要上传的书签树（剥根格式，ID 已标准化）
 * @param tombstones - 要写入的墓碑（调用方负责合并双方墓碑）
 * @returns Promise<SyncData> 实际上传的同步数据
 */
export async function uploadSnapshot(bookmarks: BookmarkInfo[], tombstones: Tombstone[] = []): Promise<SyncData> {
    const setting = await Setting.build();

    // 步骤1: 获取现有远程数据
    logger.debug('uploadSnapshot: 步骤1 - 获取现有远程数据...');
    const existingData = await _fetchRemoteData(setting);

    // 步骤2: 创建新的备份记录
    const newRecord: BackupRecord = {
        backupTimestamp: Date.now(),
        bookmarkData: bookmarks,
        bookmarkCount: getBookmarkCount(bookmarks)
    };

    // 步骤3: 构建 v2.0 格式的数据
    const uploadData: SyncData = {
        version: '2.0',
        lastSyncTimestamp: Date.now(),
        sourceBrowser: getBrowserInfo(),
        backupRecords: [newRecord],
        tombstones: tombstones
    };

    // 步骤4: 追加现有数据（保留远程备份历史，迁移 v1 旧格式）
    if (existingData) {
        if (_isSyncData(existingData)) {
            const remote = existingData as SyncData;
            uploadData.backupRecords.push(...remote.backupRecords || []);
            // 保留远程已有墓碑，防止手动上传清空删除记录
            const remoteTombstones = remote.tombstones || [];
            if (remoteTombstones.length > 0) {
                uploadData.tombstones = mergeTombstones(remoteTombstones, tombstones);
            }
        } else {
            // 旧格式 (SyncDataInfo)，转为历史备份记录
            const old = existingData as SyncDataInfo;
            const oldRecord: BackupRecord = {
                backupTimestamp: old.createDate ?? 0,
                bookmarkData: old.bookmarks || [],
                bookmarkCount: getBookmarkCount(old.bookmarks || [])
            };
            if (oldRecord.bookmarkCount > 0) {
                uploadData.backupRecords.push(oldRecord);
            }
        }
    }

    // 步骤5: 限制备份数量并按时间降序排列
    while (uploadData.backupRecords.length > BACKUP_DEFAULTS.MAX_BACKUPS) {
        uploadData.backupRecords.pop();
    }
    uploadData.backupRecords = sortBackupRecords(uploadData.backupRecords);

    // 序列化为紧凑 JSON
    const content = JSON.stringify(uploadData);
    logger.debug(`uploadSnapshot: 上传数据 (${getBookmarkCount(bookmarks)} 个书签, ${uploadData.backupRecords.length} 份备份)...`);

    // 步骤6: 根据存储类型选择上传方式
    if (setting.storageType === 'webdav') {
        const writeSucceeded = await webdavWrite(content);
        if (!writeSucceeded) {
            throw createError.networkError('WebDAV upload failed');
        }
        logger.info('uploadSnapshot: WebDAV 上传完成');
        return uploadData;
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
    logger.info('uploadSnapshot: GitHub Gist 上传完成');
    return uploadData;
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
