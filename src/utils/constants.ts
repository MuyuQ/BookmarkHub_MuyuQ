/**
 * BookmarkHub 常量定义
 * 
 * 所有硬编码值集中定义在此文件
 */

const isProduction = import.meta.env.PROD;

export const ENVIRONMENT = {
  IS_PRODUCTION: isProduction,
  DEFAULT_DEBUG_MODE: !isProduction,
} as const;

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

// 备份系统存储键名
export const BACKUP_STORAGE_KEYS = {
  /** 本地缓存存储 key */
  LOCAL_CACHE_KEY: 'bookmarkHubCache',
  /** 操作锁存储 key */
  SYNC_LOCK_KEY: 'syncLock',
  /** 待同步标志存储 key */
  PENDING_SYNC_KEY: 'pendingSync',
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

// HTTP 状态码常量
export enum HttpStatusCode {
  /** 客户端错误 */
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  REQUEST_TIMEOUT = 408,
  PAYLOAD_TOO_LARGE = 413,
  TOO_MANY_REQUESTS = 429, /* 速率限制 */
  
  /** 服务器错误 */
  INTERNAL_SERVER_ERROR = 500,
  BAD_GATEWAY = 502,
  SERVICE_UNAVAILABLE = 503,
  GATEWAY_TIMEOUT = 504,
  
  /** 成功 */
  OK = 200,
  CREATED = 201,
  ACCEPTED = 202,
  NO_CONTENT = 204,
}

// HTTP 重试状态码配置
export const HTTP_RETRY_CODES = {
  /** 需要重试的客户端错误码 */
  CLIENT_ERRORS: [HttpStatusCode.REQUEST_TIMEOUT, HttpStatusCode.PAYLOAD_TOO_LARGE, HttpStatusCode.TOO_MANY_REQUESTS],
  /** 需要重试的服务器错误码 */
  SERVER_ERRORS: [
    HttpStatusCode.INTERNAL_SERVER_ERROR,
    HttpStatusCode.BAD_GATEWAY,
    HttpStatusCode.SERVICE_UNAVAILABLE,
    HttpStatusCode.GATEWAY_TIMEOUT
  ],
  /** 速率限制错误码 */
  RATE_LIMIT: HttpStatusCode.TOO_MANY_REQUESTS,
  /** 禁止访问错误码 */
  FORBIDDEN_ERRORS: [HttpStatusCode.FORBIDDEN, HttpStatusCode.TOO_MANY_REQUESTS],
  /** 可视为成功的错误码（如 404 对于删除操作） */
  COMPARABLE_TO_SUCCESS: [HttpStatusCode.NOT_FOUND],
} as const;