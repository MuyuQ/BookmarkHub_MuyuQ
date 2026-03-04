/**
 * BookmarkHub 导入模块
 * 
 * 提供书签导入功能，支持以下格式:
 * - JSON: 导出的 JSON 格式
 * - HTML: 浏览器书签 HTML 格式 (兼容 Chrome、Firefox、Edge 等)
 */

import { BookmarkInfo } from './models';

/**
 * 导入格式类型
 * - json: JSON 格式
 * - html: 浏览器书签 HTML 格式
 */
export type ImportFormat = 'json' | 'html';

/**
 * 导入书签
 * 从文件中读取并解析书签数据
 * 
 * @param file - 用户选择的文件对象
 * @returns Promise<BookmarkInfo[]> 解析后的书签数组
 * @throws Error 不支持的格式或解析失败
 * 
 * 使用示例:
 *   const input = document.querySelector('input[type="file"]');
 *   const file = input.files[0];
 *   const bookmarks = await importBookmarks(file);
 *   for (const bookmark of bookmarks) {
 *     await browser.bookmarks.create({ title: bookmark.title, url: bookmark.url });
 *   }
 */
export async function importBookmarks(file: File): Promise<BookmarkInfo[]> {
    // 读取文件内容
    const content = await file.text();

    // 根据文件扩展名判断格式
    const extension = file.name.split('.').pop()?.toLowerCase();

    if (extension === 'json') {
        // JSON 格式
        return parseJsonBookmarks(content);
    } else if (extension === 'html') {
        // HTML 格式 (浏览器书签)
        return parseHtmlBookmarks(content);
    }

    // 不支持的格式
    throw new Error('Unsupported file format');
}

/**
 * 解析 JSON 格式书签
 * 
 * @param content - JSON 文件内容
 * @returns BookmarkInfo[] 书签数组
 * @throws Error 解析失败
 * 
 * JSON 格式要求:
 *   [
 *     { "title": "书签标题", "url": "https://example.com" },
 *     { "title": "文件夹", "children": [...] }
 *   ]
 */
function parseJsonBookmarks(content: string): BookmarkInfo[] {
    try {
        // 解析 JSON
        const data = JSON.parse(content);

        // 验证是数组
        if (Array.isArray(data)) {
            return data;
        }

        // 不是数组格式
        throw new Error('Invalid JSON format');
    } catch (error) {
        // 解析失败
        throw new Error('Failed to parse JSON file');
    }
}

/**
 * 解析 HTML 书签文件
 * 使用 DOMParser 解析浏览器书签标准格式
 * 
 * @param content - HTML 文件内容
 * @returns BookmarkInfo[] 书签数组
 * @throws Error 格式无效
 * 
 * HTML 书签格式 (NETSCAPE-Bookmark-file-1):
 *   <DL><p>
 *     <DT><A HREF="url">书签标题</A>
 *     <DT><H3>文件夹名</H3>
 *       <DL><p>
 *         <DT><A HREF="url">子书签</A>
 *       </DL><p>
 *   </DL><p>
 */
function parseHtmlBookmarks(content: string): BookmarkInfo[] {
    // 创建 DOM 解析器
    const parser = new DOMParser();

    // 解析 HTML
    const doc = parser.parseFromString(content, 'text/html');

    // 查找根 DL 元素
    const dl = doc.querySelector('DL');
    if (!dl) {
        throw new Error('Invalid HTML bookmark file');
    }

    // 递归解析书签
    const bookmarks: BookmarkInfo[] = [];
    parseDlElement(dl, bookmarks);

    return bookmarks;
}

/**
 * 递归解析 DL 元素
 * 
 * @param element - DL 元素
 * @param parent - 父数组，解析结果存入此数组
 * 
 * 解析逻辑:
 * 1. 遍历 DT 元素
 * 2. 如果包含 A 标签 -> 书签
 * 3. 如果包含 H3 标签 -> 文件夹，递归处理子 DL
 */
function parseDlElement(element: Element, parent: BookmarkInfo[]): void {
    // 获取所有子元素
    const children = element.children;

    // 遍历每个子元素
    for (let i = 0; i < children.length; i++) {
        const child = children[i];

        // 只处理 DT 元素
        if (child.tagName === 'DT') {
            // 查找 A 标签 (书签)
            const a = child.querySelector('a');

            // 查找 H3 标签 (文件夹)
            const h3 = child.querySelector('h3');

            if (a) {
                // 是书签
                const bookmark: BookmarkInfo = {
                    title: a.textContent || '',
                    url: a.href
                };
                parent.push(bookmark);
            } else if (h3) {
                // 是文件夹
                const folder: BookmarkInfo = {
                    title: h3.textContent || '',
                    children: []
                };

                // 查找直接的子 DL 元素 (子文件夹)
                const dl = child.querySelector(':scope > DL');
                if (dl) {
                    // 递归解析子文件夹
                    parseDlElement(dl, folder.children!);
                }

                parent.push(folder);
            }
        }
    }
}
