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
import { createError } from '../errors';
import { normalizeTreeShape } from '../bookmarkUtils';
import { safeJsonParse, sanitizeBookmarkTree } from '../sanitize';

/** 远程数据最大允许大小 (10 MB) */
const MAX_REMOTE_DATA_SIZE = 10 * 1024 * 1024;

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

    let bookmarks: BookmarkInfo[] | undefined;

    if (isSyncData(data)) {
        // It's v2.0 format - get bookmarks from the most recent backup record
        if (data.backupRecords && data.backupRecords.length > 0) {
            bookmarks = data.backupRecords[0].bookmarkData;
        }
    } else if (isSyncDataInfo(data)) {
        // It's v1.0 format - get bookmarks directly
        bookmarks = data.bookmarks;
    }

    // 兼容历史数据中的虚拟根/合成根节点包裹，统一为剥根格式（P0-4），
    // 并按统一安全标准清洗（协议白名单/标题去标签，P1-11）
    return bookmarks ? normalizeTreeShape(sanitizeBookmarkTree(bookmarks)) : undefined;
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

    // 检查远程数据大小，防止内存溢出
    const contentSize = new Blob([content]).size;
    if (contentSize > MAX_REMOTE_DATA_SIZE) {
      logger.error('fetchRemoteData: 远程数据过大', {
        size: contentSize,
        maxSize: MAX_REMOTE_DATA_SIZE
      });
      throw createError.parseError(
        `Remote data too large (${(contentSize / 1024 / 1024).toFixed(1)} MB, max ${(MAX_REMOTE_DATA_SIZE / 1024 / 1024)} MB)`
      );
    }

    try {
        // P1-11: 安全解析——带原型污染防护；解析失败视为"远程数据损坏"，
        // 抛错中止同步而不是返回 null（返回 null 会让同步以"远程无数据"继续，
        // 进而被本地快照覆盖，造成数据丢失）
        const data = safeJsonParse(content);

        // 版本检测
        if (data && typeof data === 'object' && (data as { version?: string }).version === '2.0') {
            logger.info('fetchRemoteData: 检测到格式 v2.0');
            return data as SyncData;
        } else if (data && typeof data === 'object' && Array.isArray((data as { bookmarks?: unknown }).bookmarks) && !((data as Record<string, unknown>).backupRecords)) {
            logger.info('fetchRemoteData: 检测到格式 v1.0（旧格式）');
            return data as SyncDataInfo;
        }

        logger.error('fetchRemoteData: 无法识别的远程数据格式，中止同步', { keys: Object.keys((data as object) || {}) });
        throw createError.parseError('Unrecognized remote sync data format');
    } catch (error) {
        logger.error('fetchRemoteData: 远程数据解析失败，中止同步', error);
        throw error instanceof Error ? error : createError.parseError('Failed to parse remote sync data');
    }
}
