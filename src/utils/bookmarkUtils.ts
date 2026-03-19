/**
 * BookmarkHub 书签工具函数集合
 * 
 * 提供书签操作的通用方法，包括：
 * - 书签数量统计
 * - 书签树格式化
 * - 书签树扁平化
 * 
 * 这个模块统一了项目中所有书签操作逻辑，避免代码重复
 */

import { BookmarkInfo } from './models';

/**
 * 简单字符串哈希函数
 * 将字符串转换为稳定的数字哈希值
 */
function hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash);
}

/**
 * 生成稳定的书签 ID
 * 
 * 对于书签：基于 URL 生成 ID（URL 是书签的唯一标识）
 * 对于文件夹：基于标题和父路径生成 ID
 * 
 * @param bookmark - 书签对象
 * @param parentPath - 父文件夹路径（用于文件夹 ID 生成）
 * @returns 稳定的 ID 字符串
 */
export function generateStableId(bookmark: BookmarkInfo, parentPath: string = ''): string {
    if (bookmark.url) {
        // 书签：用 URL 生成稳定 ID
        const hash = hashString(bookmark.url);
        return `bm_${hash}`;
    } else {
        // 文件夹：用标题 + 父路径生成稳定 ID
        const path = parentPath ? `${parentPath}/${bookmark.title}` : bookmark.title;
        const hash = hashString(path);
        return `folder_${hash}`;
    }
}

/**
 * 标准化书签树的 ID
 * 递归处理整个书签树，为每个节点生成稳定的 ID
 * 同时更新 parentId 引用
 * 
 * @param bookmarks - 书签数组
 * @param parentPath - 父文件夹路径（用于文件夹 ID 生成）
 * @param parentId - 父文件夹的新 ID
 * @returns 标准化后的书签数组（原地修改）
 */
export function normalizeBookmarkIds(
    bookmarks: BookmarkInfo[],
    parentPath: string = '',
    parentId?: string
): BookmarkInfo[] {
    for (const bookmark of bookmarks) {
        // 生成稳定 ID
        const newId = generateStableId(bookmark, parentPath);
        const oldId = bookmark.id;
        bookmark.id = newId;
        
        // 关键修复：始终更新 parentId
        // 如果传入了 parentId 参数，使用它
        // 否则清除 parentId（表示这是根级书签）
        if (parentId !== undefined) {
            bookmark.parentId = parentId;
        } else {
            // 根级书签不应该有 parentId
            bookmark.parentId = undefined;
        }
        
        // 递归处理子节点
        if (bookmark.children && bookmark.children.length > 0) {
            const childPath = parentPath ? `${parentPath}/${bookmark.title}` : bookmark.title;
            normalizeBookmarkIds(bookmark.children, childPath, newId);
        }
    }
    return bookmarks;
}

/**
 * 递归计算书签数量
 * 统计所有有效书签（有URL的节点）的数量
 * 
 * @param bookmarkList - 书签数组或 undefined
 * @returns number 书签总数
 * 
 * @example
 * const bookmarks = await browser.bookmarks.getTree();
 * const count = getBookmarkCount(bookmarks);
 * console.log(`共有 ${count} 个书签`);
 */
export function getBookmarkCount(bookmarkList: BookmarkInfo[] | undefined): number {
    let count = 0;
    if (bookmarkList) {
        bookmarkList.forEach(c => {
            if (c.url) {
                count++;
            } else {
                count += getBookmarkCount(c.children);
            }
        });
    }
    return count;
}

/**
 * 格式化书签树
 * 提取书签树的 children 部分，即根文件夹下的内容
 * 
 * @param bookmarks - 完整的书签树
 * @returns BookmarkInfo[] | undefined 格式化后的书签数组
 * 
 * 注意：浏览器返回的 bookmarkTree[0] 是虚拟根节点
 * 实际的书签存储在 its children 中
 * 
 * @example
 * const bookmarkTree = await browser.bookmarks.getTree();
 * const bookmarks = formatBookmarks(bookmarkTree);
 */
export function formatBookmarks(bookmarks: BookmarkInfo[]): BookmarkInfo[] | undefined {
    if (bookmarks[0]?.children) {
        return bookmarks[0].children;
    }
    return undefined;
}

/**
 * 扁平化书签树为数组
 * 将嵌套的书签树结构转换为扁平的数组
 * 只保留有 URL 的书签（不包含文件夹）
 * 
 * @param bookmarks - 书签树数组
 * @returns BookmarkInfo[] 扁平化的书签数组
 * 
 * @example
 * const bookmarkTree = await browser.bookmarks.getTree();
 * const flatList = flattenBookmarks(bookmarkTree);
 * // flatList 现在是一个包含所有书签的数组
 */
export function flattenBookmarks(bookmarks: BookmarkInfo[]): BookmarkInfo[] {
    const result: BookmarkInfo[] = [];
    for (const b of bookmarks) {
        if (b.url) {
            result.push({ title: b.title, url: b.url });
        }
        if (b.children) {
            result.push(...flattenBookmarks(b.children));
        }
    }
    return result;
}