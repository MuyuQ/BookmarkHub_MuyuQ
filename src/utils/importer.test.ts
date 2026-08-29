/**
 * importer.ts 单元测试
 *
 * 覆盖书签导入：
 * - JSON 导入：结构校验、__proto__ 键抛错、非法结构抛错
 * - HTML 导入：嵌套文件夹层级保留（:scope > 直接子级限定）、javascript: URL 丢弃
 * - 限制：超过 10MB / 10000 条抛错、不支持的格式抛错
 */

import { describe, expect, it } from 'vitest';
import { importBookmarks } from './importer';
import { BookmarkHubError, ErrorCode } from './errors';
import type { BookmarkInfo } from './models';

function makeJsonFile(content: string, name = 'bookmarks.json'): File {
  return new File([content], name, { type: 'application/json' });
}

function makeHtmlFile(content: string, name = 'bookmarks.html'): File {
  return new File([content], name, { type: 'text/html' });
}

describe('importBookmarks - input validation', () => {
  it('rejects non-File input', async () => {
    await expect(importBookmarks(null as unknown as File)).rejects.toThrow(BookmarkHubError);
    await expect(importBookmarks('file.json' as unknown as File)).rejects.toThrow(BookmarkHubError);
  });

  it('rejects files larger than 10MB', async () => {
    const bigContent = 'x'.repeat(10 * 1024 * 1024 + 1);
    const file = makeJsonFile(bigContent);
    expect(file.size).toBeGreaterThan(10 * 1024 * 1024);

    try {
      await importBookmarks(file);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(BookmarkHubError);
      expect((error as BookmarkHubError).code).toBe(ErrorCode.IMPORT_ERROR);
      expect((error as BookmarkHubError).message).toContain('File size');
    }
  });

  it('rejects unsupported file extensions', async () => {
    const file = new File(['data'], 'bookmarks.txt');
    await expect(importBookmarks(file)).rejects.toThrow(/Unsupported file format/);
  });
});

