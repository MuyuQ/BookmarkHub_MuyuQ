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
import { getBookmarkCount, formatBookmarks } from './bookmarkUtils';
import { retryOperation } from './retry';

// 重新导出工具函数，保持向后兼容
export { getBookmarkCount, formatBookmarks };

/**
 * BookmarkService 类
 * 封装 GitHub Gist API 的所有操作
 * 使用单例模式导出
 */
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
            
            const resp = await http.get(`gists/${setting.gistID}`).json() as any;
            
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
            
            return null;
        }, { maxRetries: 3, logRetries: true });
    }

    /**
     * 获取用户的所有 Gist 列表
     * 
     * @returns Promise<any> Gist 列表响应
     * 
     * 注意: 此方法可能不需要，因为是私有 Gist
     */
    async getAllGist(): Promise<any> {
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
    async update(data: any): Promise<any> {
        return retryOperation(async () => {
            const setting = await Setting.build();
            return http.patch(`gists/${setting.gistID}`, { json: data }).json();
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
