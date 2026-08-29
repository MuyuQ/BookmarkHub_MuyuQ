/**
 * 存储后端抽象层 (P3 架构重构)
 *
 * 将 GitHub Gist 与 WebDAV 两种后端的读写统一到一个接口后面，
 * 消除散布在 sync.ts / dataFetcher.ts / manualSyncTransfer.ts 的
 * `storageType === 'webdav'` 分支；新增存储后端只需实现本接口。
 *
 * 错误语义（两种后端一致）:
 * - read(): null 表示远端尚无数据；请求失败/数据不可达时抛出异常
 * - write(): 失败时抛出异常
 */

import { Setting } from '../setting';
import BookmarkService from '../services';
import { getWebDAVClient } from '../webdav';
import { sanitizePath } from '../webdav';
import { createError } from '../errors';
import { logger } from '../logger';

export interface StorageProvider {
    /** 读取远程同步数据；null 表示远端尚无数据，错误抛出 */
    read(): Promise<string | null>;
    /** 写入远程同步数据；失败抛出 */
    write(content: string): Promise<void>;
}

/** GitHub Gist 后端 */
class GistProvider implements StorageProvider {
    async read(): Promise<string | null> {
        return BookmarkService.get();
    }

    async write(content: string): Promise<void> {
        const setting = await Setting.build();
        await BookmarkService.update({
            files: {
                [setting.gistFileName]: { content },
            },
            description: setting.gistFileName,
        });
    }
}

/** WebDAV 后端 */
class WebDAVProvider implements StorageProvider {
    async read(): Promise<string | null> {
        const client = await getWebDAVClient();
        if (!client) {
            throw createError.webdavConnectionFailed('WebDAV is not configured');
        }
        try {
            const setting = await Setting.build();
            return await client.read(sanitizePath(setting.webdavPath));
        } finally {
            // 操作完成后立即清除内存中的认证信息
            client.clearCredentials();
        }
    }

    async write(content: string): Promise<void> {
        const client = await getWebDAVClient();
        if (!client) {
            throw createError.webdavConnectionFailed('WebDAV is not configured');
        }
        try {
            const setting = await Setting.build();
            const succeeded = await client.write(sanitizePath(setting.webdavPath), content);
            if (!succeeded) {
                throw createError.networkError('WebDAV upload failed');
            }
        } finally {
            client.clearCredentials();
        }
    }
}

/**
 * 根据设置获取对应的存储后端
 *
 * @param setting - 用户设置
 * @returns StorageProvider 存储后端实例
 */
export function getStorageProvider(setting: Setting): StorageProvider {
    if (setting.storageType === 'webdav') {
        logger.debug('getStorageProvider: using WebDAV backend');
        return new WebDAVProvider();
    }
    logger.debug('getStorageProvider: using GitHub Gist backend');
    return new GistProvider();
}
