/**
 * BookmarkHub 导出模块
 * 
 * 提供书签导出功能，支持以下格式:
 * - JSON: 机器可读的纯数据格式
 * - HTML: 浏览器书签标准格式，可导入各主流浏览器
 */

import { BookmarkInfo } from './models';

/**
 * 导出格式类型
 * - json: JSON 格式
 * - html: 浏览器书签 HTML 格式
 */
export type ExportFormat = 'json' | 'html';

/**
 * 导出书签
 * 将书签数据导出为指定格式的文件并触发下载
 * 
 * @param format - 导出格式 (json 或 html)
 * @param bookmarks - 书签数据数组
 * 
 * 使用示例:
 *   const bookmarks = await browser.bookmarks.getTree();
 *   await exportBookmarks('html', flattenBookmarks(bookmarks));
 * 
 * 注意:
 *   - JSON 格式保留完整的数据结构
 *   - HTML 格式兼容 Chrome、Firefox、Edge 等浏览器
 */
export async function exportBookmarks(
    format: ExportFormat,
    bookmarks: BookmarkInfo[]
): Promise<void> {
    let content: string;
    let filename: string;
    let mimeType: string;

    // 生成日期戳用于文件名
    const timestamp = new Date().toISOString().split('T')[0];

    // 根据格式生成内容
    if (format === 'json') {
        // JSON 格式
        content = JSON.stringify(bookmarks, null, 2);  // 格式化缩进
        filename = `bookmarks-${timestamp}.json`;
        mimeType = 'application/json';
    } else {
        // HTML 格式 (浏览器书签标准格式)
        content = generateHtmlBookmarks(bookmarks);
        filename = `bookmarks-${timestamp}.html`;
        mimeType = 'text/html';
    }

    // 触发文件下载
    downloadFile(content, filename, mimeType);
}

/**
 * 生成 HTML 书签文件
 * 使用 NETSCAPE-Bookmark-file-1 格式
 * 这是浏览器书签导出的标准格式
 * 
 * @param bookmarks - 书签数据
 * @returns HTML 格式的书签文件内容
 */
function generateHtmlBookmarks(bookmarks: BookmarkInfo[]): string {
    // HTML 书签文件头
    // 必须使用 NETSCAPE-Bookmark-file-1 DOCTYPE
    let html = '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n';
    html += '<!-- This is an automatically generated file.\n';
    html += '     It will be read and overwritten.\n';
    html += '     DO NOT EDIT! -->\n';
    html += '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n';
    html += '<TITLE>Bookmarks</TITLE>\n';
    html += '<H1>Bookmarks</H1>\n';
    html += '<DL><p>\n';

    // 处理书签内容
    html += processBookmarks(bookmarks, 0);

    html += '</DL><p>\n';
    return html;
}

/**
 * 递归处理书签生成 HTML
 * 
 * @param bookmarks - 书签数组
 * @param indent - 缩进级别
 * @returns 生成的 HTML 片段
 * 
 * HTML 结构:
 *   <DL><p> - 定义列表开始
 *     <DT><A HREF="url">标题</A> - 书签项
 *     <DT><H3>文件夹名</H3> - 文件夹
 *       <DL><p> - 子文件夹开始
 *         ... (递归)
 *       </DL><p> - 子文件夹结束
 *   </DL><p> - 定义列表结束
 */
function processBookmarks(bookmarks: BookmarkInfo[], indent: number): string {
    let result = '';
    // 缩进字符串 (4空格 * 缩进级别)
    const indentStr = '    '.repeat(indent);

    // 遍历每个书签/文件夹
    for (const bookmark of bookmarks) {
        if (bookmark.url) {
            // 是书签 (有 URL)
            const escapedTitle = escapeHtml(bookmark.title);
            const escapedUrl = escapeHtml(bookmark.url);
            result += `${indentStr}<DT><A HREF="${escapedUrl}">${escapedTitle}</A>\n`;
        } else if (bookmark.children && bookmark.children.length > 0) {
            // 是文件夹 (有子节点)
            const escapedTitle = escapeHtml(bookmark.title);
            result += `${indentStr}<DT><H3>${escapedTitle}</H3>\n`;
            result += `${indentStr}<DL><p>\n`;
            // 递归处理子节点
            result += processBookmarks(bookmark.children, indent + 1);
            result += `${indentStr}</DL><p>\n`;
        }
    }

    return result;
}

/**
 * HTML 转义
 * 防止书签标题或 URL 中的特殊字符破坏 HTML 结构
 * 
 * @param text - 原始文本
 * @returns 转义后的文本
 * 
 * 转义规则:
 *   &  -> &amp;
 *   <  -> &lt;
 *   >  -> &gt;
 *   "  -> &quot;
 *   '  -> &#039;
 */
function escapeHtml(text: string): string {
    const map: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * 下载文件
 * 使用 Blob 和 URL.createObjectURL 创建下载链接
 * 
 * @param content - 文件内容
 * @param filename - 文件名
 * @param mimeType - MIME 类型
 */
function downloadFile(content: string, filename: string, mimeType: string): void {
    // 创建 Blob 对象
    const blob = new Blob([content], { type: mimeType });

    // 创建对象 URL
    const url = URL.createObjectURL(blob);

    // 创建隐藏的下载链接
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;

    // 添加到页面并触发点击
    document.body.appendChild(a);
    a.click();

    // 清理
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
