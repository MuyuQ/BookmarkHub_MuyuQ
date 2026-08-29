/**
 * browserInfo.ts 单元测试
 *
 * 覆盖：
 * - extractBrowserFromUA / extractOSFromUA 各分支
 * - getBrowserInfo 的 UA 解析
 * - detectBookmarkBrowserType：root________ → firefox，否则 chrome
 * - resolveRootTargetBrowserId：chrome/firefox × toolbar/menu/unfiled/mobile/未知标题
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  detectBookmarkBrowserType,
  extractBrowserFromUA,
  extractOSFromUA,
  getBrowserInfo,
  resolveRootTargetBrowserId,
} from './browserInfo';
import { ROOT_NODE_IDS } from './constants';

const originalUa = Object.getOwnPropertyDescriptor(window.navigator, 'userAgent')
  || Object.getOwnPropertyDescriptor(Navigator.prototype, 'userAgent');

afterEach(() => {
  vi.unstubAllGlobals();
  // 恢复 navigator.userAgent
  if (originalUa) {
    Object.defineProperty(window.navigator, 'userAgent', originalUa);
  }
});

function stubUserAgent(ua: string): void {
  Object.defineProperty(window.navigator, 'userAgent', {
    value: ua,
    configurable: true,
    writable: true,
  });
}

describe('extractBrowserFromUA', () => {
  it('detects Firefox', () => {
    expect(extractBrowserFromUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0')).toBe('Firefox');
  });

  it('detects Edge (Edg/ token takes priority over Chrome)', () => {
    const edgeUa = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0';
    expect(extractBrowserFromUA(edgeUa)).toBe('Edge');
  });

  it('detects Chrome', () => {
    const chromeUa = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
    expect(extractBrowserFromUA(chromeUa)).toBe('Chrome');
  });

  it('returns Unknown for unrecognized UA', () => {
    expect(extractBrowserFromUA('Mozilla/5.0 (compatible; SomeBot/1.0)')).toBe('Unknown');
    expect(extractBrowserFromUA('Safari/17.0 Version/17.0')).toBe('Unknown');
  });

  it('returns Unknown for empty UA', () => {
    expect(extractBrowserFromUA('')).toBe('Unknown');
  });
});

describe('extractOSFromUA', () => {
  it('detects Windows', () => {
    expect(extractOSFromUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('Windows');
  });

  it('detects macOS (Mac token)', () => {
    expect(extractOSFromUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('macOS');
  });

  it('detects Linux', () => {
    expect(extractOSFromUA('Mozilla/5.0 (X11; Linux x86_64)')).toBe('Linux');
  });

  it('returns Unknown for unrecognized OS', () => {
    expect(extractOSFromUA('Mozilla/5.0 (Android 14; Mobile)')).toBe('Unknown');
  });

  it('returns Unknown for empty UA', () => {
    expect(extractOSFromUA('')).toBe('Unknown');
  });
});

describe('getBrowserInfo', () => {
  it('parses the current navigator.userAgent', () => {
    stubUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');
    expect(getBrowserInfo()).toEqual({ browser: 'Chrome', os: 'Windows' });
  });

  it('returns Unknown browser for jsdom-like UA', () => {
    stubUserAgent('Mozilla/5.0 (Unknown Platform) AppleWebKit/537.36 jsdom/24.0.0');
    expect(getBrowserInfo()).toEqual({ browser: 'Unknown', os: 'Unknown' });
  });

  it('parses Firefox on Linux UA', () => {
    stubUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0');
    expect(getBrowserInfo()).toEqual({ browser: 'Firefox', os: 'Linux' });
  });
});

describe('detectBookmarkBrowserType', () => {
  it('returns firefox when the tree root id is root________', async () => {
    vi.stubGlobal('browser', {
      bookmarks: {
        getTree: vi.fn().mockResolvedValue([{ id: 'root________', title: '', children: [] }]),
      },
    });
    await expect(detectBookmarkBrowserType()).resolves.toBe('firefox');
  });

  it('returns chrome when the tree root id is "0"', async () => {
    vi.stubGlobal('browser', {
      bookmarks: {
        getTree: vi.fn().mockResolvedValue([{ id: '0', title: '', children: [] }]),
      },
    });
    await expect(detectBookmarkBrowserType()).resolves.toBe('chrome');
  });

  it('returns chrome for any other root id', async () => {
    vi.stubGlobal('browser', {
      bookmarks: {
        getTree: vi.fn().mockResolvedValue([{ id: 'weird_root_id' }]),
      },
    });
    await expect(detectBookmarkBrowserType()).resolves.toBe('chrome');
  });

  it('returns chrome for an empty tree', async () => {
    vi.stubGlobal('browser', {
      bookmarks: {
        getTree: vi.fn().mockResolvedValue([]),
      },
    });
    await expect(detectBookmarkBrowserType()).resolves.toBe('chrome');
  });
});

describe('resolveRootTargetBrowserId', () => {
  const chrome = 'chrome' as const;
  const firefox = 'firefox' as const;

  it.each([
    // 书签栏 / 工具栏
    { title: '书签栏', type: chrome, expected: ROOT_NODE_IDS.TOOLBAR[0] },
    { title: '书签栏', type: firefox, expected: ROOT_NODE_IDS.TOOLBAR[1] },
    { title: 'Bookmarks Bar', type: chrome, expected: ROOT_NODE_IDS.TOOLBAR[0] },
    { title: 'Bookmarks bar', type: firefox, expected: ROOT_NODE_IDS.TOOLBAR[1] },
    { title: 'Leseleiste', type: chrome, expected: ROOT_NODE_IDS.TOOLBAR[0] },
    // 菜单
    { title: '书签菜单', type: firefox, expected: ROOT_NODE_IDS.MENU[0] },
    { title: 'Bookmarks Menu', type: firefox, expected: ROOT_NODE_IDS.MENU[0] },
    // Chrome 无独立菜单文件夹 → 落入"其他书签"
    { title: '书签菜单', type: chrome, expected: ROOT_NODE_IDS.UNFILED[0] },
    { title: 'Bookmarks Menu', type: chrome, expected: ROOT_NODE_IDS.UNFILED[0] },
    // 其他书签 / 未分类
    { title: '其他书签', type: chrome, expected: ROOT_NODE_IDS.UNFILED[0] },
    { title: '其他书签', type: firefox, expected: ROOT_NODE_IDS.UNFILED[1] },
    { title: 'Other Bookmarks', type: firefox, expected: ROOT_NODE_IDS.UNFILED[1] },
    // 移动设备书签
    { title: '移动设备书签', type: chrome, expected: ROOT_NODE_IDS.MOBILE[0] },
    { title: '移动设备书签', type: firefox, expected: ROOT_NODE_IDS.MOBILE[1] },
    { title: 'Mobile Bookmarks', type: chrome, expected: ROOT_NODE_IDS.MOBILE[0] },
    // 未知标题 → 落入"其他书签"
    { title: 'Unknown Folder', type: chrome, expected: ROOT_NODE_IDS.UNFILED[0] },
    { title: 'Unknown Folder', type: firefox, expected: ROOT_NODE_IDS.UNFILED[1] },
    // 空标题 → 落入"其他书签"
    { title: '', type: chrome, expected: ROOT_NODE_IDS.UNFILED[0] },
    { title: '', type: firefox, expected: ROOT_NODE_IDS.UNFILED[1] },
  ])('$title ($type) -> $expected', ({ title, type, expected }) => {
    expect(resolveRootTargetBrowserId({ title }, type)).toBe(expected);
  });

  it('does not rely on the node id field for routing', () => {
    // 带有任意 id 的节点仍按标题路由
    expect(resolveRootTargetBrowserId({ id: 'whatever', title: '书签栏' }, 'chrome')).toBe(ROOT_NODE_IDS.TOOLBAR[0]);
  });
});
