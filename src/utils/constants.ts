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

// 跨上下文消息协议（background <-> popup/options/sync）
export const MESSAGE_NAMES = {
  UPLOAD: 'upload',
  DOWNLOAD: 'download',
  REMOVE_ALL: 'removeAll',
  SETTING: 'setting',
  SYNC: 'sync',
  GET_BACKUP_RECORDS: 'getBackupRecords',
  RESTORE_FROM_BACKUP: 'restoreFromBackup',
  DELETE_BACKUP_RECORD: 'deleteBackupRecord',
  REFRESH_COUNTS: 'refreshCounts',
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
// 覆盖主流浏览器语言的本地化根文件夹标题；未命中的语言会把内容归入"其他书签"
// （可在发现新变体时按类别追加，注意各类别之间不能有重复字符串）
export const ROOT_FOLDER_NAMES: Record<string, string[]> = {
  TOOLBAR: [
    '书签栏', '书签工具栏', 'Bookmarks Bar', 'Bookmarks bar',
    'Leseleiste', 'Favoritenleiste',          // de
    'Barre de favoris',                        // fr
    'Barra de favoritos',                      // es / pt-BR
    'Barra de marcadores',                     // pt-PT
    'Barra dei segnalibri',                    // it
    'ブックマークバー',                         // ja
    '북마크바', '북마크 도구모음',                // ko
    'Панель закладок',                         // ru
    'شريط المفضلة',                            // ar
    'Bladwijzerbalk',                          // nl
  ],
  MENU: [
    '菜单文件夹', '书签菜单', 'Bookmarks Menu',
    'Lesezeichen-Menü',                        // de
    'Menu des marque-pages',                   // fr
    'Menú de marcadores',                      // es
    'Menu dei segnalibri',                     // it
    'ブックマークメニュー',                      // ja
    '북마크 메뉴',                               // ko
    'Меню закладок',                           // ru
    'قائمة المفضلة',                           // ar
  ],
  UNFILED: [
    '其他书签', '未分类', 'Other Bookmarks',
    'Weitere Lesezeichen',                     // de
    'Autres favoris',                          // fr
    'Otros marcadores',                        // es
    'Outros favoritos',                        // pt
    'Altri segnalibri',                        // it
    'その他のブックマーク',                      // ja
    '기타 북마크',                               // ko
    'Другие закладки',                         // ru
    'مفضلات أخرى',                             // ar
    'Andere bladwijzers',                      // nl
  ],
  MOBILE: [
    '移动设备书签', 'Mobile Bookmarks',
    'Mobil-Lesezeichen', 'Mobile Favoriten',   // de
    'Favoris de mobile', 'Marque-pages mobiles', // fr
    'Marcadores móviles',                      // es
    'Favoritos móveis',                        // pt
    'Segnalibri mobili',                       // it
    'モバイルのブックマーク',                     // ja
    '모바일 북마크',                             // ko
    'Мобильные закладки',                      // ru
    'مفضلات الهاتف المحمول',                   // ar
    'Mobiele bladwijzers',                     // nl
  ],
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
  /** 同步状态过期时间 (毫秒) - 用于 Service Worker 休眠恢复 */
  SYNC_STATE_EXPIRY_MS: 5 * 60 * 1000, // 5 分钟
} as const;