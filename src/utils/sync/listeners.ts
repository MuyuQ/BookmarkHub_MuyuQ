/**
 * 书签事件监听模块 (P1-1)
 *
 * 统一管理浏览器书签事件的监听、用户事件回调注册，
 * 以及同步期间事件的排队与重放。
 */

import { Bookmarks } from 'wxt/browser';
import { logger } from '../logger';
import { syncDebouncer } from '../debounce';
import { getIsSuppressingEvents, getIsBulkBookmarkOperation, setBulkBookmarkOperation } from './syncState';

/**
 * 书签事件回调类型
 */
export type BookmarkEventType = 'onCreated' | 'onChanged' | 'onMoved' | 'onRemoved';

/**
 * 批量书签操作标志
 * 扩展自身对书签树的批量修改（合并写回、下载重建、备份恢复）产生的事件
 * 不代表用户操作，必须完全忽略——否则会产生虚假墓碑并引发递归同步
 */
/** 进入批量书签操作（下载/恢复等，期间书签事件被完全忽略） */
export function beginBulkBookmarkOperation(): void {
    setBulkBookmarkOperation(true);
}

/** 退出批量书签操作 */
export function endBulkBookmarkOperation(): void {
    setBulkBookmarkOperation(false);
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
export async function replayPendingBookmarkEvents(): Promise<void> {
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
export const syncListeners = {
  onStartup: () => {
    logger.debug('>>> syncListeners.onStartup 触发');
    if (getIsBulkBookmarkOperation()) return;
    if (!getIsSuppressingEvents()) {
      syncDebouncer.triggerSync().catch(err => logger.error('onStartup sync failed', err));
    } else {
      // 同步期间浏览器启动：标记待同步，同步结束后补触发
      pendingStartupSync = true;
    }
  },
  onCreated: (id: string, bookmark: Bookmarks.BookmarkTreeNode) => {
    logger.debug('>>> syncListeners.onCreated 触发', { id, title: bookmark.title, url: bookmark.url });
    if (getIsBulkBookmarkOperation()) return;
    if (getIsSuppressingEvents()) {
      // P1-1: 同步期间的用户操作排队重放，而不是静默丢弃
      enqueueBookmarkEvent('onCreated', id, bookmark);
      return;
    }
    syncDebouncer.triggerSync().catch(err => logger.error('onCreated sync failed', err));
    executeCallbacks('onCreated', id, bookmark);
  },
  onChanged: (id: string, changeInfo: Bookmarks.OnChangedChangeInfoType) => {
    logger.debug('>>> syncListeners.onChanged 触发', { id, changeInfo });
    if (getIsBulkBookmarkOperation()) return;
    if (getIsSuppressingEvents()) {
      enqueueBookmarkEvent('onChanged', id, changeInfo);
      return;
    }
    syncDebouncer.triggerSync().catch(err => logger.error('onChanged sync failed', err));
    executeCallbacks('onChanged', id, changeInfo);
  },
  onMoved: (id: string, moveInfo: Bookmarks.OnMovedMoveInfoType) => {
    logger.debug('>>> syncListeners.onMoved 触发', { id, moveInfo });
    if (getIsBulkBookmarkOperation()) return;
    if (getIsSuppressingEvents()) {
      enqueueBookmarkEvent('onMoved', id, moveInfo);
      return;
    }
    syncDebouncer.triggerSync().catch(err => logger.error('onMoved sync failed', err));
    executeCallbacks('onMoved', id, moveInfo);
  },
  onRemoved: (id: string, removeInfo: Bookmarks.OnRemovedRemoveInfoType) => {
    logger.debug('>>> syncListeners.onRemoved 触发', { id, removeInfo });
    if (getIsBulkBookmarkOperation()) return;
    if (getIsSuppressingEvents()) {
      enqueueBookmarkEvent('onRemoved', id, removeInfo);
      return;
    }
    syncDebouncer.triggerSync().catch(err => logger.error('onRemoved sync failed', err));
    executeCallbacks('onRemoved', id, removeInfo);
  },
};

