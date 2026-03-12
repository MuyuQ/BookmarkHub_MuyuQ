/**
 * BookmarkHub 日志模块
 * 
 * 提供统一的日志记录功能，支持开发/生产环境区分
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerConfig {
  level: LogLevel;
  enableDebug: boolean;
  prefix: string;
}

const isDevelopment = process.env.NODE_ENV === 'development';

const config: LoggerConfig = {
  level: (process.env.LOG_LEVEL as LogLevel) || 'info',
  enableDebug: isDevelopment,
  prefix: '[BookmarkHub]',
};

function formatMessage(level: LogLevel, message: string): string {
  const timestamp = new Date().toISOString();
  return `${config.prefix} [${timestamp}] [${level.toUpperCase()}] ${message}`;
}

export const logger = {
  debug: (message: string, data?: unknown): void => {
    if (config.enableDebug) {
      console.log(formatMessage('debug', message), data ?? '');
    }
  },
  
  info: (message: string, data?: unknown): void => {
    if (config.level !== 'error') {
      console.info(formatMessage('info', message), data ?? '');
    }
  },
  
  warn: (message: string, data?: unknown): void => {
    if (config.level !== 'error') {
      console.warn(formatMessage('warn', message), data ?? '');
    }
  },
  
  error: (message: string, data?: unknown): void => {
    console.error(formatMessage('error', message), data ?? '');
  },
};

// 专用模块日志
export const logSync = {
  start: () => logger.info('开始同步'),
  success: (count: number) => logger.info(`同步成功，共 ${count} 个书签`),
  failed: (error: string) => logger.error(`同步失败: ${error}`),
  skipped: (reason: string) => logger.warn(`同步跳过: ${reason}`),
};

export const logBookmarks = {
  upload: (count: number) => logger.info(`上传 ${count} 个书签`),
  download: (count: number) => logger.info(`下载 ${count} 个书签`),
  clear: () => logger.info('清空本地书签'),
  create: (count: number) => logger.info(`创建 ${count} 个书签`),
};

export const logWebDAV = {
  read: (success: boolean) => logger.info(`WebDAV 读取${success ? '成功' : '失败'}`),
  write: (success: boolean) => logger.info(`WebDAV 写入${success ? '成功' : '失败'}`),
  test: (success: boolean) => logger.info(`WebDAV 连接测试${success ? '成功' : '失败'}`),
};

export const logSettings = {
  loaded: () => logger.debug('设置已加载'),
  saved: () => logger.debug('设置已保存'),
  changed: (key: string) => logger.debug(`设置变更: ${key}`),
};