import { describe, it, expect } from 'vitest';
import { getBookmarkCount, formatBookmarks, flattenBookmarks } from './bookmarkUtils';
import type { BookmarkInfo } from './models';

describe('getBookmarkCount', () => {
  it('should return 0 for undefined', () => {
    const result = getBookmarkCount(undefined);
    expect(result).toBe(0);
  });

  it('should return 0 for empty array', () => {
    const result = getBookmarkCount([]);
    expect(result).toBe(0);
  });

  it('should return 0 for single bookmark', () => {
    const bookmarks: BookmarkInfo[] = [
      { id: '1', title: 'Bookmark 1', url: 'https://example.com' },
    ];

    const result = getBookmarkCount(bookmarks);

    expect(result).toBe(1);
  });

  it('should count multiple bookmarks', () => {
    const bookmarks: BookmarkInfo[] = [
      { id: '1', title: 'Bookmark 1', url: 'https://example.com/1' },
      { id: '2', title: 'Bookmark 2', url: 'https://example.com/2' },
      { id: '3', title: 'Bookmark 3', url: 'https://example.com/3' },
    ];

    const result = getBookmarkCount(bookmarks);

    expect(result).toBe(3);
  });

  it('should not count folders without URLs', () => {
    const bookmarks: BookmarkInfo[] = [
      { id: 'folder1', title: 'Folder 1', children: [] },
      { id: 'folder2', title: 'Folder 2', children: [] },
    ];

    const result = getBookmarkCount(bookmarks);

    expect(result).toBe(0);
  });

  it('should count bookmarks in nested folders', () => {
    const bookmarks: BookmarkInfo[] = [
      {
        id: 'folder1',
        title: 'Folder 1',
        children: [
          { id: 'bm1', title: 'Bookmark 1', url: 'https://example.com/1' },
          { id: 'bm2', title: 'Bookmark 2', url: 'https://example.com/2' },
        ],
      },
      {
        id: 'folder2',
        title: 'Folder 2',
        children: [
          { id: 'bm3', title: 'Bookmark 3', url: 'https://example.com/3' },
        ],
      },
    ];

    const result = getBookmarkCount(bookmarks);

    expect(result).toBe(3);
  });

  it('should count bookmarks in deeply nested folders', () => {
    const bookmarks: BookmarkInfo[] = [
      {
        id: 'root',
        title: 'Root Folder',
        children: [
          {
            id: 'sub1',
            title: 'Sub Folder 1',
            children: [
              {
                id: 'deep',
                title: 'Deep Folder',
                children: [
                  { id: 'deep-bm', title: 'Deep Bookmark', url: 'https://example.com/deep' },
                ],
              },
            ],
          },
          { id: 'bm1', title: 'Bookmark 1', url: 'https://example.com/1' },
        ],
      },
    ];

    const result = getBookmarkCount(bookmarks);

    expect(result).toBe(2);
  });

  it('should handle mixed folders and bookmarks', () => {
    const bookmarks: BookmarkInfo[] = [
      { id: 'bm1', title: 'Bookmark 1', url: 'https://example.com/1' },
      {
        id: 'folder1',
        title: 'Folder 1',
        children: [
          { id: 'bm2', title: 'Bookmark 2', url: 'https://example.com/2' },
          {
            id: 'sub',
            title: 'Sub Folder',
            children: [
              { id: 'bm3', title: 'Bookmark 3', url: 'https://example.com/3' },
            ],
          },
        ],
      },
      { id: 'bm4', title: 'Bookmark 4', url: 'https://example.com/4' },
    ];

    const result = getBookmarkCount(bookmarks);

    expect(result).toBe(4);
  });

  it('should handle folders with undefined children', () => {
    const bookmarks: BookmarkInfo[] = [
      { id: 'folder1', title: 'Folder 1', children: undefined },
      { id: 'bm1', title: 'Bookmark 1', url: 'https://example.com/1' },
    ];

    const result = getBookmarkCount(bookmarks);

    expect(result).toBe(1);
  });
});

describe('formatBookmarks', () => {
  it('should return undefined for empty array', () => {
    const result = formatBookmarks([]);
    expect(result).toBeUndefined();
  });

  it('should return undefined when first element has no children', () => {
    const bookmarks: BookmarkInfo[] = [
      { id: 'bm1', title: 'Bookmark 1', url: 'https://example.com/1' },
    ];

    const result = formatBookmarks(bookmarks);

    expect(result).toBeUndefined();
  });

  it('should return children of first element', () => {
    const children: BookmarkInfo[] = [
      { id: 'bm1', title: 'Bookmark 1', url: 'https://example.com/1' },
      { id: 'bm2', title: 'Bookmark 2', url: 'https://example.com/2' },
    ];

    const bookmarks: BookmarkInfo[] = [
      {
        id: 'root',
        title: 'Root',
        children,
      },
    ];

    const result = formatBookmarks(bookmarks);

    expect(result).toEqual(children);
  });

  it('should handle nested children structure', () => {
    const children: BookmarkInfo[] = [
      {
        id: 'folder1',
        title: 'Folder 1',
        children: [
          { id: 'bm1', title: 'Bookmark 1', url: 'https://example.com/1' },
        ],
      },
      { id: 'bm2', title: 'Bookmark 2', url: 'https://example.com/2' },
    ];

    const bookmarks: BookmarkInfo[] = [
      {
        id: 'root',
        title: 'Root',
        children,
      },
    ];

    const result = formatBookmarks(bookmarks);

    expect(result).toEqual(children);
  });
});

