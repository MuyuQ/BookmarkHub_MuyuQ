/**
 * BookmarkHub 服务模块
 * 
 * 提供书签操作的核心服务，包括:
 * - GitHub Gist API 操作 (获取/更新)
 * - 浏览器书签获取和格式化
 * - 书签数量统计
 */

import { Setting } from './setting';
import { http } from './http';
import { BookmarkInfo } from './models';

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
        // 获取设置
        const setting = await Setting.build();
        
        // 调用 GitHub Gist API 获取数据
        const resp = await http.get(`gists/${setting.gistID}`).json() as any;
        
        // 检查响应中是否包含文件
        if (resp?.files) {
            // 获取所有文件名
            const filenames = Object.keys(resp.files);
            
            // 查找匹配的文件名
            if (filenames.indexOf(setting.gistFileName) !== -1) {
                // 获取目标文件
                const gistFile = resp.files[setting.gistFileName];
                
                // 如果文件被 GitHub 截断 (大型文件)
                if (gistFile.truncated) {
                    // 使用 raw_url 获取完整内容
                    const txt = http.get(gistFile.raw_url, { prefixUrl: '' }).text();
                    return txt;
                } else {
                    // 直接返回文件内容
                    return gistFile.content;
                }
            }
        }
        
        // 未找到文件返回 null
        return null;
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
        // 获取设置
        const setting = await Setting.build();
        
        // 调用 GitHub Gist API 更新数据
        return http.patch(`gists/${setting.gistID}`, { json: data }).json();
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

/**
 * 格式化书签数据
 * 提取书签树的 children 部分，即根文件夹下的内容
 * 
 * @param bookmarks - 完整的书签树
 * @returns BookmarkInfo[] | undefined 格式化后的书签数组
 * 
 * 注意: 浏览器返回的 bookmarkTree[0] 是虚拟根节点
 * 实际的书签存储在 its children 中
 */
export function formatBookmarks(bookmarks: BookmarkInfo[]): BookmarkInfo[] | undefined {
    if (bookmarks[0]?.children) {
        return bookmarks[0].children;
    }
    return undefined;
}

/**
 * 递归计算书签数量
 * 统计所有有效书签 (有 URL 的节点) 的数量
 * 
 * @param bookmarkList - 书签数组或 undefined
 * @returns number 书签总数
 * 
 * 算法:
 * - 遍历所有节点
 * - 如果节点有 URL (是书签而非文件夹)，计数 +1
 * - 如果节点有 children，递归统计子节点
 */
export function getBookmarkCount(bookmarkList: BookmarkInfo[] | undefined): number {
    let count = 0;
    if (bookmarkList) {
        bookmarkList.forEach(c => {
            if (c.url) {
                // 有 URL 的是书签，计数 +1
                count++;
            } else {
                // 没有 URL 的是文件夹，递归统计子节点
                count += getBookmarkCount(c.children);
            }
        });
    }
    return count;
}

// 导出 BookmarkService 单例
export default new BookmarkService();
