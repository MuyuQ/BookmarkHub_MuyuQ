/**
 * BookmarkHub 设置存储模块
 * 
 * 使用 webext-options-sync 库管理扩展设置
 * 自动将设置同步到浏览器存储，并在页面加载时自动填充表单
 * 敏感字段（GitHub Token、WebDAV 密码）使用 AES-GCM 加密
 */

import OptionsSync from 'webext-options-sync';
import { encrypt, decrypt, isEncrypted } from './crypto';
import { ValidationError } from './errors';
import { WEBDAV_DEFAULTS } from './constants';
import { logger } from './logger';

/** 敏感字段列表 - 这些字段在存储前会被加密 */
const SENSITIVE_FIELDS = ['githubToken', 'webdavPassword'] as const;

/**
 * 创建 OptionsSync 实例
 * 定义所有用户设置的默认值和迁移函数
 * 
 * 使用说明:
 * - 设置会自动保存到浏览器存储 (browser.storage.local)
 * - 在设置页面中使用 syncForm('#formId') 自动填充表单
 * - 设置变更会自动同步到所有扩展页面
 * - 敏感字段会自动加密存储
 */
const optionsStorage = new OptionsSync({
    /**
     * 默认设置值
     * 用户首次安装扩展时使用这些默认值
     */
    defaults: {
        // ==================== GitHub Gist 设置 ====================
        
        /** GitHub Personal Access Token (用于访问 Gist API) */
        githubToken: '',
        /** Gist ID (要使用的 Gist 的唯一标识符) */
        gistID: '',
        /** Gist 文件名 (存储书签数据的文件名) */
        gistFileName: 'BookmarkHub',
        /** 是否启用操作完成后的系统通知 */
        enableNotify: true,

        // ==================== 自动同步设置 ====================
        
        /** 是否启用自动同步功能 */
        enableAutoSync: false,
        /** 是否启用定时同步 */
        enableIntervalSync: false,
        /** 定时同步间隔 (分钟): 60 / 720 / 1440 */
        syncInterval: 60,
        /** 是否启用事件触发同步 */
        enableEventSync: true,
        /** 冲突处理模式: auto(自动合并) / prompt(提醒用户) */
        conflictMode: 'auto',

        // ==================== 存储服务设置 ====================
        
        /** 存储服务类型: github(GitHub Gist) / webdav(WebDAV) */
        storageType: 'github',

        // ==================== WebDAV 设置 ====================
        
        /** WebDAV 服务器地址 (如: https://your-nas.com/remote.php/dav/files/username/) */
        webdavUrl: '',
        /** WebDAV 用户名 */
        webdavUsername: '',
        /** WebDAV 密码 */
        webdavPassword: '',
        /** WebDAV 路径 (如：/bookmarks.json) */
        webdavPath: WEBDAV_DEFAULTS.PATH,
        
        // ==================== 安全设置 ====================
        
        /** 主密码 (可选，用于加密敏感字段) */
        masterPassword: '',
    },

    /**
     * 迁移函数列表
     * 当扩展版本更新时，用于处理旧版本设置的迁移
     * 确保新版本设置的兼容性
     */
    migrations: [
        /**
         * 内置迁移函数: removeUnused
         * 自动移除不再使用的设置项
         * 保持设置存储的清洁
         */
        OptionsSync.migrations.removeUnused
    ],

    /**
     * 是否启用调试日志
     * 设为 true 时会在控制台输出设置同步的调试信息
     */
    logging: false
});

/**
 * 获取所有设置（带解密）
 * 敏感字段会自动解密
 * 
 * @returns Promise<Record<string, unknown>> 包含所有用户配置的记录
 * @throws {BookmarkHubError} 当解密失败时抛出错误，以区分空值和损坏数据
 */
export async function getAllDecrypted(): Promise<Record<string, unknown>> {
    const options = await optionsStorage.getAll();
    
    const masterPassword = options.masterPassword as string || '';
    const hasMasterPassword = !!masterPassword;
    
    for (const field of SENSITIVE_FIELDS) {
        const value = options[field] as string;
        if (value && isEncrypted(value)) {
            try {
                if (hasMasterPassword) {
                    // P1-17: When master password is set, ONLY use it (no fallback)
                    options[field] = await decrypt(value, masterPassword);
                } else {
                    // No master password - use extension ID (legacy mode)
                    options[field] = await decrypt(value);
                }
            } catch (error: unknown) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                
                if (hasMasterPassword) {
                    // Master password set but decryption failed - don't fallback
                    logger.error(
                        `Decryption failed for ${field} with master password. ` +
                        'Data may be corrupted or password incorrect. ' +
                        'Please re-enter your credentials.'
                    );
                } else {
                    // No master password, extension ID decryption failed
                    logger.warn(
                        `Decryption failed for ${field}. ` +
                        'Extension may have been reinstalled. ' +
                        'Please re-enter your credentials.'
                    );
                }
                
                options[field] = '';
            }
        }
    }
    
    return options;
}

/**
 * 验证设置值
 * 在保存到存储之前验证数据的有效性
 * 
 * @param options - 要验证的设置对象
 * @throws {ValidationError} 当验证失败时抛出验证错误
 */
function validateOptions(options: Record<string, unknown>): void {
    // 验证 URL 格式
    const urlFields = ['webdavUrl'];
    for (const field of urlFields) {
        const value = options[field] as string;
        if (value && typeof value === 'string') {
            try {
                // 允许空字符串（未设置的情况）
                if (value.trim()) {
                    new URL(value);
                }
            } catch {
                throw new ValidationError(
                    `Invalid URL format for ${field}: ${value}`,
                    field,
                    `${field} 的 URL 格式不正确，请输入完整的 URL（包括 https://）`
                );
            }
        }
    }
    
    // 验证必填字段（非空检查）
    const requiredFields = ['gistID', 'gistFileName'];
    for (const field of requiredFields) {
        const value = options[field] as string;
        // 如果提供了值但不能为空
        if (value !== undefined && typeof value === 'string' && value.trim() === '') {
            throw new ValidationError(
                `${field} cannot be empty`,
                field,
                `${field} 不能为空`
            );
        }
    }
    
    // 验证 gistFileName 不能包含非法字符（文件名限制）
    const gistFileName = options.gistFileName as string;
    if (gistFileName && typeof gistFileName === 'string' && gistFileName.trim()) {
        // 检查是否包含路径分隔符或其他危险字符
        if (/[\/\\:*?"<>|]/.test(gistFileName)) {
            throw new ValidationError(
                'gistFileName contains invalid characters',
                'gistFileName',
                'gistFileName 不能包含以下字符：/ \\ : * ? " < > |'
            );
        }
    }
}

/**
 * 设置值（带加密）
 * 敏感字段会自动加密
 * 
 * @param options - 要设置的设置对象
 * @throws {ValidationError} 当验证失败时抛出验证错误
 */
export async function setEncrypted(options: Record<string, unknown>): Promise<void> {
    // 在加密之前先验证
    validateOptions(options);
    
    const encryptedOptions = { ...options };
    
    // 获取 masterPassword（如果设置了）
    const masterPassword = options.masterPassword as string || '';
    
    for (const field of SENSITIVE_FIELDS) {
        const value = encryptedOptions[field] as string;
        if (value && typeof value === 'string' && !isEncrypted(value)) {
            // 使用 masterPassword 加密（如果设置了），否则使用扩展 ID
            encryptedOptions[field] = await encrypt(value, masterPassword || undefined);
        }
    }
    
    await optionsStorage.set(encryptedOptions);
}

export default optionsStorage;
