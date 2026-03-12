/**
 * BookmarkHub 错误处理模块
 * 
 * 提供标准化的错误类型和处理机制
 */

/**
 * 错误代码枚举
 * 所有错误类型统一定义
 */
export enum ErrorCode {
  // 认证错误
  AUTH_TOKEN_MISSING = 'AUTH_TOKEN_MISSING',
  AUTH_TOKEN_INVALID = 'AUTH_TOKEN_INVALID',
  GIST_ID_MISSING = 'GIST_ID_MISSING',
  FILE_NAME_MISSING = 'FILE_NAME_MISSING',
  
  // 网络错误
  NETWORK_ERROR = 'NETWORK_ERROR',
  REQUEST_TIMEOUT = 'REQUEST_TIMEOUT',
  RATE_LIMIT = 'RATE_LIMIT',
  
  // 同步错误
  SYNC_FAILED = 'SYNC_FAILED',
  SYNC_IN_PROGRESS = 'SYNC_IN_PROGRESS',
  MERGE_FAILED = 'MERGE_FAILED',
  
  // WebDAV 错误
  WEBDAV_AUTH_FAILED = 'WEBDAV_AUTH_FAILED',
  WEBDAV_READ_ERROR = 'WEBDAV_READ_ERROR',
  WEBDAV_WRITE_ERROR = 'WEBDAV_WRITE_ERROR',
  
  // 导入导出错误
  IMPORT_ERROR = 'IMPORT_ERROR',
  EXPORT_ERROR = 'EXPORT_ERROR',
  PARSE_ERROR = 'PARSE_ERROR',
  
  // 通用错误
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
}

/**
 * BookmarkHub 标准错误类
 * 所有错误统一使用此类
 */
export class BookmarkHubError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    public userMessage: string,
    public retryable: boolean = false,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'BookmarkHubError';
    
    // 保持堆栈跟踪
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, BookmarkHubError);
    }
  }
  
  /**
   * 转换为日志字符串
   */
  toLogString(): string {
    return `[${this.code}] ${this.message}`;
  }
  
  /**
   * 转换为显示给用户的字符串
   */
  toUserString(): string {
    return this.userMessage;
  }
}

/**
 * 验证错误类
 * 用于设置验证等场景
 */
export class ValidationError extends BookmarkHubError {
  constructor(
    message: string,
    public field: string,
    userMessage: string
  ) {
    super(message, ErrorCode.VALIDATION_ERROR, userMessage, false);
    this.name = 'ValidationError';
  }
}

/**
 * 通用错误处理函数
 * 将任何错误转换为 BookmarkHubError
 */
export function handleError(error: unknown): BookmarkHubError {
  // 已经是 BookmarkHubError，直接返回
  if (error instanceof BookmarkHubError) {
    return error;
  }
  
  // 是标准 Error，包装为 BookmarkHubError
  if (error instanceof Error) {
    return new BookmarkHubError(
      error.message,
      ErrorCode.UNKNOWN_ERROR,
      '操作失败，请稍后重试',
      true,
      error
    );
  }
  
  // 其他类型（字符串、数字等）
  return new BookmarkHubError(
    String(error),
    ErrorCode.UNKNOWN_ERROR,
    '发生未知错误',
    false,
    error
  );
}

/**
 * 创建特定类型的错误
 */
export const createError = {
  authTokenMissing: () => new BookmarkHubError(
    'GitHub Token not set',
    ErrorCode.AUTH_TOKEN_MISSING,
    'GitHub Token 未设置。请在设置页面配置您的 GitHub Personal Access Token。',
    false
  ),
  
  gistIdMissing: () => new BookmarkHubError(
    'Gist ID not set',
    ErrorCode.GIST_ID_MISSING,
    'Gist ID 未设置。请先创建一个 Gist 并在设置页面填入其 ID。',
    false
  ),
  
  fileNameMissing: () => new BookmarkHubError(
    'Gist file name not set',
    ErrorCode.FILE_NAME_MISSING,
    'Gist 文件名未设置。请在设置页面指定要使用的文件名。',
    false
  ),
  
  syncFailed: (message: string, originalError?: unknown) => new BookmarkHubError(
    message,
    ErrorCode.SYNC_FAILED,
    '同步失败，请检查设置和网络',
    true,
    originalError
  ),
  
  networkError: (message: string, retryable: boolean = true) => new BookmarkHubError(
    message,
    ErrorCode.NETWORK_ERROR,
    '网络请求失败，请检查网络连接',
    retryable
  ),
  
  webdavAuthFailed: () => new BookmarkHubError(
    'WebDAV authentication failed',
    ErrorCode.WEBDAV_AUTH_FAILED,
    'WebDAV 认证失败，请检查用户名和密码',
    false
  ),
  
  webdavReadError: (message: string) => new BookmarkHubError(
    message,
    ErrorCode.WEBDAV_READ_ERROR,
    'WebDAV 读取失败，请检查服务器状态',
    true
  ),
  
  webdavWriteError: (message: string) => new BookmarkHubError(
    message,
    ErrorCode.WEBDAV_WRITE_ERROR,
    'WebDAV 写入失败，请检查权限设置',
    true
  ),
  
  importError: (message: string) => new BookmarkHubError(
    message,
    ErrorCode.IMPORT_ERROR,
    '导入失败，请检查文件格式',
    false
  ),
  
  exportError: (message: string) => new BookmarkHubError(
    message,
    ErrorCode.EXPORT_ERROR,
    '导出失败，请稍后重试',
    false
  ),
  
  parseError: (message: string) => new BookmarkHubError(
    message,
    ErrorCode.PARSE_ERROR,
    '解析失败，数据格式可能不正确',
    false
  ),
};

/**
 * 错误分类判断
 */
export const isError = {
  authError: (error: BookmarkHubError): boolean => 
    [ErrorCode.AUTH_TOKEN_MISSING, ErrorCode.AUTH_TOKEN_INVALID].includes(error.code),
  
  networkError: (error: BookmarkHubError): boolean => 
    [ErrorCode.NETWORK_ERROR, ErrorCode.REQUEST_TIMEOUT, ErrorCode.RATE_LIMIT].includes(error.code),
  
  syncError: (error: BookmarkHubError): boolean => 
    error.code.startsWith('SYNC_'),
  
  webdavError: (error: BookmarkHubError): boolean => 
    error.code.startsWith('WEBDAV_'),
  
  retryable: (error: BookmarkHubError): boolean => error.retryable,
};