describe('importBookmarks - JSON format', () => {
  it('imports a simple flat list of bookmarks', async () => {
    const json = JSON.stringify([
      { title: 'GitHub', url: 'https://github.com' },
      { title: 'MDN', url: 'https://developer.mozilla.org' },
    ]);
    const result = await importBookmarks(makeJsonFile(json));

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ title: 'GitHub', url: 'https://github.com' });
    expect(result[1]).toMatchObject({ title: 'MDN', url: 'https://developer.mozilla.org' });
  });

  it('imports folders with nested children', async () => {
    const json = JSON.stringify([
      {
        title: '工具',
        children: [
          { title: 'MDN', url: 'https://developer.mozilla.org' },
          { title: '深层', children: [{ title: '深层书签', url: 'https://deep.example.com' }] },
        ],
      },
    ]);
    const result = await importBookmarks(makeJsonFile(json));

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('工具');
    expect(result[0].children).toHaveLength(2);
    expect(result[0].children![1].children![0].url).toBe('https://deep.example.com');
  });

  it('sanitizes titles by stripping HTML tags', async () => {
    const json = JSON.stringify([{ title: '<b>Bold</b> Title', url: 'https://example.com' }]);
    const result = await importBookmarks(makeJsonFile(json));
    expect(result[0].title).toBe('Bold Title');
  });

  it('returns empty array for an empty bookmark list', async () => {
    const result = await importBookmarks(makeJsonFile('[]'));
    expect(result).toEqual([]);
  });

  it('rejects non-array JSON root', async () => {
    try {
      await importBookmarks(makeJsonFile('{"a": 1}'));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(BookmarkHubError);
      expect((error as BookmarkHubError).code).toBe(ErrorCode.IMPORT_ERROR);
      expect((error as BookmarkHubError).message).toContain('array');
    }
  });

  it('wraps JSON syntax errors into PARSE_ERROR', async () => {
    try {
      await importBookmarks(makeJsonFile('{invalid json'));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(BookmarkHubError);
      expect((error as BookmarkHubError).code).toBe(ErrorCode.PARSE_ERROR);
    }
  });

  it('rejects bookmarks missing the title field', async () => {
    const json = JSON.stringify([{ url: 'https://example.com' }]);
    await expect(importBookmarks(makeJsonFile(json))).rejects.toThrow(/missing or invalid title/);
  });

  it('rejects bookmarks with neither url nor children', async () => {
    const json = JSON.stringify([{ title: 'orphan' }]);
    await expect(importBookmarks(makeJsonFile(json))).rejects.toThrow(/either url or children/);
  });

  it('rejects non-object entries in the bookmark array', async () => {
    // null 在计数阶段触发 TypeError → 包装为 PARSE_ERROR
    try {
      await importBookmarks(makeJsonFile('[null]'));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(BookmarkHubError);
      expect((error as BookmarkHubError).code).toBe(ErrorCode.PARSE_ERROR);
    }
    // 非对象原始值在结构校验阶段以 IMPORT_ERROR 拒绝
    await expect(importBookmarks(makeJsonFile('[42]'))).rejects.toThrow(/not an object/);
    await expect(importBookmarks(makeJsonFile('["str"]'))).rejects.toThrow(/not an object/);
  });

  it('rejects JSON containing __proto__ key (prototype pollution)', async () => {
    const json = '{"bookmarks": [], "__proto__": {"isAdmin": true}}';
    // 顶层对象不是数组：__proto__ 检测先于数组校验触发
    try {
      await importBookmarks(makeJsonFile(json));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(BookmarkHubError);
      expect((error as BookmarkHubError).code).toBe(ErrorCode.IMPORT_ERROR);
      expect((error as BookmarkHubError).message).toContain('__proto__');
    }
    // 清洗后不应产生原型污染
    expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
  });

  it('rejects JSON with __proto__ nested inside bookmark nodes', async () => {
    const json = '[{"title": "A", "url": "https://a.example.com", "children": [{"__proto__": {"x": 1}, "title": "B"}]}]';
    await expect(importBookmarks(makeJsonFile(json))).rejects.toThrow(/__proto__/);
  });

  it('rejects imports exceeding 10000 bookmarks', async () => {
    const many = Array.from({ length: 10001 }, (_, i) => ({
      title: `Bookmark ${i}`,
      url: `https://example.com/${i}`,
    }));
    const json = JSON.stringify(many);
    const file = makeJsonFile(json);
    expect(file.size).toBeLessThan(10 * 1024 * 1024);

    try {
      await importBookmarks(file);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(BookmarkHubError);
      expect((error as BookmarkHubError).code).toBe(ErrorCode.IMPORT_ERROR);
      expect((error as BookmarkHubError).message).toContain('exceeds maximum');
    }
  });

  it('accepts exactly 10000 bookmarks', async () => {
    const many = Array.from({ length: 10000 }, (_, i) => ({
      title: `Bookmark ${i}`,
      url: `https://example.com/${i}`,
    }));
    const result = await importBookmarks(makeJsonFile(JSON.stringify(many)));
    expect(result).toHaveLength(10000);
  });
});

