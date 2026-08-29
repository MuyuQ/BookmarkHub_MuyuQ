/**
 * sanitize.ts 单元测试
 *
 * 覆盖共享安全清洗模块的核心安全行为：
 * - safeJsonParse: 原型污染键检测与抛错
 * - sanitizeBookmarkUrl: 协议白名单
 * - sanitizeBookmarkTitle: 去标签 / 截断
 * - sanitizeBookmarkTree: 白名单字段重建、非法节点丢弃、深度上限
 */

import { describe, it, expect } from 'vitest';
import type { BookmarkInfo } from './models';
import {
  safeJsonParse,
  sanitizeBookmarkUrl,
  sanitizeBookmarkTitle,
  sanitizeBookmarkTree,
} from './sanitize';
import { BookmarkHubError, ErrorCode } from './errors';

describe('safeJsonParse', () => {
  it('parses valid JSON correctly', () => {
    expect(safeJsonParse('{"a":1,"b":[1,2],"c":"x"}')).toEqual({ a: 1, b: [1, 2], c: 'x' });
    expect(safeJsonParse('[1,2,3]')).toEqual([1, 2, 3]);
    expect(safeJsonParse('null')).toBeNull();
  });

  it('throws BookmarkHubError (IMPORT_ERROR) on __proto__ key', () => {
    expect(() => safeJsonParse('{"__proto__": {"polluted": true}}')).toThrow(BookmarkHubError);
    try {
      safeJsonParse('{"__proto__": {"polluted": true}}');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(BookmarkHubError);
      expect((error as BookmarkHubError).code).toBe(ErrorCode.IMPORT_ERROR);
      expect((error as BookmarkHubError).message).toContain('__proto__');
    }
  });

  it('throws on constructor key', () => {
    expect(() => safeJsonParse('{"constructor": {"x": 1}}')).toThrow(BookmarkHubError);
    try {
      safeJsonParse('{"constructor": 1}');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as BookmarkHubError).code).toBe(ErrorCode.IMPORT_ERROR);
      expect((error as BookmarkHubError).message).toContain('constructor');
    }
  });

  it('throws on prototype key', () => {
    expect(() => safeJsonParse('{"prototype": "evil"}')).toThrow(BookmarkHubError);
    try {
      safeJsonParse('{"prototype": "evil"}');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as BookmarkHubError).code).toBe(ErrorCode.IMPORT_ERROR);
      expect((error as BookmarkHubError).message).toContain('prototype');
    }
  });

  it('throws on nested dangerous keys', () => {
    expect(() => safeJsonParse('{"a": {"b": {"__proto__": {"x": 1}}}}')).toThrow(BookmarkHubError);
    expect(() => safeJsonParse('[{"constructor": 1}]')).toThrow(BookmarkHubError);
  });

  it('allows benign keys containing similar names', () => {
    // 非精确匹配的危险键名不应误伤
    expect(safeJsonParse('{"myConstructor": 1, "prototypes": 2, "__proto__x": 3}')).toEqual({
      myConstructor: 1,
      prototypes: 2,
      __proto__x: 3,
    });
  });

  it('propagates SyntaxError for invalid JSON', () => {
    expect(() => safeJsonParse('not json {{{')).toThrow();
  });

  it('does not pollute Object prototype when dangerous key is detected', () => {
    expect(() => safeJsonParse('{"__proto__": {"polluted": true}}')).toThrow();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('sanitizeBookmarkUrl', () => {
  it('allows whitelisted protocols (http/https/ftp/ftps)', () => {
    expect(sanitizeBookmarkUrl('http://example.com/page')).toBe('http://example.com/page');
    expect(sanitizeBookmarkUrl('https://example.com/path?q=1#frag')).toBe('https://example.com/path?q=1#frag');
    expect(sanitizeBookmarkUrl('ftp://files.example.com/file.txt')).toBe('ftp://files.example.com/file.txt');
    expect(sanitizeBookmarkUrl('ftps://files.example.com/file.txt')).toBe('ftps://files.example.com/file.txt');
  });

  it('rejects javascript: protocol', () => {
    expect(sanitizeBookmarkUrl('javascript:alert(1)')).toBe('');
    expect(sanitizeBookmarkUrl('JavaScript:alert(1)')).toBe('');
    expect(sanitizeBookmarkUrl('JAVASCRIPT:void(0)')).toBe('');
  });

  it('rejects data: protocol', () => {
    expect(sanitizeBookmarkUrl('data:text/html,<script>alert(1)</script>')).toBe('');
    expect(sanitizeBookmarkUrl('DATA:text/plain,hello')).toBe('');
  });

  it('rejects vbscript: and other dangerous protocols', () => {
    expect(sanitizeBookmarkUrl('vbscript:msgbox(1)')).toBe('');
    expect(sanitizeBookmarkUrl('file:///C:/Windows/System32')).toBe('');
    expect(sanitizeBookmarkUrl('chrome://settings')).toBe('');
  });

  it('rejects non-URL strings', () => {
    expect(sanitizeBookmarkUrl('not a url')).toBe('');
    expect(sanitizeBookmarkUrl('example.com')).toBe('');
    expect(sanitizeBookmarkUrl('   ')).toBe('');
  });

  it('rejects empty / null / non-string input', () => {
    expect(sanitizeBookmarkUrl('')).toBe('');
    expect(sanitizeBookmarkUrl(null)).toBe('');
    expect(sanitizeBookmarkUrl(undefined)).toBe('');
    expect(sanitizeBookmarkUrl(123 as unknown as string)).toBe('');
    expect(sanitizeBookmarkUrl({} as unknown as string)).toBe('');
  });

  it('accepts uppercase protocol scheme (URL normalizes protocol)', () => {
    // new URL 会把 protocol 归一化为小写，因此大写 HTTP 也应通过白名单
    expect(sanitizeBookmarkUrl('HTTPS://EXAMPLE.COM/Path')).toBe('HTTPS://EXAMPLE.COM/Path');
  });
});

describe('sanitizeBookmarkTitle', () => {
  it('strips HTML tags', () => {
    expect(sanitizeBookmarkTitle('<b>Bold</b> title')).toBe('Bold title');
    expect(sanitizeBookmarkTitle('<script>alert(1)</script>Hello')).toBe('alert(1)Hello');
    expect(sanitizeBookmarkTitle('Hello <b>World</b>!')).toBe('Hello World!');
  });

  it('removes script protocol fragments (case-insensitive)', () => {
    expect(sanitizeBookmarkTitle('javascript:alert(1)')).toBe('alert(1)');
    expect(sanitizeBookmarkTitle('JavaScript:alert(1)')).toBe('alert(1)');
    expect(sanitizeBookmarkTitle('vbscript:msgbox')).toBe('msgbox');
    expect(sanitizeBookmarkTitle('data:text/html,evil')).toBe('text/html,evil');
  });

  it('truncates titles longer than 255 chars', () => {
    expect(sanitizeBookmarkTitle('a'.repeat(300)).length).toBe(255);
    expect(sanitizeBookmarkTitle('a'.repeat(300))).toBe('a'.repeat(255));
  });

  it('truncates after tag stripping', () => {
    const title = `<b>${'x'.repeat(300)}</b>`;
    const cleaned = sanitizeBookmarkTitle(title);
    expect(cleaned.length).toBe(255);
    expect(cleaned).not.toContain('<b>');
  });

  it('keeps titles of exactly 255 chars intact', () => {
    const title = 'b'.repeat(255);
    expect(sanitizeBookmarkTitle(title)).toBe(title);
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeBookmarkTitle('  hello  ')).toBe('hello');
  });

  it('returns empty string for empty / null / non-string input', () => {
    expect(sanitizeBookmarkTitle('')).toBe('');
    expect(sanitizeBookmarkTitle(null)).toBe('');
    expect(sanitizeBookmarkTitle(undefined)).toBe('');
    expect(sanitizeBookmarkTitle(42 as unknown as string)).toBe('');
    expect(sanitizeBookmarkTitle({} as unknown as string)).toBe('');
  });

  it('handles Chinese and unicode titles', () => {
    expect(sanitizeBookmarkTitle('中文标题 🎉')).toBe('中文标题 🎉');
  });
});

describe('sanitizeBookmarkTree', () => {
  it('returns empty array for non-array input', () => {
    expect(sanitizeBookmarkTree(null)).toEqual([]);
    expect(sanitizeBookmarkTree(undefined)).toEqual([]);
    expect(sanitizeBookmarkTree('not array')).toEqual([]);
    expect(sanitizeBookmarkTree({ title: 'x' })).toEqual([]);
  });

  it('skips non-object entries', () => {
    expect(sanitizeBookmarkTree([null, 42, 'str', undefined])).toEqual([]);
  });

  it('keeps whitelisted scalar fields on bookmark nodes', () => {
    const tree = [
      {
        id: 'bm_1',
        parentId: 'folder_1',
        index: 3,
        title: 'Example',
        url: 'https://example.com',
        dateAdded: 1700000000000,
        dateGroupModified: 1700000000001,
        unmodifiable: 'managed',
        // 多余字段应被丢弃
        evil: 'payload',
        __proto__: null,
      },
    ];
    const cleaned = sanitizeBookmarkTree(tree);
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0]).toEqual({
      id: 'bm_1',
      parentId: 'folder_1',
      index: 3,
      title: 'Example',
      url: 'https://example.com',
      dateAdded: 1700000000000,
      dateGroupModified: 1700000000001,
      unmodifiable: 'managed',
    });
  });

  it('drops bookmarks with unsafe URLs (javascript:/data:)', () => {
    const tree = [
      { title: 'Safe', url: 'https://safe.example.com' },
      { title: 'XSS', url: 'javascript:alert(1)' },
      { title: 'Data', url: 'data:text/html,<h1>evil</h1>' },
      { title: 'Also Safe', url: 'http://safe.example.com/2' },
    ];
    const cleaned = sanitizeBookmarkTree(tree);
    expect(cleaned).toHaveLength(2);
    expect(cleaned.map(b => b.title)).toEqual(['Safe', 'Also Safe']);
  });

  it('sanitizes bookmark titles', () => {
    const cleaned = sanitizeBookmarkTree([{ title: '<b>Nice</b>', url: 'https://example.com' }]);
    expect(cleaned[0].title).toBe('Nice');
  });

  it('recursively sanitizes folders and keeps empty-title folders', () => {
    const tree = [
      {
        title: '',
        children: [
          { title: 'Child1', url: 'https://c1.example.com' },
          {
            title: 'Sub <i>Folder</i>',
            children: [{ title: 'Deep', url: 'https://deep.example.com' }],
          },
        ],
      },
    ];
    const cleaned = sanitizeBookmarkTree(tree);
    expect(cleaned).toHaveLength(1);
    const root = cleaned[0];
    expect(root.title).toBe('');
    expect(root.children).toHaveLength(2);
    expect(root.children![0].title).toBe('Child1');
    expect(root.children![1].title).toBe('Sub Folder'); // 标签已剥离
    expect(root.children![1].children![0].url).toBe('https://deep.example.com');
  });

  it('drops unsafe bookmarks inside folders but keeps the folder', () => {
    const tree = [
      {
        title: 'Folder',
        children: [
          { title: 'Bad', url: 'javascript:void(0)' },
          { title: 'Good', url: 'https://good.example.com' },
        ],
      },
    ];
    const cleaned = sanitizeBookmarkTree(tree);
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0].children).toHaveLength(1);
    expect(cleaned[0].children![0].url).toBe('https://good.example.com');
  });

  it('drops scalar fields with wrong types', () => {
    const tree = [
      {
        id: 123 as unknown as string, // 非字符串 id → 丢弃
        parentId: null, // 非字符串 → 丢弃
        index: '0' as unknown as number, // 非数字 → 丢弃
        dateAdded: '1700' as unknown as number, // 非数字 → 丢弃
        unmodifiable: 'other', // 非 'managed' → 丢弃
        title: 'T',
        url: 'https://example.com',
      },
    ];
    const cleaned = sanitizeBookmarkTree(tree);
    expect(cleaned[0]).toEqual({ title: 'T', url: 'https://example.com' });
  });

  it('treats nodes with non-string url as folders (no url field)', () => {
    const tree = [{ title: 'Not A Url', url: 123 as unknown as string }];
    const cleaned = sanitizeBookmarkTree(tree);
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0].url).toBeUndefined();
    expect(cleaned[0].children).toBeUndefined();
  });

  it('omits children key for leaf folders without children', () => {
    const cleaned = sanitizeBookmarkTree([{ title: 'Empty Folder' }]);
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0].children).toBeUndefined();
  });

  it('keeps empty children arrays for folders that declare children: []', () => {
    const cleaned = sanitizeBookmarkTree([{ title: 'Empty', children: [] }]);
    expect(cleaned[0].children).toEqual([]);
  });

  it('enforces maximum recursion depth (100 levels)', () => {
    // 构建 150 层深度的嵌套文件夹链
    let node: Record<string, unknown> = { title: 'Bottom', url: 'https://bottom.example.com' };
    for (let i = 0; i < 150; i++) {
      node = { title: `L${i}`, children: [node] };
    }
    const cleaned = sanitizeBookmarkTree([node]);

    // 前 101 层（L0..L100）应保留，更深的内容被截断
    let current: BookmarkInfo | undefined = cleaned[0];
    let depth = 0;
    while (current && current.children && current.children.length > 0) {
      current = current.children[0];
      depth++;
    }
    expect(depth).toBe(100);
    expect(current!.children).toEqual([]);
  });

  it('handles a full realistic sync payload', () => {
    const payload = [
      {
        title: '书签栏',
        children: [
          { id: 'bm_a', title: 'GitHub', url: 'https://github.com', index: 0 },
          { title: '工具', children: [{ id: 'bm_b', title: 'MDN', url: 'https://developer.mozilla.org' }] },
        ],
      },
      { title: '其他书签', children: [] },
    ];
    const cleaned = sanitizeBookmarkTree(payload);
    expect(cleaned).toHaveLength(2);
    expect(cleaned[0].title).toBe('书签栏');
    expect(cleaned[0].children![0].id).toBe('bm_a');
    expect(cleaned[1].children).toEqual([]);
  });
});
