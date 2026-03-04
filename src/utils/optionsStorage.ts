/**
 * BookmarkHub 设置存储模块
 * 
 * 使用 webext-options-sync 库管理扩展设置
 * 自动将设置同步到浏览器存储，并在页面加载时自动填充表单
 */

import OptionsSync from 'webext-options-sync';

/**
 * 创建 OptionsSync 实例
 * 定义所有用户设置的默认值和迁移函数
 * 
 * 使用说明:
 * - 设置会自动保存到浏览器存储 (browser.storage.local)
 * - 在设置页面中使用 syncForm('#formId') 自动填充表单
 * - 设置变更会自动同步到所有扩展页面
 */
export default new OptionsSync({
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
        /** GitHub API 地址 (一般不需要修改) */
        githubURL: 'https://api.github.com',

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
        /** WebDAV 路径 (如: /bookmarks.json) */
        webdavPath: '/bookmarks.json',
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
