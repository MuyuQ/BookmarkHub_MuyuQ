/**
 * BookmarkHub 导入模块
 * 
 * 提供书签导入功能，支持以下格式:
 * - JSON: 导出的 JSON 格式
 * - HTML: 浏览器书签 HTML 格式 (兼容 Chrome、Firefox、Edge 等)
 */

import { BookmarkInfo } from './models';
import { logger } from './logger';
import { BookmarkHubError, createError } from './errors';
import { getBookmarkCount } from './bookmarkUtils';

/**
 * 导入格式类型
 * - json: JSON 格式
 * - html: 浏览器书签 HTML 格式
 */
export type ImportFormat = 'json' | 'html';

/**
 * 最大导入书签数量限制（防止内存溢出攻击）
 */
const MAX_IMPORT_SIZE = 10000;

/**
 * 最大导入文件大小限制 (10MB)
 * 防止大文件导致的内存耗尽
 */
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * 允许的 URL 协议白名单
 * 防止 javascript:, data:, vbscript: 等 XSS 协议
 */
const ALLOWED_PROTOCOLS = ['http:', 'https:', 'ftp:', 'ftps:'];

/**
 * 危险的 JSON 键名 - 用于检测原型污染攻击
 * 这些键名可能被用于污染 JavaScript 原型链
 */
const DANGEROUS_JSON_KEYS = ['__proto__', 'constructor', 'prototype'];

/**
 * 安全的 JSON 解析器 reviver 函数
 * 防止原型污染攻击
 * 
 * @param key - JSON 键名
 * @param value - JSON 值
 * @returns 值，如果键名危险则抛出错误
 */
function safeReviver(key: string, value: unknown): unknown {
    if (DANGEROUS_JSON_KEYS.includes(key)) {
        throw createError.importError(`Dangerous key "${key}" detected in import data - potential prototype pollution attack`);
    }
    return value;
}


/**
 * 校验书签结构合法性
 */
function validateBookmarkStructure(bookmark: unknown, path: string = 'root'): BookmarkInfo {
  if (!bookmark || typeof bookmark !== 'object') {
    throw createError.importError(`Invalid bookmark structure at path ${path}: bookmark is not an object`);
  }
  
  // 确保必须有 title 字段
  if (!(bookmark as BookmarkInfo).title || typeof (bookmark as BookmarkInfo).title !== 'string') {
    throw createError.importError(`Invalid bookmark structure at path ${path}: missing or invalid title`);
  }
  
  // 书签类型：要么有 url（普通书签），要么有 children（文件夹）
  const hasUrl = 'url' in bookmark && typeof (bookmark as BookmarkInfo).url === 'string';
  const hasChildren = 'children' in bookmark && Array.isArray((bookmark as BookmarkInfo).children);
  
  if (!hasUrl && !hasChildren) {
    throw createError.importError(`Invalid bookmark structure at path ${path}: must have either url or children`);
  }
  
  // 创建一个安全的副本，只包含合法字段
  const safeBookmark: BookmarkInfo = {
    id: (bookmark as BookmarkInfo).id || "",
    title: sanitizeTitle((bookmark as BookmarkInfo).title),
    ...(hasUrl ? { url: (bookmark as BookmarkInfo).url } : {}),
    ...((bookmark as BookmarkInfo).parentId && { parentId: (bookmark as BookmarkInfo).parentId }),
    ...((bookmark as BookmarkInfo).index !== undefined && { index: (bookmark as BookmarkInfo).index }),
    ...((bookmark as BookmarkInfo).dateAdded !== undefined && { dateAdded: (bookmark as BookmarkInfo).dateAdded }),
    ...((bookmark as BookmarkInfo).dateGroupModified !== undefined && { dateGroupModified: (bookmark as BookmarkInfo).dateGroupModified }),
    ...((bookmark as BookmarkInfo).unmodifiable && { unmodifiable: (bookmark as BookmarkInfo).unmodifiable }),
    ...((bookmark as BookmarkInfo).type && { type: (bookmark as BookmarkInfo).type }),
  };
  
  // 如果是文件夹且有 children，则验证所有子书签
  if (hasChildren) {
    const children = (bookmark as BookmarkInfo).children as BookmarkInfo[] | undefined;
    if (children) {
      if (children.length > 0) {
        const validatedChildren = children.map((child, idx) => validateBookmarkStructure(child, `${path}.children[${idx}]`));
        safeBookmark.children = validatedChildren;
      } else {
        safeBookmark.children = [];
      }
    }
  }
  
  return safeBookmark;
}

/**
 * 清理标题字符串，移除HTML标签等恶意内容
 */
function sanitizeTitle(title: string): string {
  if (!title || typeof title !== 'string') {
    return '';
  }

  // 移除HTML标签
  const stripped = title.replace(/<[^>]*>/g, '');

  // 移除潜在的脚本内容  
  let cleaned = stripped.replace(/(javascript:|vbscript:|data:)/gi, '');
  
  // 截断过长标题（限制在255字符内以防止过度消耗内存）
  if (cleaned.length > 255) {
    cleaned = cleaned.substring(0, 255);
  }
  
  return cleaned.trim();
}

