/**
 * BookmarkHub 服务模块
 * 
 * 提供书签操作的核心服务，包括:
 * - GitHub Gist API 操作 (获取/更新)
 * - 浏览器书签获取和格式化
 * - 书签数量统计
 * 
 * 注意：书签工具函数已移至 bookmarkUtils.ts 统一管理
 */

import { Setting } from './setting';
import { http } from './http';
import { BookmarkInfo } from './models';
import { retryOperation } from './retry';
import { logger } from './logger';

/**
 * 转义正则表达式中的特殊字符
 *
 * @param str - 需要转义的字符串
 * @returns 转义后的字符串，可以安全用于正则表达式
 */
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 从错误消息中清理敏感 token
 *
 * 如果 token 为空或无效，直接返回原始消息。
 * 否则，将消息中的 token 替换为 [REDACTED]。
 *
 * @param errorMessage - 原始错误消息
 * @param token - 需要清理的 token
 * @returns 清理后的错误消息
 */
function sanitizeToken(errorMessage: string, token: string): string {
    if (!token || token.trim() === '') {
        return errorMessage; // 无 token 需要清理
    }
    return errorMessage.replace(new RegExp(escapeRegex(token), 'g'), '[REDACTED]');
}

/**
 * GitHub Gist 文件接口
 */
export interface GistFile {
  content: string;
  truncated?: boolean;
  raw_url: string;
}

/**
 * GitHub Gist 响应接口
 */
export interface GistResponse {
  files: Record<string, GistFile>;
  description?: string;
  id?: string;
}

/**
 * GitHub Gist 更新数据接口
 */
export interface GistUpdateData {
  files: Record<string, { content: string }>;
  description?: string;
}

/**
 * GitHub Gist 列表响应接口
 */
export interface GistListResponse {
  id: string;
  description: string | null;
  public: boolean;
  files: Record<string, { filename: string; raw_url: string }>;
}

/**
 * BookmarkService 类
 * 封装 GitHub Gist API 的所有操作
 * 使用单例模式导出
 */

/**
 * 验证 Gist ID 格式
 * Gist ID 应该是 32 或 40 位十六进制字符串
 * 
 * @param gistId - 待验证的 Gist ID
 * @returns 是否是有效的 Gist ID 格式
 */
function validateGistId(gistId: string): boolean {
  return /^[a-f0-9]{32,40}$/i.test(gistId);
}

class BookmarkService {
    /**
     * 获取远程 Gist 中的书签数据
     * 
     * @returns Promise<string | null> 书签数据的 JSON 字符串，失败返回 null
     * 
     * 处理逻辑:
     * 1. 根据 gistID 获取 Gist 内容
     * 2. 查找匹配的文件名
     * 3. 如果文件被截断 (truncated)，使用 raw_url 获取完整内容
     * 4. 返回文件内容或 null
     */
    async get(): Promise<string | null> {
        return retryOperation(async () => {
            const setting = await Setting.build();
            
            // 验证 Gist ID 格式
            if (!validateGistId(setting.gistID)) {
                throw new Error(`Invalid Gist ID format: ${setting.gistID}. Gist IDs must be 32 or 40 character hexadecimal strings.`);
            }
            
            let resp: GistResponse | undefined;
            try {
                resp = await http.get(`gists/${setting.gistID}`).json() as GistResponse;
                
                if (resp?.files) {
                    const filenames = Object.keys(resp.files);
                    
                    if (filenames.indexOf(setting.gistFileName) !== -1) {
                        const gistFile = resp.files[setting.gistFileName];
                        
                        if (gistFile.truncated) {
                            const txt = await http.get(gistFile.raw_url, { prefixUrl: '' }).text();
                            return txt;
                        } else {
                            return gistFile.content;
                        }
                    }
                }
            } catch (error) {
                // 捕获可能包含令牌信息的错误，并过滤敏感信息
                const errorMessage = error instanceof Error ? error.message : String(error);
                const sanitizedMessage = sanitizeToken(errorMessage, setting.githubToken);
                if (sanitizedMessage !== errorMessage) {
                    // 错误消息中包含 token，使用清理后的消息
                    throw new Error(`GitHub API request failed: ${sanitizedMessage}`);
                }
                throw error;
            }
            
            // 添加警告日志，提示文件未找到
            logger.warn(`Gist file not found in gist ${setting.gistID}`, { 
                fileName: setting.gistFileName,
                availableFiles: Object.keys(resp?.files || {})
            });
            
            return null;
        }, { maxRetries: 3, logRetries: true });
    }

    /**
     * 获取用户的所有 Gist 列表
     * 
     * @returns Promise<GistListResponse[]> Gist 列表响应
     */
    async getAllGist(): Promise<GistListResponse[]> {
        return http.get('gists').json();
    }

    /**
     * 更新远程 Gist 中的书签数据
     * 
     * @param data - 要更新的数据对象
     * @returns Promise<any> API 响应
     * 
     * 使用 PATCH 方法更新 Gist
     * 只更新指定的文件名，保留其他文件不变
     */
    async update(data: GistUpdateData): Promise<GistResponse> {
        const setting = await Setting.build();
        
        // 验证 Gist ID 格式
        if (!validateGistId(setting.gistID)) {
            throw new Error(`Invalid Gist ID format: ${setting.gistID}. Gist IDs must be 32 or 40 character hexadecimal strings.`);
        }
        
        return retryOperation(async () => {
            try {
                return await http.patch(`gists/${setting.gistID}`, { json: data }).json();
            } catch (error) {
                // 捕获可能包含令牌信息的错误，并过滤敏感信息
                const errorMessage = error instanceof Error ? error.message : String(error);
                const sanitizedMessage = sanitizeToken(errorMessage, setting.githubToken);
                if (sanitizedMessage !== errorMessage) {
                    // 错误消息中包含 token，使用清理后的消息
                    throw new Error(`GitHub API update request failed: ${sanitizedMessage}`);
                }
                throw error;
            }
        }, { maxRetries: 3, logRetries: true });
    }
}

/**
 * 获取本地浏览器书签树
 * 
 * @returns Promise<BookmarkInfo[]> 完整的书签树数组
 * 
 * 使用浏览器 bookmarks API 获取所有书签
 * 返回的是一个包含所有书签的树形结构数组
 */
export async function getBookmarks(): Promise<BookmarkInfo[]> {
    return await browser.bookmarks.getTree();
}

// 导出 BookmarkService 单例
export default new BookmarkService();
