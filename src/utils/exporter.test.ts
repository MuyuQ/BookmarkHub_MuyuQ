/**
 * exporter.ts 单元测试
 *
 * 覆盖书签导出：
 * - HTML 导出包含 NETSCAPE 头
 * - 标题 / URL 的 HTML 转义（& < > " '）
 * - 递归文件夹生成嵌套 DL 结构
 * - JSON 导出与下载触发（文件名、MIME、revokeObjectURL）
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportBookmarks } from './exporter';
import type { BookmarkInfo } from './models';

// jsdom 未实现 Blob URL，需要打桩；同时捕获导出的 Blob 内容与下载锚点
let capturedBlob: Blob | null = null;
let capturedAnchor: HTMLAnchorElement | null = null;
const revokeObjectURLMock = vi.fn();

beforeAll(() => {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn((blob: Blob) => {
      capturedBlob = blob;
      return 'blob:mock-url';
    }),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: revokeObjectURLMock,
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- 需要捕获 mock 的 this 以断言锚点属性
    capturedAnchor = this;
  });
});

beforeEach(() => {
  capturedBlob = null;
  capturedAnchor = null;
  revokeObjectURLMock.mockClear();
});

async function exportHtml(bookmarks: BookmarkInfo[]): Promise<string> {
  await exportBookmarks('html', bookmarks);
  expect(capturedBlob).not.toBeNull();
  return (capturedBlob as Blob).text();
}

async function exportJson(bookmarks: BookmarkInfo[]): Promise<string> {
  await exportBookmarks('json', bookmarks);
  expect(capturedBlob).not.toBeNull();
  return (capturedBlob as Blob).text();
}

describe('exportBookmarks - html', () => {
  it('emits the NETSCAPE-Bookmark-file-1 header and standard scaffold', async () => {
    const html = await exportHtml([{ title: 'A', url: 'https://a.example.com' }]);

    expect(html).toContain('<!DOCTYPE NETSCAPE-Bookmark-file-1>');
    expect(html).toContain('<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">');
    expect(html).toContain('<TITLE>Bookmarks</TITLE>');
    expect(html).toContain('<H1>Bookmarks</H1>');
    expect(html.startsWith('<!DOCTYPE NETSCAPE-Bookmark-file-1>\n')).toBe(true);
    expect(html.trimEnd().endsWith('</DL><p>')).toBe(true);
  });

  it('emits a bookmark anchor line with title and url', async () => {
    const html = await exportHtml([{ title: 'GitHub', url: 'https://github.com' }]);
    expect(html).toContain('<DT><A HREF="https://github.com">GitHub</A>');
  });

  it('escapes special characters in titles (& < > " \')', async () => {
    const html = await exportHtml([
      { title: 'A & B <tags> "quoted" \'single\'', url: 'https://example.com' },
    ]);
    expect(html).toContain('A &amp; B &lt;tags&gt; &quot;quoted&quot; &#039;single&#039;');
    // 原始字符不得未转义出现在锚点内容中
    expect(html).not.toContain('<tags>');
  });

  it('escapes special characters in URLs (& < > " \')', async () => {
    const html = await exportHtml([
      { title: 'Search', url: 'https://example.com/search?q=a&b=<x>"y"\'>z' },
    ]);
    expect(html).toContain(
      '<DT><A HREF="https://example.com/search?q=a&amp;b=&lt;x&gt;&quot;y&quot;&#039;&gt;z">Search</A>'
    );
  });

  it('renders nested folders recursively with proper DL structure', async () => {
    const html = await exportHtml([
      {
        title: 'Parent Folder',
        children: [
          { title: 'Child Bookmark', url: 'https://child.example.com' },
          {
            title: 'Nested Folder',
            children: [{ title: 'Deep Bookmark', url: 'https://deep.example.com' }],
          },
        ],
      },
      { title: 'Top Bookmark', url: 'https://top.example.com' },
    ]);

    expect(html).toContain('<DT><H3>Parent Folder</H3>');
    expect(html).toContain('<DT><A HREF="https://child.example.com">Child Bookmark</A>');
    expect(html).toContain('<DT><H3>Nested Folder</H3>');
    expect(html).toContain('<DT><A HREF="https://deep.example.com">Deep Bookmark</A>');
    expect(html).toContain('<DT><A HREF="https://top.example.com">Top Bookmark</A>');

    // 嵌套 DL 的缩进与配对（每层 4 空格缩进）
    expect(html).toContain('<DT><H3>Parent Folder</H3>'); // 顶层无缩进
    expect(html).toContain('    <DT><H3>Nested Folder</H3>'); // 一级缩进
    expect(html).toContain('        <DT><A HREF="https://deep.example.com">Deep Bookmark</A>'); // 二级缩进
    expect(html.match(/<DL><p>/g)).toHaveLength(3); // 根 + Parent + Nested
    expect(html.match(/<\/DL><p>/g)).toHaveLength(3);
  });

  it('skips empty folders (children array without items)', async () => {
    const html = await exportHtml([{ title: 'Empty Folder', children: [] }]);
    expect(html).not.toContain('<H3>Empty Folder</H3>');
  });

  it('round-trips: exported HTML can be re-imported with the same hierarchy', async () => {
    const { importBookmarks } = await import('./importer');
    const bookmarks: BookmarkInfo[] = [
      { title: 'Bar', children: [{ title: 'Site & Co', url: 'https://site.example.com/?a=1&b=2' }] },
    ];
    const html = await exportHtml(bookmarks);
    const file = new File([html], 'roundtrip.html', { type: 'text/html' });
    const imported = await importBookmarks(file);

    expect(imported).toHaveLength(1);
    expect(imported[0].title).toBe('Bar');
    expect(imported[0].children![0].title).toBe('Site & Co');
    expect(imported[0].children![0].url).toBe('https://site.example.com/?a=1&b=2');
  });
});

describe('exportBookmarks - json', () => {
  it('serializes the full bookmark structure as pretty-printed JSON', async () => {
    const bookmarks: BookmarkInfo[] = [
      { title: 'GitHub', url: 'https://github.com' },
      { title: 'Folder', children: [{ title: 'Nested', url: 'https://nested.example.com' }] },
    ];
    const json = await exportJson(bookmarks);

    expect(JSON.parse(json)).toEqual(bookmarks);
    // 2 空格缩进
    expect(json).toContain('\n  {\n    "title": "GitHub"');
  });

  it('exports an empty array for empty input', async () => {
    const json = await exportJson([]);
    expect(JSON.parse(json)).toEqual([]);
  });
});

describe('exportBookmarks - download trigger', () => {
  it('creates a download link with the dated html filename and mime type', async () => {
    await exportBookmarks('html', [{ title: 'A', url: 'https://a.example.com' }]);

    const anchor = capturedAnchor as HTMLAnchorElement;
    expect(anchor).not.toBeNull();
    const expectedDate = new Date().toISOString().split('T')[0];
    expect(anchor.download).toBe(`bookmarks-${expectedDate}.html`);
    expect(anchor.href).toContain('blob:');
    expect((capturedBlob as Blob).type).toBe('text/html');
    expect(revokeObjectURLMock).toHaveBeenCalledTimes(1);
  });

  it('creates a download link with the dated json filename and mime type', async () => {
    await exportBookmarks('json', []);

    const anchor = capturedAnchor as HTMLAnchorElement;
    const expectedDate = new Date().toISOString().split('T')[0];
    expect(anchor.download).toBe(`bookmarks-${expectedDate}.json`);
    expect((capturedBlob as Blob).type).toBe('application/json');
    expect(revokeObjectURLMock).toHaveBeenCalledTimes(1);
  });
});
