/**
 * 手动同步传输模块
 *
 * 手动上传/下载与自动同步使用完全相同的数据格式与上传路径（P0-3/P0-4）：
 * - 上传：读远程 → 合并双方墓碑 → 过滤已删除书签 → 通过 uploadSnapshot
 *   追加备份记录写回（保留远程备份历史）→ 同步更新本地基线缓存
 * - 下载：读取远程最新快照
 */

import type { Setting } from './setting';
import type { BookmarkInfo, SyncData } from './models';
import { uploadSnapshot } from './sync';
import { fetchRemoteData, isSyncData } from './sync/dataFetcher';
import { normalizeBookmarkIds, normalizeTreeShape, filterTombstonedNodes, getBookmarkCount } from './bookmarkUtils';
import { mergeTombstones } from './merge';
import { getLocalCache, saveLocalCache } from './localCache';
import { getBrowserInfo } from './browserInfo';
import { getStorageProvider } from './sync/storageProvider';
import { createError } from './errors';
import { safeJsonParse, sanitizeBookmarkTree } from './sanitize';
import { logger } from './logger';

export async function uploadManualBookmarks(setting: Setting, bookmarks: BookmarkInfo[]): Promise<SyncData> {
    // 1. 获取现有远程数据（用于保留备份历史与墓碑）
    const existingData = await fetchRemoteData(setting);
    const remoteTombstones = (existingData && isSyncData(existingData)) ? existingData.tombstones || [] : [];

    // 2. 获取本地缓存墓碑（用户在此设备上的删除记录）
    const localCache = await getLocalCache();
    const localTombstones = localCache?.tombstones || [];

    // 3. 合并双方墓碑，并从上传内容中剔除已删除的书签（防止复活）
    const tombstones = mergeTombstones(localTombstones, remoteTombstones);
    const tombstoneIds = new Set(tombstones.map(t => t.id));

    // 4. 统一为剥根格式并标准化 ID（与自动同步一致，P0-4）
    const stripped = normalizeTreeShape(bookmarks);
    normalizeBookmarkIds(stripped);
    const filtered = tombstoneIds.size > 0 ? filterTombstonedNodes(stripped, tombstoneIds) : stripped;

    // 5. 通过统一上传路径写回（保留远程备份历史与墓碑）
    const syncData = await uploadSnapshot(filtered, tombstones);

    // 6. 上传内容即本机最新状态，同步更新本地基线缓存，
    //    避免下次自动同步把本次上传内容重新当作本地变更
    const newCache: SyncData = {
        ...syncData,
        lastSyncTimestamp: Date.now(),
        sourceBrowser: getBrowserInfo(),
    };
    await saveLocalCache(newCache);

    logger.info('uploadManualBookmarks: 手动上传完成', {
        count: getBookmarkCount(filtered),
        tombstones: tombstones.length,
    });
    return syncData;
}

export async function downloadManualBookmarks(setting: Setting): Promise<BookmarkInfo[]> {
    // P3 架构重构：统一存储后端抽象
    const content = await getStorageProvider(setting).read();

    if (!content) {
        const remoteName = setting.storageType === 'webdav' ? setting.webdavPath : setting.gistFileName;
        throw createError.fileNotFound(remoteName, setting.storageType);
    }

    let data: unknown;
    try {
        // P1-11: 安全解析（原型污染防护），损坏数据给出明确错误而不是裸 SyntaxError
        data = safeJsonParse(content);
    } catch {
        throw createError.parseError('Remote sync data is not valid JSON');
    }

    if (data && typeof data === 'object' && (data as { version?: string }).version === '2.0') {
        const bookmarks = (data as SyncData).backupRecords?.[0]?.bookmarkData;
        if (!bookmarks || bookmarks.length === 0) {
            throw createError.emptyGistFile(setting.gistFileName);
        }
        // 与同步路径同一安全标准：协议白名单、标题清洗、剥根归一化
        return normalizeTreeShape(sanitizeBookmarkTree(bookmarks));
    }

    const legacyBookmarks = (data as { bookmarks?: BookmarkInfo[] }).bookmarks;
    if (Array.isArray(legacyBookmarks) && legacyBookmarks.length > 0) {
        return normalizeTreeShape(sanitizeBookmarkTree(legacyBookmarks));
    }

    throw createError.invalidDataFormat();
}
