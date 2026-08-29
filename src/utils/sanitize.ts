/**
 * BookmarkHub 共享数据清洗模块
 *
 * 提供对所有"外部输入书签数据"的统一清洗能力：
 * - 导入文件 (importer.ts)
 * - 远程同步数据 (dataFetcher.ts / manualSyncTransfer.ts)
 *
 * 远程 Gist / WebDAV 内容可能被篡改（共享 Gist、账号被盗、中间人），
 * 同步路径与导入路径必须执行同一安全标准：协议白名单、标题去标签、
 * 原型污染防护。
 */

import { BookmarkInfo } from './models';
import { createError } from './errors';
import { logger } from './logger';

/** 允许的 URL 协议白名单（防止 javascript:/data:/vbscript: 等 XSS 协议） */
const ALLOWED_PROTOCOLS = ['http:', 'https:', 'ftp:', 'ftps:'];

/** 危险的 JSON 键名 - 原型污染攻击向量 */
const DANGEROUS_JSON_KEYS = ['__proto__', 'constructor', 'prototype'];

/** 标题最大长度 */
const MAX_TITLE_LENGTH = 255;

/**
 * 清理标题字符串：移除 HTML 标签与脚本协议片段，并截断过长标题
 */
export function sanitizeBookmarkTitle(title: unknown): string {
    if (!title || typeof title !== 'string') {
        return '';
    }
    const stripped = title.replace(/<[^>]*>/g, '');
    let cleaned = stripped.replace(/(javascript:|vbscript:|data:)/gi, '');
    if (cleaned.length > MAX_TITLE_LENGTH) {
        cleaned = cleaned.substring(0, MAX_TITLE_LENGTH);
    }
    return cleaned.trim();
}

/**
 * 验证并清理 URL：只允许安全协议，非法 URL 返回空串
 */
export function sanitizeBookmarkUrl(url: unknown): string {
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
 * 带 reviver 的安全 JSON.parse：检测到危险键名（__proto__ 等）立即抛错
 * 用于解析所有不可信来源的 JSON（远程同步数据、导入文件）
 */
export function safeJsonParse(text: string): unknown {
    return JSON.parse(text, (key, value) => {
        if (DANGEROUS_JSON_KEYS.includes(key)) {
            throw createError.importError(`Dangerous key "${key}" detected - potential prototype pollution attack`);
        }
        return value;
    });
}

/**
 * 递归清洗书签树（面向不可信的远程/导入数据）
 *
 * - 逐节点重建为只含合法字段的白名单对象（天然阻断多余键的传播）
 * - 非法协议的书签节点直接丢弃
 * - 文件夹递归清洗，空标题文件夹保留（存在用户合法使用场景）
 *
 * @param nodes - 不可信的书签节点数组
 * @param depth - 当前递归深度
 * @returns 清洗后的书签树
 */
export function sanitizeBookmarkTree(nodes: unknown, depth: number = 0): BookmarkInfo[] {
    const MAX_DEPTH = 100;
    if (!Array.isArray(nodes) || depth > MAX_DEPTH) {
        return [];
    }

    const result: BookmarkInfo[] = [];
    for (const raw of nodes) {
        if (!raw || typeof raw !== 'object') continue;
        const node = raw as Record<string, unknown>;

        const title = sanitizeBookmarkTitle(node.title);
        const rawUrl = typeof node.url === 'string' ? node.url : undefined;

        // 白名单字段重建（标量字段逐个校验类型后保留，多余键被丢弃）
        const scalars = {
            ...(typeof node.id === 'string' && node.id && { id: node.id }),
            ...(typeof node.parentId === 'string' && node.parentId && { parentId: node.parentId }),
            ...(typeof node.index === 'number' && { index: node.index }),
            ...(typeof node.dateAdded === 'number' && { dateAdded: node.dateAdded }),
            ...(typeof node.dateGroupModified === 'number' && { dateGroupModified: node.dateGroupModified }),
            ...(node.unmodifiable === 'managed' && { unmodifiable: 'managed' as const }),
            title,
        };

        if (rawUrl !== undefined) {
            // 书签节点：URL 必须通过协议白名单，否则整个节点丢弃
            const safeUrl = sanitizeBookmarkUrl(rawUrl);
            if (!safeUrl) {
                logger.warn('sanitizeBookmarkTree: dropped bookmark with unsafe URL', { title });
                continue;
            }
            result.push({ ...scalars, url: safeUrl });
            continue;
        }

        // 文件夹节点：递归清洗子树
        const children = node.children !== undefined ? sanitizeBookmarkTree(node.children, depth + 1) : undefined;
        result.push({ ...scalars, ...(children && { children }) });
    }
    return result;
}
