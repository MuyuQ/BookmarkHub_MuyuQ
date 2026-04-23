/**
 * BookmarkHub 常量定义
 * 
 * 所有硬编码值集中定义在此文件
 */

// HTTP 超时配置
export const HTTP_TIMEOUTS = {
  GITHUB_API: 60000,
  WEBDAV: 30000,
} as const;

// 存储键名
export const STORAGE_KEYS = {
  LOCAL_COUNT: 'localCount',
  REMOTE_COUNT: 'remoteCount',
  LAST_SYNC_TIME: 'lastSyncTime',
  LAST_SYNC_STATUS: 'lastSyncStatus',
  LAST_SYNC_ERROR: 'lastSyncError',
} as const;

// WebDAV 默认配置
export const WEBDAV_DEFAULTS = {
  PATH: '/bookmarkhub-bookmarks.json',
  TIMEOUT_MS: 30000,
} as const;

// 根书签文件夹名称映射
export const ROOT_FOLDER_NAMES: Record<string, string[]> = {
  TOOLBAR: ['书签栏', 'Bookmarks Bar', '书签工具栏'],
  MENU: ['菜单文件夹', 'Menu', '书签菜单'],
  UNFILED: ['其他书签', 'Other Bookmarks', '未分类'],
  MOBILE: ['移动设备书签', 'Mobile Bookmarks'],
};

// 浏览器根节点 ID
export const ROOT_NODE_IDS: Record<string, string[]> = {
  ROOT: ['0', 'root________'],
  TOOLBAR: ['1', 'toolbar_____'],
  MENU: ['menu________'],
  UNFILED: ['2', 'unfiled_____'],
  MOBILE: ['3', 'mobile______'],
};
export const BACKUP_STORAGE_KEYS = {
  /** 本地缓存存储 key */
  LOCAL_CACHE_KEY: 'bookmarkHubCache',
  /** 操作锁存储 key */
  SYNC_LOCK_KEY: 'syncLock',
  /** 待同步标志存储 key */
  PENDING_SYNC_KEY: 'pendingSync',
  /** 同步锁状态持久化 key (MV3 Service Worker 休眠恢复) */
  SYNC_STATE_KEY: 'syncState',
} as const;

// 备份系统默认配置
export const BACKUP_DEFAULTS = {
  /** 默认备份数量上限 */
  MAX_BACKUPS: 3,
  /** 防抖等待时间 (毫秒) */
  DEBOUNCE_TIME: 5000,
  /** 最大等待时间 (毫秒) */
  MAX_WAIT_TIME: 30000,
  /** 锁超时时间 (毫秒) */
  LOCK_TIMEOUT: 60000,
} as const;

// MV3 Service Worker 配置
export const MV3_CONFIG = {
  /** 定时同步 Alarm 名称 */
  SYNC_ALARM_NAME: 'bookmarkhub-interval-sync',
} as const;