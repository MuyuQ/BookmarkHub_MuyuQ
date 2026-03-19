/**
 * BookmarkHub 重试工具模块
 * 
 * 提供网络请求的自动重试功能，支持：
 * - 指数退避重试策略
 * - 可配置重试次数和延迟
 * - 通用的异步操作包装器
 */

import { logger } from './logger';

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
 * 重试逻辑说明：
 * - 首先执行一次初始操作
 * - 如果失败，则进行最多 maxRetries 次重试
 * - 总共最多执行 1 + maxRetries 次操作 (初使化调用 + 重试次数)
 * - 例如 maxRetries: 3 表示：1次初始调用 + 最多3次重试机会（如果每次都失败）
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
    
    // 首先执行初始操作
    try {
        const result = await operation();
        return result;
    } catch (error) {
        lastError = error as Error;
        
        // 如果启用了日志且还有重试机会，记录初始失败
        if (logRetries && maxRetries > 0) {
            logger.info(`初始操作失败，${delay}ms 后开始重试:`, lastError.message);
        }
    }
    
    // 现在进行指定次数的重试 (从第1次到第maxRetries次)
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        // 等待一段时间后重试
        await sleep(delay);
        
        try {
            const result = await operation();
            
            // 重试成功，记录并返回结果
            if (logRetries) {
                logger.info(`操作在第 ${attempt} 次重试后成功`);
            }
            
            return result;
        } catch (error) {
            lastError = error as Error;
            
            // 如果已达到最大重试次数，停止重试
            if (attempt === maxRetries) {
                if (logRetries) {
                logger.error(`操作失败，已重试 ${maxRetries} 次:`, lastError.message);
                }
                break;
            }
            
            // 记录下一次重试信息
            if (logRetries) {
                logger.info(`第 ${attempt} 次重试失败，${delay}ms 后进行第 ${attempt + 1} 次重试:`, lastError.message);
            }
            
            // 计算下一次延迟（指数退避 + 随机抖动）
            // 添加 ±25% 的随机抖动，防止多个客户端同时重试导致的"惊群效应"
            const jitter = delay * 0.25 * (Math.random() * 2 - 1); // ±25% jitter
            delay = Math.min(delay * backoffFactor + jitter, maxDelay);
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
            // HTTP 错误处理：区分可重试和不可重试的错误
            if (!response.ok) {
                const status = response.status;
                
                // 429 速率限制：需要重试，使用退避策略
                if (status === 429) {
                    throw new Error(`HTTP ${status}: Rate limited, will retry`);
                }
                
                // 其他客户端错误（4xx）不重试，直接抛出
                if (status >= 400 && status < 500) {
                    throw new Error(`HTTP ${status}: Client error, no retry`);
                }
                
                // 服务器错误（5xx）可以重试
                throw new Error(`HTTP ${status}: Server error, will retry`);
            }
            
            return response;
        },
        retryOptions
    );
}