describe('flattenBookmarks', () => {
  it('should return empty array for empty input', () => {
    const result = flattenBookmarks([]);
    expect(result).toEqual([]);
  });

  it('should flatten single bookmark', () => {
    const bookmarks: BookmarkInfo[] = [
      { id: '1', title: 'Bookmark 1', url: 'https://example.com/1' },
    ];

    const result = flattenBookmarks(bookmarks);

    expect(result).toEqual([
      { title: 'Bookmark 1', url: 'https://example.com/1' },
    ]);
  });

  it('should flatten multiple bookmarks', () => {
    const bookmarks: BookmarkInfo[] = [
      { id: 'bm1', title: 'Bookmark 1', url: 'https://example.com/1' },
      { id: 'bm2', title: 'Bookmark 2', url: 'https://example.com/2' },
      { id: 'bm3', title: 'Bookmark 3', url: 'https://example.com/3' },
    ];

    const result = flattenBookmarks(bookmarks);

    expect(result).toEqual([
      { title: 'Bookmark 1', url: 'https://example.com/1' },
      { title: 'Bookmark 2', url: 'https://example.com/2' },
      { title: 'Bookmark 3', url: 'https://example.com/3' },
    ]);
  });

  it('should exclude folders without URLs', () => {
    const bookmarks: BookmarkInfo[] = [
      { id: 'folder1', title: 'Folder 1', children: [] },
      { id: 'bm1', title: 'Bookmark 1', url: 'https://example.com/1' },
      { id: 'folder2', title: 'Folder 2', children: [] },
    ];

    const result = flattenBookmarks(bookmarks);

    expect(result).toEqual([
      { title: 'Bookmark 1', url: 'https://example.com/1' },
    ]);
  });

  it('should flatten nested bookmarks', () => {
    const bookmarks: BookmarkInfo[] = [
      {
        id: 'folder1',
        title: 'Folder 1',
        children: [
          { id: 'bm1', title: 'Bookmark 1', url: 'https://example.com/1' },
          { id: 'bm2', title: 'Bookmark 2', url: 'https://example.com/2' },
        ],
      },
      {
        id: 'folder2',
        title: 'Folder 2',
        children: [
          { id: 'bm3', title: 'Bookmark 3', url: 'https://example.com/3' },
        ],
      },
    ];

    const result = flattenBookmarks(bookmarks);

    expect(result).toEqual([
      { title: 'Bookmark 1', url: 'https://example.com/1' },
      { title: 'Bookmark 2', url: 'https://example.com/2' },
      { title: 'Bookmark 3', url: 'https://example.com/3' },
    ]);
  });

  it('should flatten deeply nested bookmarks', () => {
    const bookmarks: BookmarkInfo[] = [
      {
        id: 'root',
        title: 'Root Folder',
        children: [
          {
            id: 'level1',
            title: 'Level 1 Folder',
            children: [
              {
                id: 'level2',
                title: 'Level 2 Folder',
                children: [
                  { id: 'deep', title: 'Deep Bookmark', url: 'https://example.com/deep' },
                ],
              },
            ],
          },
          { id: 'bm1', title: 'Bookmark 1', url: 'https://example.com/1' },
        ],
      },
    ];

    const result = flattenBookmarks(bookmarks);

    expect(result).toEqual([
      { title: 'Deep Bookmark', url: 'https://example.com/deep' },
      { title: 'Bookmark 1', url: 'https://example.com/1' },
    ]);
  });

  it('should handle mixed structure with folders and bookmarks', () => {
    const bookmarks: BookmarkInfo[] = [
      { id: 'bm1', title: 'Bookmark 1', url: 'https://example.com/1' },
      {
        id: 'folder1',
        title: 'Folder 1',
        children: [
          { id: 'bm2', title: 'Bookmark 2', url: 'https://example.com/2' },
          {
            id: 'sub',
            title: 'Sub Folder',
            children: [
              { id: 'bm3', title: 'Bookmark 3', url: 'https://example.com/3' },
              { id: 'subsub', title: 'Sub Sub Folder', children: [] },
            ],
          },
        ],
      },
      { id: 'bm4', title: 'Bookmark 4', url: 'https://example.com/4' },
      { id: 'folder2', title: 'Folder 2', children: [] },
    ];

    const result = flattenBookmarks(bookmarks);

    expect(result).toEqual([
      { title: 'Bookmark 1', url: 'https://example.com/1' },
      { title: 'Bookmark 2', url: 'https://example.com/2' },
      { title: 'Bookmark 3', url: 'https://example.com/3' },
      { title: 'Bookmark 4', url: 'https://example.com/4' },
    ]);
  });

  it('should handle folders with undefined children', () => {
    const bookmarks: BookmarkInfo[] = [
      { id: 'folder1', title: 'Folder 1', children: undefined },
      { id: 'bm1', title: 'Bookmark 1', url: 'https://example.com/1' },
    ];

    const result = flattenBookmarks(bookmarks);

    expect(result).toEqual([
      { title: 'Bookmark 1', url: 'https://example.com/1' },
    ]);
  });

  it('should only include title and url in flattened result', () => {
    const bookmarks: BookmarkInfo[] = [
      {
        title: 'Bookmark 1',
        url: 'https://example.com/1',
        id: '123',
        parentId: 'root',
        dateAdded: 1234567890,
      },
    ];

    const result = flattenBookmarks(bookmarks);

    expect(result).toEqual([
      { title: 'Bookmark 1', url: 'https://example.com/1' },
    ]);
    expect(result[0]).not.toHaveProperty('parentId');
    expect(result[0]).not.toHaveProperty('dateAdded');
  });
});
