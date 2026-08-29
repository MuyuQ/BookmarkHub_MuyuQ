/**
 * 同步状态模块 (P3 架构重构)
 *
 * 集中管理同步相关的进程内标志位。
 * 拆分 sync.ts 后，监听器（listeners.ts）与编排器（sync.ts）
 * 需要共享这些标志，统一经由本模块的访问器读写。
 */

/** 是否正在同步（内存锁，防止同上下文并发） */
let isSyncing = false;

/** 事件抑制标志：同步期间书签事件进入排队而非直接处理 */
let isSuppressingEvents = false;

/** 批量书签操作标志：扩展自身的批量修改（写回/下载/恢复）产生的事件被完全忽略 */
let isBulkBookmarkOperation = false;

/** 书签事件监听器是否已注册（防止重复注册） */
let listenersRegistered = false;

export function getIsSyncing(): boolean {
    return isSyncing;
}

export function setSyncing(value: boolean): void {
    isSyncing = value;
}

export function getIsSuppressingEvents(): boolean {
    return isSuppressingEvents;
}

export function setSuppressingEvents(value: boolean): void {
    isSuppressingEvents = value;
}

export function getIsBulkBookmarkOperation(): boolean {
    return isBulkBookmarkOperation;
}

export function setBulkBookmarkOperation(value: boolean): void {
    isBulkBookmarkOperation = value;
}

export function getListenersRegistered(): boolean {
    return listenersRegistered;
}

export function setListenersRegistered(value: boolean): void {
    listenersRegistered = value;
}