describe('importBookmarks - HTML format', () => {
  const basicHtml = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><A HREF="https://github.com/">GitHub</A>
    <DT><A HREF="https://developer.mozilla.org/">MDN</A>
</DL><p>`;

  it('imports flat bookmarks from browser HTML export', async () => {
    const result = await importBookmarks(makeHtmlFile(basicHtml));
    expect(result).toHaveLength(2);
    // 注意：DOM 的 a.href 属性会返回规范化后的绝对 URL（补全尾斜杠）
    expect(result[0]).toMatchObject({ title: 'GitHub', url: 'https://github.com/' });
    expect(result[1].url).toBe('https://developer.mozilla.org/');
  });

  it('preserves nested folder hierarchy', async () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
    <DT><A HREF="https://top.example.com/">Top</A>
    <DT><H3>Folder One</H3>
    <DL><p>
        <DT><A HREF="https://one.example.com/">One</A>
        <DT><H3>Folder Two</H3>
        <DL><p>
            <DT><A HREF="https://two.example.com/">Two</A>
        </DL><p>
    </DL><p>
</DL><p>`;
    const result = await importBookmarks(makeHtmlFile(html));

    expect(result).toHaveLength(2);
    // 顶层书签
    expect(result[0]).toMatchObject({ title: 'Top', url: 'https://top.example.com/' });
    // 一级文件夹
    const folderOne = result[1];
    expect(folderOne.title).toBe('Folder One');
    expect(folderOne.url).toBeUndefined();
    expect(folderOne.children).toHaveLength(2);
    expect(folderOne.children![0]).toMatchObject({ title: 'One', url: 'https://one.example.com/' });
    // 二级嵌套文件夹
    const folderTwo = folderOne.children![1];
    expect(folderTwo.title).toBe('Folder Two');
    expect(folderTwo.children).toHaveLength(1);
    expect(folderTwo.children![0]).toMatchObject({ title: 'Two', url: 'https://two.example.com/' });
  });

  it('does not misclassify a folder as a single bookmark when its nested DL contains anchors', async () => {
    // 文件夹 DT 内嵌套的 DL 中含 <a>，:scope > a 只匹配直接子级，
    // 因此该 DT 应解析为文件夹而非书签（P1-8）
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
    <DT><H3>Root Folder</H3>
    <DL><p>
        <DT><A HREF="https://inner.example.com/">Inner</A>
    </DL><p>
</DL><p>`;
    const result = await importBookmarks(makeHtmlFile(html));

    expect(result).toHaveLength(1);
    const node = result[0];
    expect(node.title).toBe('Root Folder');
    expect(node.url).toBeUndefined(); // 不是书签
    expect(node.children).toHaveLength(1);
    expect(node.children![0]).toMatchObject({ title: 'Inner', url: 'https://inner.example.com/' });
  });

  it('keeps empty folders', async () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
    <DT><H3>Empty Folder</H3>
    <DL><p>
    </DL><p>
</DL><p>`;
    const result = await importBookmarks(makeHtmlFile(html));
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Empty Folder');
    expect(result[0].children).toEqual([]);
  });

  it('drops bookmarks with javascript: URLs', async () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
    <DT><A HREF="https://safe.example.com/">Safe</A>
    <DT><A HREF="javascript:alert(1)">XSS</A>
    <DT><A HREF="data:text/html,<h1>evil</h1>">Data</A>
</DL><p>`;
    const result = await importBookmarks(makeHtmlFile(html));

    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://safe.example.com/');
    const urls = (result as BookmarkInfo[]).map(b => b.url || '');
    expect(urls.join(' ')).not.toContain('javascript');
  });

  it('strips HTML tags from bookmark titles', async () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
    <DT><A HREF="https://example.com"><b>Styled</b> Title</A>
</DL><p>`;
    const result = await importBookmarks(makeHtmlFile(html));
    expect(result[0].title).toBe('Styled Title');
  });

  it('rejects HTML without a DL element', async () => {
    const file = makeHtmlFile('<html><body><p>No bookmarks here</p></body></html>');
    try {
      await importBookmarks(file);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(BookmarkHubError);
      expect((error as BookmarkHubError).code).toBe(ErrorCode.IMPORT_ERROR);
      expect((error as BookmarkHubError).message).toContain('Invalid HTML bookmark file format');
    }
  });

  it('rejects bookmarks with empty titles', async () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
    <DT><A HREF="https://example.com"></A>
</DL><p>`;
    await expect(importBookmarks(makeHtmlFile(html))).rejects.toThrow(/missing or invalid title/);
  });

  it('is case-insensitive on file extension', async () => {
    const json = JSON.stringify([{ title: 'A', url: 'https://a.example.com' }]);
    const file = new File([json], 'bookmarks.JSON');
    const result = await importBookmarks(file);
    expect(result).toHaveLength(1);
  });
});
