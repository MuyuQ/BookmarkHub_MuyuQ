/**
 * BookmarkHub 本地缓存管理模块
 * 
 * 管理浏览器本地存储中的书签备份数据
 * 提供缓存的获取、保存、验证等功能
 */

import { BookmarkInfo, SyncData, BackupRecord, BrowserInfo, Tombstone } from './models';
import { BACKUP_STORAGE_KEYS, BACKUP_DEFAULTS } from './constants';
import { getBrowserInfo } from './browserInfo';
import { getBookmarkCount } from './bookmarkUtils';
import { logger } from './logger';

/**
 * 获取本地缓存
 * 从 browser.storage.local 获取缓存的同步数据
 * 
 * @returns Promise<SyncData | null> 缓存数据，不存在返回 null
 */
export async function getLocalCache(): Promise<SyncData | null> {
    try {
        const result = await browser.storage.local.get(BACKUP_STORAGE_KEYS.LOCAL_CACHE_KEY);
        const cache = result[BACKUP_STORAGE_KEYS.LOCAL_CACHE_KEY];

        if (cache && validateSyncData(cache)) {
            // 向后兼容：确保 tombstones 字段存在
            if (!cache.tombstones) {
                cache.tombstones = [];
            }
            return cache;
        }

        return null;
    } catch (error) {
        logger.error('getLocalCache: Failed to get local cache', { error });
        return null;
    }
}

/**
 * 保存本地缓存
 * 将同步数据保存到 browser.storage.local
 * 
 * @param data - 要保存的同步数据
 */
export async function saveLocalCache(data: SyncData): Promise<void> {
    try {
        await browser.storage.local.set({ [BACKUP_STORAGE_KEYS.LOCAL_CACHE_KEY]: data });
        logger.debug('saveLocalCache: Local cache saved', { 
            recordCount: data.backupRecords.length,
            lastSyncTimestamp: data.lastSyncTimestamp 
        });
    } catch (error) {
        logger.error('saveLocalCache: Failed to save local cache', { error });
        throw error;
    }
}

/**
 * 创建空的本地缓存
 * 用于首次使用或缓存损坏时初始化
 * 
 * @returns SyncData 空的同步数据结构
 */
export function createEmptyLocalCache(): SyncData {
    return {
        version: '2.0',
        lastSyncTimestamp: 0,
        sourceBrowser: { browser: 'Unknown', os: 'Unknown' },
        backupRecords: [],
        tombstones: []
    };
}

/**
 * 初始化本地缓存
 * 如果缓存不存在或无效，创建空缓存
 * 
 * @returns Promise<SyncData> 有效的本地缓存
 */
export async function initLocalCache(): Promise<SyncData> {
    const cache = await getLocalCache();
    if (cache) {
        return cache;
    }
    return createEmptyLocalCache();
}

/**
 * 验证备份数据完整性
 * 确保备份记录按时间戳降序排列（最新的在前）
 * 
 * @param records - 备份记录数组
 * @returns boolean 是否有效
 */
export function validateBackupRecords(records: BackupRecord[]): boolean {
    if (!records || records.length === 0) {
        return true;
    }
    
    for (let i = 1; i < records.length; i++) {
        if (records[i].backupTimestamp >= records[i - 1].backupTimestamp) {
            return false;
        }
    }
    return true;
}

/**
 * 排序备份记录（按时间戳降序）
 * 用于修复可能的数据顺序问题
 * 
 * @param records - 备份记录数组
 * @returns BackupRecord[] 排序后的数组
 */
export function sortBackupRecords(records: BackupRecord[]): BackupRecord[] {
    return records.sort((a, b) => b.backupTimestamp - a.backupTimestamp);
}

/**
 * 验证 SyncData 结构有效性
 * 
 * @param data - 要验证的数据
 * @returns boolean 是否有效
 */
