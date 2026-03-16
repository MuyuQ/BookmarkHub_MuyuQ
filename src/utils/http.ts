/**
 * BookmarkHub HTTP 客户端模块
 * 
 * 使用 ky 库创建 GitHub API 的 HTTP 客户端
 * 封装了认证、请求头、超时等通用配置
 */

import ky from 'ky';
import { Setting } from './setting';
import { HTTP_TIMEOUTS } from './constants';

/**
 * 创建配置好的 ky HTTP 实例
 * 
 * 功能说明:
 * - 自动添加 GitHub API 认证头
 * - 设置请求超时和重试策略
 * - 统一处理请求编码和缓存
 * 
 * 使用方法:
 *   // GET 请求
 *   const data = await http.get('gists/gist_id').json();
 *   
 *   // PATCH 请求
 *   const result = await http.patch('gists/gist_id', { json: data }).json();
 *   
 *   // 不带 prefixUrl 的请求
 *   const rawData = await http.get(rawUrl, { prefixUrl: '' }).text();
 */
export const http = ky.create({
    // GitHub API 基础 URL
    // 所有请求都会自动添加此前缀
    prefixUrl: 'https://api.github.com',
    
    // 请求超时时间 (毫秒)
    // 60 秒超时，防止请求无限等待
    timeout: HTTP_TIMEOUTS.GITHUB_API,
    
    // 请求失败后的重试次数
    // 设为 1 次，即失败后重试一次
    retry: {
        limit: 1,
        // 自定义重试逻辑
        methods: ['get', 'put', 'post', 'delete', 'patch'],
        statusCodes: [408, 413, 429, 500, 502, 503, 504],
        afterStatusCodes: [429], // 429 需要特殊处理速率限制
    },
    
    // 请求钩子函数
    // 在每次请求发送前执行
    hooks: {
        beforeRequest: [
            /**
             * 请求前钩子
             * 自动为每个请求添加必要的头部信息
             */
            async request => {
                // 从设置中获取 GitHub Token
                const setting = await Setting.build();
                
                // 设置认证头 (Bearer Token)
                request.headers.set('Authorization', `Bearer ${setting.githubToken}`);
                
                // 设置内容类型 (JSON 编码)
                request.headers.set('Content-Type', `application/json;charset=utf-8`);
                
                // 设置 GitHub API 版本
                // 使用特定版本确保 API 响应格式稳定
                request.headers.set('X-GitHub-Api-Version', `2022-11-28`);
                
                // 设置接受的数据格式
                request.headers.set('Accept', `application/vnd.github+json`);
                
                // 禁用缓存
                // 确保获取最新数据，不使用浏览器缓存
                request.headers.set('cache', 'no-store');
            }
        ],
        beforeRetry: [
            /**
             * 重试前钩子
             * 处理 GitHub API 的速率限制
             */
            async () => {
                // 速率限制已在 afterResponse 钩子中处理
                // 这里仅用于记录重试
                console.log('请求重试中...');
            }
        ],
        afterResponse: [
            /**
             * 响应后钩子
             * 处理 GitHub API 的速率限制
             */
            async (_request, _options, response) => {
                // 检查是否是速率限制 (403 或 429)
                if (response.status === 403 || response.status === 429) {
                    // 检查速率限制头
                    const remaining = response.headers.get('X-RateLimit-Remaining');
                    const reset = response.headers.get('X-RateLimit-Reset');
                    
                    // 如果剩余次数为 0 且有重置时间
                    if (remaining === '0' && reset) {
                        const resetTime = parseInt(reset, 10) * 1000;
                        const now = Date.now();
                        const waitTime = Math.max(resetTime - now, 0);
                        
                        console.warn(`GitHub API 速率限制，等待 ${Math.ceil(waitTime / 1000)} 秒后重试`);
                        
                        // 等待直到速率限制重置
                        if (waitTime > 0) {
                            await new Promise(resolve => setTimeout(resolve, waitTime));
                        }
                        
                        // 抛出错误以触发重试
                        throw new Error('Rate limit exceeded, waiting for reset');
                    } else if (response.status === 429) {
                        // 通用 429 处理，等待 60 秒
                        console.warn('GitHub API 返回 429，等待 60 秒后重试');
                        await new Promise(resolve => setTimeout(resolve, 60000));
                        throw new Error('Rate limited (429), waiting before retry');
                    }
                }
                
                return response;
            }
        ]
    }
});

/**
 * 示例: GET 请求
 * 获取 Gist 内容
 * 
 * async function get(url: string) {
 *   return http.get(url, null);
 * }
 */

/**
 * 示例: PATCH 请求
 * 更新 Gist 内容
 * 
 * async function patch<T>(url: string, data: T) {
 *   return http.patch(url, { json: data });
 * }
 */
