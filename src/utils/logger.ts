/**
 * BookmarkHub 日志模块
 *
 * 提供统一的日志记录功能，支持开发/生产环境区分
 */

/**
 * 日志级别层次定义
 * 数值越大，级别越高，过滤掉更低级别的日志
 */
const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
} as const;

/**
 * 日志级别类型定义
 * - 'debug': 调试级别，仅在开发环境启用，用于详细调试信息
 * - 'info': 信息级别，记录一般运行信息（默认级别）
 * - 'warn': 警告级别，记录潜在问题但不影响运行
 * - 'error': 错误级别，记录错误信息，始终启用
 */
export type LogLevel = keyof typeof LOG_LEVELS;

interface LoggerConfig {
  level: LogLevel;
  enableDebug: boolean;
  prefix: string;
}

const isDevelopment = import.meta.env.DEV;

const config: LoggerConfig = {
  level: 'info',
  enableDebug: isDevelopment,
  prefix: '[BookmarkHub]',
};

/**
 * 检查指定日志级别是否应该输出
 *
 * @param level - 要检查的日志级别
 * @returns 如果当前配置级别允许输出该级别日志，返回 true
 */
function shouldLog(level: LogLevel): boolean {
  const currentLevel = LOG_LEVELS[config.level] ?? LOG_LEVELS.info;
  return LOG_LEVELS[level] >= currentLevel;
}

const SENSITIVE_FIELDS = ['githubToken', 'webdavPassword', 'password', 'token', 'authorization'];

/**
 * 清理对象中的敏感信息
 * 
 * 递归遍历对象，将包含敏感字段名的值替换为占位符
 * 用于防止敏感信息（如 token、密码等）被记录到日志中
 * 
 * @param obj - 需要清理的对象
 * @returns 清理后的对象，敏感字段值被替换为 '***REDACTED***'
 * 
 * @example
 * sanitizeObject({ token: 'abc123', name: 'test' }) 
 * // 返回：{ token: '***REDACTED***', name: 'test' }
 */
function sanitizeObject(obj: unknown): unknown {
  if (typeof obj !== 'object' || obj === null) return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_FIELDS.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
      sanitized[key] = '***REDACTED***';
    } else if (typeof value === 'object') {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function formatMessage(level: LogLevel, message: string): string {
  const timestamp = new Date().toISOString();
  return `${config.prefix} [${timestamp}] [${level.toUpperCase()}] ${message}`;
}

export function setLogLevel(level: 'debug' | 'info' | 'warn' | 'error'): void {
  config.level = level;
}

export const logger = {
  debug: (message: string, data?: unknown): void => {
    if (config.enableDebug || shouldLog('debug')) {
      console.log(formatMessage('debug', message), sanitizeObject(data) ?? '');
    }
  },

  info: (message: string, data?: unknown): void => {
    if (shouldLog('info')) {
      console.info(formatMessage('info', message), sanitizeObject(data) ?? '');
    }
  },

  warn: (message: string, data?: unknown): void => {
    if (shouldLog('warn')) {
      console.warn(formatMessage('warn', message), sanitizeObject(data) ?? '');
    }
  },

  error: (message: string, data?: unknown): void => {
    console.error(formatMessage('error', message), sanitizeObject(data) ?? '');
  },
};

// 专用模块日志
export const logSync = {
  start: () => logger.info('Sync started'),
  success: (count: number) => logger.info(`Sync succeeded with ${count} bookmarks`),
  failed: (error: string) => logger.error(`Sync failed: ${error}`),
  skipped: (reason: string) => logger.warn(`Sync skipped: ${reason}`),
};

export const logBookmarks = {
  upload: (count: number) => logger.info(`Uploaded ${count} bookmarks`),
  download: (count: number) => logger.info(`Downloaded ${count} bookmarks`),
  clear: () => logger.info('Cleared local bookmarks'),
  create: (count: number) => logger.info(`Created ${count} bookmarks`),
};

export const logWebDAV = {
  read: (success: boolean) => logger.info(`WebDAV read ${success ? 'succeeded' : 'failed'}`),
  write: (success: boolean) => logger.info(`WebDAV write ${success ? 'succeeded' : 'failed'}`),
  test: (success: boolean) => logger.info(`WebDAV connection test ${success ? 'succeeded' : 'failed'}`),
};

export const logSettings = {
  loaded: () => logger.debug('Settings loaded'),
  saved: () => logger.debug('Settings saved'),
  changed: (key: string) => logger.debug(`Setting changed: ${key}`),
};