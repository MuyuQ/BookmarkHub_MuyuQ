/**
 * BookmarkHub 重试工具模块
 * 
 * 提供网络请求的自动重试功能，支持：
 * - 指数退避重试策略
 * - 可配置重试次数和延迟
 * - 通用的异步操作包装器
 */

/**
 * 重试配置选项
 */
export interface RetryOptions {
    /** 最大重试次数，默认3次 */
    maxRetries?: number;
    /** 初始延迟（毫秒），默认1000ms */
    initialDelay?: number;
    /** 最大延迟（毫秒），默认10000ms */
    maxDelay?: number;
    /** 退避因子，默认2 */
    backoffFactor?: number;
    /** 是否在重试时输出日志，默认false */
    logRetries?: boolean;
}

/**
 * 延迟执行函数
 * 
 * @param ms - 延迟毫秒数
 * @returns Promise<void>
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 执行带重试的异步操作
 * 使用指数退避策略自动重试失败的操作
 * 
 * @param operation - 要执行的异步操作函数
 * @param options - 重试配置选项
 * @returns Promise<T> 操作结果
 * @throws Error 如果所有重试都失败，抛出最后一次错误
 * 
 * @example
 * // 基本使用
 * const result = await retryOperation(
 *     () => fetch('https://api.github.com/...'),
 *     { maxRetries: 3 }
 * );
 * 
 * @example
 * // 带日志的重试
 * const data = await retryOperation(
 *     () => BookmarkService.get(),
 *     { maxRetries: 3, logRetries: true }
 * );
 */
export async function retryOperation<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {}
): Promise<T> {
    const {
        maxRetries = 3,
        initialDelay = 1000,
        maxDelay = 10000,
        backoffFactor = 2,
        logRetries = false
    } = options;
    
    let lastError: Error | undefined;
    let delay = initialDelay;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const result = await operation();
            
            // 如果之前有重试，记录成功
            if (attempt > 0 && logRetries) {
                console.log(`操作在第 ${attempt} 次重试后成功`);
            }
            
            return result;
        } catch (error) {
            lastError = error as Error;
            
            // 如果已经达到最大重试次数，直接抛出错误
            if (attempt === maxRetries) {
                if (logRetries) {
                    console.error(`操作失败，已重试 ${maxRetries} 次:`, lastError.message);
                }
                break;
            }
            
            // 记录重试信息
            if (logRetries) {
                console.log(`操作失败，${delay}ms 后进行第 ${attempt + 1} 次重试:`, lastError.message);
            }
            
            // 等待一段时间后重试
            await sleep(delay);
            
            // 计算下一次延迟（指数退避）
            delay = Math.min(delay * backoffFactor, maxDelay);
        }
    }
    
    // 所有重试都失败了，抛出最后一个错误
    throw lastError!;
}

/**
 * 带重试的 fetch 包装器
 * 专门用于网络请求的重试版本
 * 
 * @param url - 请求URL
 * @param init - fetch 初始化参数
 * @param retryOptions - 重试选项
 * @returns Promise<Response> 响应对象
 * 
 * @example
 * const response = await retryFetch(
 *     'https://api.github.com/gists/123',
 *     { headers: { 'Authorization': 'token xxx' } },
 *     { maxRetries: 3 }
 * );
 */
export async function retryFetch(
    url: string,
    init?: RequestInit,
    retryOptions?: RetryOptions
): Promise<Response> {
    return retryOperation(
        async () => {
            const response = await fetch(url, init);
            
            // 对于某些HTTP状态码不进行重试（如401、403、404）
            if (!response.ok) {
                const status = response.status;
                
                // 客户端错误（4xx）不重试
                if (status >= 400 && status < 500) {
                    throw new Error(`HTTP ${status}: ${response.statusText}`);
                }
                
                // 服务器错误（5xx）可以重试
                throw new Error(`HTTP ${status}: ${response.statusText}`);
            }
            
            return response;
        },
        retryOptions
    );
}