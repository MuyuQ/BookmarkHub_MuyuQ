/**
 * 数据获取模块
 * 
 * 负责从远程存储（GitHub Gist 或 WebDAV）获取同步数据，
 * 并提供数据格式检测和解析功能。
 */

import { BookmarkInfo, SyncDataInfo, SyncData } from '../models';
import BookmarkService from '../services';
import { webdavRead } from '../webdav';
import { logger } from '../logger';
import { Setting } from '../setting';

/**
 * Type guard to check if data is in the v1.0 format (SyncDataInfo)
 * @param obj - The data object to check
 */
export function isSyncDataInfo(obj: unknown): obj is SyncDataInfo {
    if (obj == null || typeof obj !== 'object') return false;
    if ('version' in obj && (obj as Record<string, unknown>).version === '2.0') return false;
    return 'bookmarks' in obj && Array.isArray((obj as Record<string, unknown>).bookmarks);
}

/**
 * Type guard to check if data is in the v2.0 format (SyncData)
 * @param obj - The data object to check
 */
export function isSyncData(obj: unknown): obj is SyncData {
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
export function extractBookmarksFromData(data: SyncData | SyncDataInfo | null): BookmarkInfo[] | undefined {
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
export async function fetchRemoteData(setting: Setting): Promise<SyncData | SyncDataInfo | null> {
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
