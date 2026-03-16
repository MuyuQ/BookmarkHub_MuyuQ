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
  /** GitHub Token 未设置或无效 */
  AUTH_TOKEN_MISSING = 'AUTH_TOKEN_MISSING',
  /** GitHub Token 无效或被撤销 */
  AUTH_TOKEN_INVALID = 'AUTH_TOKEN_INVALID',
  /** Gist ID 未设置 */
  GIST_ID_MISSING = 'GIST_ID_MISSING',
  /** Gist 文件名未设置 */
  FILE_NAME_MISSING = 'FILE_NAME_MISSING',
  
  // 网络错误
  /** 一般网络错误 */
  NETWORK_ERROR = 'NETWORK_ERROR',
  /** 网络请求超时 */
  REQUEST_TIMEOUT = 'REQUEST_TIMEOUT',
  /** API 请求频率限制 */
  RATE_LIMIT = 'RATE_LIMIT',
  /** 请求频率限制已超出，需要等待 */
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  
  // 资源错误
  /** 文件/资源不存在 */
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  /** Gist 文件为空或无内容 */
  EMPTY_GIST_FILE = 'EMPTY_GIST_FILE',
  /** Gist 文件被截断，需要从 raw_url 获取完整内容 */
  GIST_FILE_TRUNCATED = 'GIST_FILE_TRUNCATED',
  /** 同步数据损坏或格式错误 */
  SYNC_DATA_CORRUPTED = 'SYNC_DATA_CORRUPTED',
  
  // 同步错误
  /** 同步操作失败 */
  SYNC_FAILED = 'SYNC_FAILED',
  /** 同步正在进行中，防止并发 */
  SYNC_IN_PROGRESS = 'SYNC_IN_PROGRESS',
  /** 合并操作失败 */
  MERGE_FAILED = 'MERGE_FAILED',
  /** 合并检测到冲突 */
  MERGE_CONFLICT = 'MERGE_CONFLICT',
  
  // WebDAV 错误
  /** WebDAV 认证失败 */
  WEBDAV_AUTH_FAILED = 'WEBDAV_AUTH_FAILED',
  /** WebDAV 读取错误 */
  WEBDAV_READ_ERROR = 'WEBDAV_READ_ERROR',
  /** WebDAV 写入错误 */
  WEBDAV_WRITE_ERROR = 'WEBDAV_WRITE_ERROR',
  /** WebDAV 文件不存在 */
  WEBDAV_FILE_NOT_FOUND = 'WEBDAV_FILE_NOT_FOUND',
  /** WebDAV 连接失败 */
  WEBDAV_CONNECTION_FAILED = 'WEBDAV_CONNECTION_FAILED',
  
  // 导入导出错误
  /** 导入操作失败 */
  IMPORT_ERROR = 'IMPORT_ERROR',
  /** 导出操作失败 */
  EXPORT_ERROR = 'EXPORT_ERROR',
  /** 数据解析失败 */
  PARSE_ERROR = 'PARSE_ERROR',
  
  // 通用错误
  /** 未知错误 */
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  /** 验证错误 */
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
  
  authTokenInvalid: () => new BookmarkHubError(
    'GitHub Token is invalid or revoked',
    ErrorCode.AUTH_TOKEN_INVALID,
    'GitHub Token 无效或已被撤销。请重新生成 Token 并在设置页面更新。',
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
  
  fileNotFound: (fileName: string, storageType: 'github' | 'webdav' = 'github') => {
    const code = storageType === 'webdav' ? ErrorCode.WEBDAV_FILE_NOT_FOUND : ErrorCode.FILE_NOT_FOUND;
    const message = storageType === 'webdav' 
      ? `WebDAV file not found: ${fileName}`
      : `Gist file not found: ${fileName}`;
    const userMessage = storageType === 'webdav'
      ? `WebDAV 文件 ${fileName} 不存在`
      : `Gist 文件 ${fileName} 不存在`;
    return new BookmarkHubError(message, code, userMessage, false);
  },
  
  emptyGistFile: (fileName: string) => new BookmarkHubError(
    `Gist file is empty: ${fileName}`,
    ErrorCode.EMPTY_GIST_FILE,
    `Gist 文件 ${fileName} 为空`,
    false
  ),
  
  gistFileTruncated: (fileName: string) => new BookmarkHubError(
    `Gist file is truncated, fetching from raw URL: ${fileName}`,
    ErrorCode.GIST_FILE_TRUNCATED,
    `Gist 文件 ${fileName} 较大，正在从原始 URL 获取完整内容`,
    true
  ),
  
  syncDataCorrupted: (source: string = 'remote') => new BookmarkHubError(
    `Sync data is corrupted: ${source}`,
    ErrorCode.SYNC_DATA_CORRUPTED,
    `同步数据已损坏：${source === 'remote' ? '远程数据' : '本地数据'}，请检查数据完整性`,
    false
  ),
  
  syncFailed: (message: string, originalError?: unknown) => new BookmarkHubError(
    message,
    ErrorCode.SYNC_FAILED,
    '同步失败，请检查设置和网络',
    true,
    originalError
  ),
  
  syncInProgress: () => new BookmarkHubError(
    'Sync operation already in progress',
    ErrorCode.SYNC_IN_PROGRESS,
    '同步操作正在进行中，请稍候再试',
    false
  ),
  
  mergeFailed: (message: string, originalError?: unknown) => new BookmarkHubError(
    message,
    ErrorCode.MERGE_FAILED,
    '书签合并失败，请稍后重试',
    true,
    originalError
  ),
  
  mergeConflict: (conflictCount: number) => new BookmarkHubError(
    `Detected ${conflictCount} conflicts during merge`,
    ErrorCode.MERGE_CONFLICT,
    `检测到 ${conflictCount} 个冲突，请手动解决`,
    false
  ),
  
  networkError: (message: string, retryable: boolean = true) => new BookmarkHubError(
    message,
    ErrorCode.NETWORK_ERROR,
    '网络请求失败，请检查网络连接',
    retryable
  ),
  
  requestTimeout: (message: string) => new BookmarkHubError(
    message,
    ErrorCode.REQUEST_TIMEOUT,
    '网络请求超时，请检查网络连接或稍后重试',
    true
  ),
  
  rateLimit: (resetTime?: number) => new BookmarkHubError(
    `API rate limit exceeded${resetTime ? `, reset in ${resetTime} seconds` : ''}`,
    ErrorCode.RATE_LIMIT,
    'API 请求频率超出限制，请稍候再试',
    true
  ),
  
  rateLimitExceeded: (resetTime?: number) => new BookmarkHubError(
    `Rate limit exceeded, retry after ${resetTime ? resetTime : 'some time'}`,
    ErrorCode.RATE_LIMIT_EXCEEDED,
    '请求频率限制已超出，请稍后重试',
    true
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
  
  webdavConnectionFailed: (message: string) => new BookmarkHubError(
    message,
    ErrorCode.WEBDAV_CONNECTION_FAILED,
    'WebDAV 连接失败，请检查服务器地址和网络',
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
    [ErrorCode.NETWORK_ERROR, ErrorCode.REQUEST_TIMEOUT, ErrorCode.RATE_LIMIT, ErrorCode.RATE_LIMIT_EXCEEDED].includes(error.code),
  
  syncError: (error: BookmarkHubError): boolean => 
    error.code.startsWith('SYNC_'),
  
  webdavError: (error: BookmarkHubError): boolean => 
    error.code.startsWith('WEBDAV_'),
  
  fileNotFoundError: (error: BookmarkHubError): boolean =>
    [ErrorCode.FILE_NOT_FOUND, ErrorCode.WEBDAV_FILE_NOT_FOUND].includes(error.code),
  
  resourceError: (error: BookmarkHubError): boolean =>
    [ErrorCode.FILE_NOT_FOUND, ErrorCode.EMPTY_GIST_FILE, ErrorCode.GIST_FILE_TRUNCATED, ErrorCode.SYNC_DATA_CORRUPTED].includes(error.code),
  
  mergeError: (error: BookmarkHubError): boolean =>
    [ErrorCode.MERGE_FAILED, ErrorCode.MERGE_CONFLICT].includes(error.code),
  
  retryable: (error: BookmarkHubError): boolean => error.retryable,
};