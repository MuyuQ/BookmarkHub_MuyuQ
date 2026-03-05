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