/**
 * BookmarkHub 浏览器信息模块
 * 
 * 提供获取当前浏览器和操作系统信息的功能
 */

import { BrowserInfo } from './models';
import { ROOT_NODE_IDS, ROOT_FOLDER_NAMES } from './constants';

/**
 * 从 User-Agent 提取浏览器名称
 */
export function extractBrowserFromUA(ua: string): string {
    if (!ua) return 'Unknown';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Edg/')) return 'Edge';
    if (ua.includes('Chrome')) return 'Chrome';
    return 'Unknown';
}

/**
 * 从 User-Agent 提取操作系统
 */
export function extractOSFromUA(ua: string): string {
    if (!ua) return 'Unknown';
    if (ua.includes('Windows')) return 'Windows';
    if (ua.includes('Mac')) return 'macOS';
    if (ua.includes('Linux')) return 'Linux';
    return 'Unknown';
}

/**
 * 获取当前浏览器和操作系统信息
 * 解析 User-Agent 字符串提取关键信息
 *
 * @returns BrowserInfo 浏览器和操作系统信息
 */
export function getBrowserInfo(): BrowserInfo {
    const ua = navigator.userAgent;

    const browser = extractBrowserFromUA(ua);
    const os = extractOSFromUA(ua);

    return { browser, os };
}

/**
 * 书签 API 层面的浏览器家族
 * 通过书签树根节点 ID 判断（Firefox 为 'root________'，Chrome 系为 '0'），
 * 决定根文件夹的路由目标 ID
 */
export type BookmarkBrowserType = 'chrome' | 'firefox';

/**
 * 通过书签树根节点 ID 检测浏览器家族
 * 用于根文件夹（书签栏/其他书签等）的正确路由
 */
export async function detectBookmarkBrowserType(): Promise<BookmarkBrowserType> {
    const tree = await browser.bookmarks.getTree();
    return tree[0]?.id === 'root________' ? 'firefox' : 'chrome';
}

/**
 * 解析顶层根节点应写入的浏览器根文件夹 ID
 *
 * @param node - 顶层节点（根文件夹或顶层书签）
 * @param browserType - 浏览器家族
 * @returns 浏览器根文件夹 ID
 */
export function resolveRootTargetBrowserId(node: { title?: string; id?: string }, browserType: BookmarkBrowserType): string {
    const title = node.title || '';
    const isFirefox = browserType === 'firefox';

    if (ROOT_FOLDER_NAMES.TOOLBAR.includes(title)) {
        return isFirefox ? ROOT_NODE_IDS.TOOLBAR[1] : ROOT_NODE_IDS.TOOLBAR[0];
    }
    if (ROOT_FOLDER_NAMES.MENU.includes(title)) {
        // Chrome 无独立菜单文件夹，落入"其他书签"（与下载路径行为一致）
        return isFirefox ? ROOT_NODE_IDS.MENU[0] : ROOT_NODE_IDS.UNFILED[0];
    }
    if (ROOT_FOLDER_NAMES.MOBILE.includes(title)) {
        return isFirefox ? ROOT_NODE_IDS.MOBILE[1] : ROOT_NODE_IDS.MOBILE[0];
    }
    // 其他书签 / 未识别标题：落入"其他书签"
    return isFirefox ? ROOT_NODE_IDS.UNFILED[1] : ROOT_NODE_IDS.UNFILED[0];
}