/**
 * 验证并清理URL，只允许安全协议
 */
function sanitizeUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    return '';
  }
  
  try {
    const parsed = new URL(url);
    if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
      return '';
    }
    return url;
  } catch {
    return '';
  }
}

/**
 * 校验并清理整个书签数组
 */
function validateAndSanitizeBookmarks(data: unknown): BookmarkInfo[] {
  // 验证根结构
  if (!Array.isArray(data)) {
    throw createError.importError('Imported data must be an array of bookmarks');
  }
  
  if (data.length === 0) {
    logger.info('Empty bookmark array imported');
    return [];
  }
  
  // 计算总书签数
  const tempCount = data.reduce((total, bookmark) => {
    const childrenCount = bookmark.children ? getBookmarkCount(bookmark.children) : 0;
    return total + 1 + childrenCount;
  }, 0);
  
  // 检查是否超过最大大小限制
  if (tempCount > MAX_IMPORT_SIZE) {
    throw createError.importError(`Import size (${tempCount}) exceeds maximum allowed (${MAX_IMPORT_SIZE})`);
  }
  
  // 逐个验证和清理书签
  const validatedBookmarks: BookmarkInfo[] = [];
  for (let i = 0; i < data.length; i++) {
    validatedBookmarks.push(validateBookmarkStructure(data[i], `root[${i}]`));
  }
  
  const finalCount = getBookmarkCount(validatedBookmarks);
  if (finalCount > MAX_IMPORT_SIZE) {
    throw createError.importError(`Post-sanitized import size (${finalCount}) exceeds maximum allowed (${MAX_IMPORT_SIZE})`);
  }
  
  logger.info(`Successfully validated ${finalCount} bookmarks during import`);
  
  return validatedBookmarks;
}

/**
 * 导入书签
 * 从文件中读取并解析书签数据
 * 
 * @param file - 用户选择的文件对象
 * @returns Promise<BookmarkInfo[]> 解析后的书签数组
 * @throws BookmarkHubError 不支持的格式或解析失败
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
    // 验证输入参数
    if (!file || !(file instanceof File)) {
        throw createError.importError('Valid File object is required for import');
    }
    
    // 检查文件大小限制 (P1-8: Explicit file size limit)
    if (file.size > MAX_FILE_SIZE) {
        throw createError.importError(`File size (${file.size} bytes) exceeds maximum allowed (${MAX_FILE_SIZE} bytes)`);
    }
    
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
    throw createError.importError('Unsupported file format. Please import JSON or HTML format');
}

/**
 * 解析 JSON 格式书签
 * 
 * @param content - JSON 文件内容
 * @returns BookmarkInfo[] 书签数组
 * @throws BookmarkHubError 解析失败
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
        const data = JSON.parse(content, safeReviver);

        // 验证并清理数据
        return validateAndSanitizeBookmarks(data);
        
    } catch (error) {
        if (error instanceof BookmarkHubError) {
            // 已经是合适的错误格式
            logger.error(`JSON import validation error: ${error.message}`, error);
            throw error;
        } else {
            // 不是预期的 BookmarkHubError，将其包装
            logger.error(`Unexpected error during JSON parsing: ${error}`);
            throw createError.parseError('Failed to parse JSON file format');
        }
    }
}

/**
 * 解析 HTML 书签文件
 * 使用 DOMParser 解析浏览器书签标准格式
 * 
 * @param content - HTML 文件内容
 * @returns BookmarkInfo[] 书签数组
 * @throws BookmarkHubError 格式无效
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
        logger.warn('No DL element found in imported HTML bookmark file');
        throw createError.importError('Invalid HTML bookmark file format');
    }

    // 递归解析书签
    const bookmarks: BookmarkInfo[] = [];
    parseDlElement(dl, bookmarks);

    // 验证并清理解析的书签数据
    return validateAndSanitizeBookmarks(bookmarks);
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
                // 是书签 - P1-7: Sanitize URL to prevent XSS
                const rawUrl = a.href;
                const safeUrl = sanitizeUrl(rawUrl);
                const bookmark: BookmarkInfo = {
                    id: "",
                    title: sanitizeTitle(a.textContent || ''),
                    url: safeUrl
                };
                if (safeUrl) {
                    parent.push(bookmark);
                }
            } else if (h3) {
                // 是文件夹
                const folder: BookmarkInfo = {
                    id: "",
                    title: sanitizeTitle(h3.textContent || ''),
                    children: []
                };

                // 查找直接的子 DL 元素 (子文件夹)
                const dl = child.querySelector(':scope > DL');
                if (dl && folder.children) {
                    // 递归解析子文件夹
                    parseDlElement(dl, folder.children);
                }

                parent.push(folder);
            }
        }
    }
}
