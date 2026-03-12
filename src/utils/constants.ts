/**
 * BookmarkHub 常量定义
 * 
 * 所有硬编码值集中定义在此文件
 */

// 同步间隔 (毫秒)
export const SYNC_INTERVALS = {
  ONE_MINUTE: 60 * 1000,
  FIVE_MINUTES: 5 * 60 * 1000,
  FIFTEEN_MINUTES: 15 * 60 * 1000,
  THIRTY_MINUTES: 30 * 60 * 1000,
  ONE_HOUR: 60 * 60 * 1000,
} as const;

// 默认设置值
export const DEFAULT_SETTINGS = {
  SYNC_INTERVAL_MINUTES: 60,
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000,
  MAX_RETRY_DELAY_MS: 10000,
  BACKOFF_FACTOR: 2,
} as const;

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

// GitHub API 配置
export const GITHUB_API = {
  BASE_URL: 'https://api.github.com',
  API_VERSION: '2022-11-28',
} as const;

// 根书签文件夹名称映射
export const ROOT_FOLDER_NAMES = {
  TOOLBAR: ['书签栏', 'Bookmarks Bar', '书签工具栏'],
  MENU: ['菜单文件夹', 'Menu', '书签菜单'],
  UNFILED: ['其他书签', 'Other Bookmarks', '未分类'],
  MOBILE: ['移动设备书签', 'Mobile Bookmarks'],
} as const;

// 浏览器根节点 ID
export const ROOT_NODE_IDS = {
  ROOT: ['0', 'root________'],
  TOOLBAR: ['1', 'toolbar_____'],
  MENU: ['menu________'],
  UNFILED: ['2', 'unfiled_____'],
  MOBILE: ['3', 'mobile______'],
} as const;

// 通知配置
export const NOTIFICATION_CONFIG = {
  DEFAULT_TYPE: 'basic' as const,
  SUCCESS_DURATION: 3000,
  ERROR_DURATION: 5000,
} as const;