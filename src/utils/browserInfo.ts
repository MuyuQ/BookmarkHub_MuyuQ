/**
 * BookmarkHub 浏览器信息模块
 * 
 * 提供获取当前浏览器和操作系统信息的功能
 */

import { BrowserInfo } from './models';

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
    
    let browser = 'Unknown';
    if (ua.includes('Firefox')) {
        browser = 'Firefox';
    } else if (ua.includes('Edg/')) {
        browser = 'Edge';
    } else if (ua.includes('Chrome')) {
        browser = 'Chrome';
    }
    
    let os = 'Unknown';
    if (ua.includes('Windows')) {
        os = 'Windows';
    } else if (ua.includes('Mac')) {
        os = 'macOS';
    } else if (ua.includes('Linux')) {
        os = 'Linux';
    }
    
    return { browser, os };
}