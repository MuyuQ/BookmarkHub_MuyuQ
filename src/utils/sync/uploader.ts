/**
 * 统一上传模块 (P0-3/P0-4)
 *
 * 自动同步与手动上传共用的快照上传路径：
 * 读取现有远程数据以保留备份历史，将新快照追加为最新备份记录后整体写回。
 */

import { Setting } from '../setting';
import { SyncData, BackupRecord, Tombstone, SyncDataInfo } from '../models';
import { getBookmarkCount } from '../bookmarkUtils';
import { logger } from '../logger';
import { mergeTombstones } from '../merge';
import { sortBackupRecords } from '../localCache';
import { getBrowserInfo } from '../browserInfo';
import { BACKUP_DEFAULTS } from '../constants';
import { getStorageProvider } from './storageProvider';
import { fetchRemoteData, isSyncData } from './dataFetcher';

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
    const existingData = await fetchRemoteData(setting);

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
        if (isSyncData(existingData)) {
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

    // 步骤6: 通过统一存储后端抽象写入（P3 架构重构）
    const provider = getStorageProvider(setting);
    await provider.write(content);
    logger.info('uploadSnapshot: 上传完成');
    return uploadData;
}

