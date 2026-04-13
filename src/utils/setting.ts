/**
 * BookmarkHub 设置管理模块
 * 
 * 提供设置类的定义和构建方法
 * 用于在代码中方便地获取用户配置
 */

import { getAllDecrypted } from './optionsStorage';
import { WEBDAV_DEFAULTS } from './constants';
import optionsStorage from './optionsStorage';

/**
 * 设置基类
 * 定义所有设置的类型和默认值
 */
export class SettingBase {
    /**
     * 构造函数
     * 初始化所有设置属性
     */
    constructor() { }

    // ==================== GitHub Gist 设置 ====================

    /** GitHub Personal Access Token */
    githubToken: string = '';
    /** Gist ID */
    gistID: string = '';
    /** Gist 文件名 */
    gistFileName: string = 'BookmarkHub';
    /** 是否启用通知 */
    enableNotify: boolean = true;

    // ==================== 自动同步设置 ====================

    /** 是否启用自动同步 */
    enableAutoSync: boolean = false;
    /** 是否启用定时同步 */
    enableIntervalSync: boolean = false;
    /** 定时同步间隔 (分钟) */
    syncInterval: number = 60;
    /** 是否启用事件触发同步 */
    enableEventSync: boolean = true;
    /** 冲突处理模式: auto(自动) / prompt(提醒) */
    conflictMode: 'auto' | 'prompt' = 'auto';

    // ==================== 存储服务设置 ====================

    /** 存储服务类型: github / webdav */
    storageType: 'github' | 'webdav' = 'github';

    // ==================== WebDAV 设置 ====================

    /** WebDAV 服务器地址 */
    webdavUrl: string = '';
    /** WebDAV 用户名 */
    webdavUsername: string = '';
    /** WebDAV 密码 */
    webdavPassword: string = '';
    /** WebDAV 路径 */
    webdavPath: string = WEBDAV_DEFAULTS.PATH;

    // ==================== 安全设置 ====================
    
    /** 主密码用于加密 */
    masterPassword: string = '';
}

/**
 * 设置类
 * 提供从存储构建设置的静态方法
 * 
 * 使用方法:
 *   const setting = await Setting.build();
 *   console.log(setting.githubToken);
 *   console.log(setting.enableAutoSync);
 */
export class Setting extends SettingBase {
    /** 缓存的设置实例 */
    private static cachedSetting: Setting | null = null;
    /** 缓存时间戳 */
    private static cacheTimestamp = 0;
    /** 缓存有效期 (5秒) */
    private static readonly CACHE_TTL = 5000;

    /**
     * 私有构造函数
     * 防止直接实例化
     */
    private constructor() { super(); }

    /**
     * 清除缓存（设置变更时调用）
     */
    static clearCache(): void {
        Setting.cachedSetting = null;
        Setting.cacheTimestamp = 0;
    }

    /**
     * 异步构建方法
     * 从浏览器存储中加载所有设置并返回 Setting 实例
     * 
     * @returns Promise<Setting> 包含所有用户配置的 Setting 实例
     * 
     * 使用示例:
     *   async function uploadBookmarks() {
     *     const setting = await Setting.build();
     *     if (!setting.githubToken) {
     *       throw new Error('GitHub Token 未设置');
     *     }
     *     // 使用设置进行操作...
     *   }
     */
    static async build(): Promise<Setting> {
        const now = Date.now();
        // 返回缓存（如果在有效期内）
        if (Setting.cachedSetting && now - Setting.cacheTimestamp < Setting.CACHE_TTL) {
            return Setting.cachedSetting;
        }
        
        // 从存储获取所有设置（敏感字段已解密）
        const options = await getAllDecrypted();
        
        // 创建新的 Setting 实例
        const setting = new Setting();
        
        // 复制 GitHub Gist 相关设置
        setting.gistID = options.gistID as string;
        setting.gistFileName = options.gistFileName as string;
        setting.githubToken = options.githubToken as string;
        setting.enableNotify = options.enableNotify as boolean;
        
        // 复制自动同步设置 (使用类型断言确保类型安全)
        setting.enableAutoSync = Boolean(options.enableAutoSync);
        setting.enableIntervalSync = Boolean(options.enableIntervalSync);
        setting.enableEventSync = Boolean(options.enableEventSync);
        setting.syncInterval = Number(options.syncInterval) || 60;
        setting.conflictMode = (options.conflictMode as 'auto' | 'prompt') || 'auto';
        
        // 复制存储服务设置
        setting.storageType = (options.storageType as 'github' | 'webdav') || 'github';
        
        // 复制 WebDAV 设置 (密码已解密)
        setting.webdavUrl = options.webdavUrl as string;
        setting.webdavUsername = options.webdavUsername as string;
        setting.webdavPassword = options.webdavPassword as string;
        setting.webdavPath = options.webdavPath as string;
        
        // 复制安全设置
        setting.masterPassword = options.masterPassword as string;

        // 更新缓存
        Setting.cachedSetting = setting;
        Setting.cacheTimestamp = now;

        return setting;
    }
}

// 监听设置变更，自动清除缓存
optionsStorage.onChanged(() => {
    Setting.clearCache();
});