export function validateSyncData(data: SyncData): boolean {
    if (!data) {
        return false;
    }

    // 验证 version 字段（可选，向后兼容）
    if (data.version && typeof data.version !== 'string') {
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

    // 验证 tombstones 字段（可选，向后兼容）
    if (data.tombstones !== undefined && !Array.isArray(data.tombstones)) {
        return false;
    }

    return validateBackupRecords(data.backupRecords);
}

/**
 * 创建新的备份记录
 * 
 * @param bookmarkData - 书签数据
 * @param timestamp - 备份时间戳（可选，默认当前时间）
 * @returns BackupRecord 新的备份记录
 */
export function createBackupRecord(
    bookmarkData: BookmarkInfo[], 
    timestamp: number = Date.now()
): BackupRecord {
    return {
        backupTimestamp: timestamp,
        bookmarkData,
        bookmarkCount: getBookmarkCount(bookmarkData)
    };
}

/**
 * 创建新的同步数据
 * 
 * @param bookmarkData - 书签数据
 * @param maxBackups - 最大备份数量（可选）
 * @returns SyncData 新的同步数据
 */
export function createSyncData(
    bookmarkData: BookmarkInfo[],
    maxBackups: number = BACKUP_DEFAULTS.MAX_BACKUPS
): SyncData {
    const now = Date.now();
    const backupRecord = createBackupRecord(bookmarkData, now);

    return {
        version: '2.0',
        lastSyncTimestamp: now,
        sourceBrowser: getBrowserInfo(),
        backupRecords: [backupRecord].slice(0, maxBackups),
        tombstones: []
    };
}

/**
 * 将新备份记录插入到同步数据
 * 自动处理数量限制和排序
 * 
 * @param syncData - 原同步数据
 * @param newRecord - 新备份记录
 * @param maxBackups - 最大备份数量
 * @returns SyncData 更新后的同步数据
 */
export function insertBackupRecord(
    syncData: SyncData, 
    newRecord: BackupRecord, 
    maxBackups: number = BACKUP_DEFAULTS.MAX_BACKUPS
): SyncData {
    const records = [newRecord, ...syncData.backupRecords];
    
    while (records.length > maxBackups) {
        records.pop();
    }
    
    return {
        ...syncData,
        backupRecords: records
    };
}

/**
 * 更新同步数据的元信息
 * 
 * @param syncData - 原同步数据
 * @returns SyncData 更新后的同步数据
 */
export function updateSyncMetadata(syncData: SyncData): SyncData {
    return {
        ...syncData,
        lastSyncTimestamp: Date.now(),
        sourceBrowser: getBrowserInfo()
    };
}

/**
 * 清除本地缓存
 */
export async function clearLocalCache(): Promise<void> {
    try {
        await browser.storage.local.remove(BACKUP_STORAGE_KEYS.LOCAL_CACHE_KEY);
        logger.info('clearLocalCache: Local cache cleared');
    } catch (error) {
        logger.error('clearLocalCache: Failed to clear local cache', { error });
    }
}

/**
 * 获取所有备份记录
 * 
 * @returns Promise<BackupRecord[]> 备份记录列表（按时间降序）
 */
export async function getBackupRecords(): Promise<BackupRecord[]> {
    const cache = await getLocalCache();
    return cache?.backupRecords || [];
}

/**
 * 根据时间戳获取特定备份
 * 
 * @param timestamp - 备份时间戳
 * @returns Promise<BackupRecord | null> 备份记录，不存在返回 null
 */
export async function getBackupByTimestamp(timestamp: number): Promise<BackupRecord | null> {
    const records = await getBackupRecords();
    return records.find(r => r.backupTimestamp === timestamp) || null;
}

/**
 * 删除指定时间戳的备份
 * 
 * @param timestamp - 备份时间戳
 * @returns Promise<boolean> 是否删除成功
 */
export async function deleteBackupRecord(timestamp: number): Promise<boolean> {
    try {
        const cache = await getLocalCache();
        if (!cache) return false;
        
        const filteredRecords = cache.backupRecords.filter(r => r.backupTimestamp !== timestamp);
        
        if (filteredRecords.length === cache.backupRecords.length) {
            logger.warn('deleteBackupRecord: Backup not found', { timestamp });
            return false;
        }
        
        const updatedCache: SyncData = {
            ...cache,
            backupRecords: filteredRecords
        };
        
        await saveLocalCache(updatedCache);
        logger.info('deleteBackupRecord: Backup deleted', { timestamp });
        return true;
    } catch (error) {
        logger.error('deleteBackupRecord: Failed to delete backup', { timestamp, error });
        return false;
    }
}

/**
 * 从备份还原书签
 * 
 * @param timestamp - 备份时间戳
 * @returns Promise<BookmarkInfo[] | null> 书签数据，失败返回 null
 */
export async function restoreFromBackup(timestamp: number): Promise<BookmarkInfo[] | null> {
    const backup = await getBackupByTimestamp(timestamp);
    if (!backup) {
        logger.error('restoreFromBackup: Backup not found', { timestamp });
        return null;
    }
    
    logger.info('restoreFromBackup: Restoring from backup', {
        timestamp,
        bookmarkCount: backup.bookmarkCount
    });
    
    return backup.bookmarkData;
}