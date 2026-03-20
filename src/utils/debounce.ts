/**
 * BookmarkHub 防抖和锁管理模块
 * 
 * 提供同步操作的防抖控制和锁管理
 * 解决 Service Worker 休眠导致的锁丢失问题
 */

import { BACKUP_STORAGE_KEYS, BACKUP_DEFAULTS } from './constants';
import { logger } from './logger';

export interface DebounceConfig {
    debounceTime: number;
    maxWaitTime: number;
}

interface LockState {
    locked: boolean;
    timestamp: number;
}

// P1-16: Safe storage wrapper with error handling
async function safeStorageSet(key: string, value: unknown): Promise<boolean> {
    try {
        await browser.storage.local.set({ [key]: value });
        return true;
    } catch (error) {
        logger.error('Failed to set storage', { key, error });
        return false;
    }
}

async function safeStorageRemove(key: string): Promise<boolean> {
    try {
        await browser.storage.local.remove(key);
        return true;
    } catch (error) {
        logger.error('Failed to remove from storage', { key, error });
        return false;
    }
}

/**
 * 持久化锁管理器
 * 使用 browser.storage.local 实现锁持久化
 * 解决 Service Worker 休眠后内存锁失效的问题
 */
export class LockManager {
    private lockKey = BACKUP_STORAGE_KEYS.SYNC_LOCK_KEY;
    private lockTimeout: number = BACKUP_DEFAULTS.LOCK_TIMEOUT;

    /**
     * 获取锁
     * @returns true 表示成功获取锁，false 表示锁已被占用
     */
    async acquire(): Promise<boolean> {
        await this.checkAndCleanStaleLock();
        
        const result = await browser.storage.local.get(this.lockKey);
        if (result[this.lockKey]?.locked) {
            logger.debug('LockManager.acquire: Lock already acquired');
            return false;
        }
        
        // P1-16: Use safe storage wrapper
        const success = await safeStorageSet(this.lockKey, {
            locked: true,
            timestamp: Date.now()
        } as LockState);
        
        if (!success) {
            logger.error('LockManager.acquire: Failed to acquire lock - storage error');
            return false;
        }
        
        logger.debug('LockManager.acquire: Lock acquired');
        return true;
    }

    async release(): Promise<void> {
        // P1-16: Use safe storage wrapper
        await safeStorageRemove(this.lockKey);
        logger.debug('LockManager.release: Lock released');
    }

    /**
     * 检查并清理过期锁
     * 防止因异常导致的死锁
     */
    async checkAndCleanStaleLock(): Promise<void> {
        const result = await browser.storage.local.get(this.lockKey);
        const lock = result[this.lockKey] as LockState | undefined;
        
        if (lock && Date.now() - lock.timestamp > this.lockTimeout) {
            logger.warn('LockManager.checkAndCleanStaleLock: Cleaning stale lock');
            await this.release();
        }
    }

    /**
     * 检查锁状态
     * @returns 是否被锁定
     */
    async isLocked(): Promise<boolean> {
        await this.checkAndCleanStaleLock();
        const result = await browser.storage.local.get(this.lockKey);
        return result[this.lockKey]?.locked || false;
    }
}

/**
 * 同步防抖器
 * 负责防抖控制，避免频繁同步
 */
export class SyncDebouncer {
    private timer: ReturnType<typeof setTimeout> | null = null;
    private maxTimer: ReturnType<typeof setTimeout> | null = null;
    private debounceTime: number = BACKUP_DEFAULTS.DEBOUNCE_TIME;
    private maxWaitTime: number = BACKUP_DEFAULTS.MAX_WAIT_TIME;
    private lockManager: LockManager = new LockManager();

    /**
     * 触发同步（带防抖）
     * 当书签变动事件触发时调用
     */
    async triggerSync(): Promise<void> {
        const isLocked = await this.lockManager.isLocked();
        if (isLocked) {
            await this.setPendingSync(true);
            logger.debug('SyncDebouncer.triggerSync: Locked, setting pendingSync');
            return;
        }

        if (this.timer) {
            clearTimeout(this.timer);
        }

        if (!this.maxTimer) {
            this.maxTimer = setTimeout(() => {
                this.executeSync();
            }, this.maxWaitTime);
        }

        this.timer = setTimeout(() => {
            this.executeSync();
        }, this.debounceTime);
    }

    /**
     * 设置/清除 pendingSync 标志（持久化）
     */
    private async setPendingSync(value: boolean): Promise<void> {
        // P1-16: Use safe storage wrappers
        if (value) {
            await safeStorageSet(BACKUP_STORAGE_KEYS.PENDING_SYNC_KEY, true);
        } else {
            await safeStorageRemove(BACKUP_STORAGE_KEYS.PENDING_SYNC_KEY);
        }
    }

    /**
     * 获取 pendingSync 标志
     */
    private async getPendingSync(): Promise<boolean> {
        const result = await browser.storage.local.get(BACKUP_STORAGE_KEYS.PENDING_SYNC_KEY);
        return result[BACKUP_STORAGE_KEYS.PENDING_SYNC_KEY] || false;
    }

    /**
     * 执行同步
     * 计时器到期后调用
     */
    private async executeSync(): Promise<void> {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        if (this.maxTimer) {
            clearTimeout(this.maxTimer);
            this.maxTimer = null;
        }

        const acquired = await this.lockManager.acquire();
        if (!acquired) {
            await this.setPendingSync(true);
            logger.debug('SyncDebouncer.executeSync: Could not acquire lock, setting pendingSync');
            return;
        }

        try {
            logger.info('SyncDebouncer.executeSync: Executing sync');
            await this.performSyncCallback();
        } finally {
            await this.lockManager.release();

            const hasPending = await this.getPendingSync();
            if (hasPending) {
                await this.setPendingSync(false);
                logger.debug('SyncDebouncer.executeSync: Found pending sync, retriggering');
                this.triggerSync();
            }
        }
    }

    /**
     * 同步回调函数
     * 需要在使用时设置
     */
    private performSyncCallback: () => Promise<void> = async () => {
        logger.warn('SyncDebouncer: performSyncCallback not set');
    };

    /**
     * 设置同步回调函数
     */
    setSyncCallback(callback: () => Promise<void>): void {
        this.performSyncCallback = callback;
    }

    /**
     * 更新防抖配置
     */
    updateConfig(config: Partial<DebounceConfig>): void {
        if (config.debounceTime !== undefined) {
            this.debounceTime = config.debounceTime;
        }
        if (config.maxWaitTime !== undefined) {
            this.maxWaitTime = config.maxWaitTime;
        }
    }

    /**
     * 检查并恢复待执行的同步
     * Service Worker 唤醒时调用
     */
    async checkAndResumePendingSync(): Promise<void> {
        const hasPending = await this.getPendingSync();
        if (hasPending) {
            logger.info('SyncDebouncer.checkAndResumePendingSync: Found pending sync, resuming');
            await this.setPendingSync(false);
            await this.triggerSync();
        }
    }

    /**
     * 取消所有计时器
     */
    cancel(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        if (this.maxTimer) {
            clearTimeout(this.maxTimer);
            this.maxTimer = null;
        }
    }
}

/**
 * 全局锁管理器实例
 */
export const lockManager = new LockManager();

/**
 * 全局同步防抖器实例
 */
export const syncDebouncer = new SyncDebouncer();