import { describe, it, expect } from 'vitest';
import {
  getBookmarkCount,
  formatBookmarks,
  flattenBookmarks,
  generateStableId,
  normalizeBookmarkIds,
  buildChildPath,
  duplicateIndexOf,
  legacyBookmarkId,
  filterTombstonedNodes,
} from './bookmarkUtils';
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

// ============== P0-1: 稳定 ID 方案（书签 ID 掺入父路径） ==============

describe('P0-1: generateStableId 书签 ID 包含父路径', () => {
  const url = 'https://x.example.com';

  it('相同 URL 在不同父路径下应得到不同的稳定 ID', () => {
    const idInToolbar = generateStableId({ title: 'X', url } as BookmarkInfo, 'root_toolbar');
    const idInOther = generateStableId({ title: 'X', url } as BookmarkInfo, 'root_unfiled');

    expect(idInToolbar).not.toBe(idInOther);
  });

  it('相同 URL 且相同父路径应得到相同的稳定 ID', () => {
    const a = generateStableId({ title: 'X', url } as BookmarkInfo, 'root_toolbar/Work');
    const b = generateStableId({ title: 'X（改名后）', url } as BookmarkInfo, 'root_toolbar/Work');

    // 书签改名不影响 ID（与旧行为一致：ID 由 URL + 位置决定）
    expect(a).toBe(b);
  });

  it('无父路径的顶层书签保持纯 URL ID（兼容旧墓碑格式）', () => {
    const id = generateStableId({ title: 'A', url: 'https://a.example.com' } as BookmarkInfo);

    expect(id).toBe(generateStableId({ title: 'A', url: 'https://a.example.com' } as BookmarkInfo, ''));
    expect(id).toMatch(/^bm_/);
  });

  it('文件夹 ID 行为不变（标题 + 父路径）', () => {
    const a = generateStableId({ title: 'Work' } as BookmarkInfo, 'root_toolbar');
    const b = generateStableId({ title: 'Work' } as BookmarkInfo, 'root_unfiled');

    expect(a).not.toBe(b);
    expect(a).toMatch(/^folder_/);
  });
});

describe('P0-1: buildChildPath 顶层子树使用类型化根 ID', () => {
  it('根文件夹的子节点路径前缀应为类型化根 ID（跨语言稳定）', () => {
    expect(buildChildPath('', '书签栏')).toBe('root_toolbar');
    expect(buildChildPath('', 'Bookmarks Bar')).toBe('root_toolbar');
    expect(buildChildPath('', '其他书签')).toBe('root_unfiled');
  });

  it('非顶层节点应拼接父路径与标题', () => {
    expect(buildChildPath('root_toolbar', 'Work')).toBe('root_toolbar/Work');
  });

  it('未识别的顶层标题应回退为标题本身', () => {
    expect(buildChildPath('', '自定义文件夹')).toBe('自定义文件夹');
  });
});

describe('P0-1: normalizeBookmarkIds 重复 URL 书签 ID 唯一性', () => {
  function collectIds(nodes: BookmarkInfo[]): string[] {
    const ids: string[] = [];
    for (const node of nodes) {
      if (node.id) ids.push(node.id);
      if (node.children) ids.push(...collectIds(node.children));
    }
    return ids;
  }

  it('同一 URL 在两个根文件夹下的两份书签应得到不同的 ID', () => {
    const tree = [
      { title: '书签栏', children: [{ title: 'X', url: 'https://x.example.com' }] },
      { title: '其他书签', children: [{ title: 'X', url: 'https://x.example.com' }] },
    ] as BookmarkInfo[];

    const result = normalizeBookmarkIds(structuredClone(tree));
    const ids = collectIds(result);

    // 2 个根文件夹 + 2 份书签 = 4 个 ID，且互不相同
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('中文与英文浏览器的同一书签应得到相同的 ID（跨语言一致）', () => {
    const zhTree = [{ title: '书签栏', children: [{ title: 'X', url: 'https://x.example.com' }] }] as BookmarkInfo[];
    const enTree = [{ title: 'Bookmarks Bar', children: [{ title: 'X', url: 'https://x.example.com' }] }] as BookmarkInfo[];

    const zhId = collectIds(normalizeBookmarkIds(structuredClone(zhTree)))[1];
    const enId = collectIds(normalizeBookmarkIds(structuredClone(enTree)))[1];

    expect(zhId).toBe(enId);
  });

  it('中文与英文浏览器的一级文件夹应得到相同的 ID（跨语言一致）', () => {
    const zhTree = [{ title: '书签栏', children: [{ title: 'Work', children: [] }] }] as BookmarkInfo[];
    const enTree = [{ title: 'Bookmarks Bar', children: [{ title: 'Work', children: [] }] }] as BookmarkInfo[];

    const zhId = collectIds(normalizeBookmarkIds(structuredClone(zhTree)))[1];
    const enId = collectIds(normalizeBookmarkIds(structuredClone(enTree)))[1];

    expect(zhId).toBe(enId);
  });
});

// ============== P0-1 追加：同级重复项序号化 ID ==============

describe('P0-1: generateStableId 同级重复序号', () => {
  const url = 'https://x.example.com';

  it('duplicateIndex=0（默认）时 ID 与无序号版本相同', () => {
    const a = generateStableId({ title: 'X', url } as BookmarkInfo, 'root_toolbar');
    const b = generateStableId({ title: 'X', url } as BookmarkInfo, 'root_toolbar', 0);

    expect(a).toBe(b);
  });

  it('同一文件夹内重复 URL 的第 2、3 份应得到不同且确定的 ID', () => {
    const d0 = generateStableId({ title: 'X', url } as BookmarkInfo, 'root_toolbar', 0);
    const d1a = generateStableId({ title: 'X', url } as BookmarkInfo, 'root_toolbar', 1);
    const d1b = generateStableId({ title: 'X', url } as BookmarkInfo, 'root_toolbar', 1);
    const d2 = generateStableId({ title: 'X', url } as BookmarkInfo, 'root_toolbar', 2);

    expect(d1a).toBe(d1b);
    expect(d0).not.toBe(d1a);
    expect(d1a).not.toBe(d2);
  });
});

describe('P0-1: duplicateIndexOf 同级序号计算', () => {
  const urlX = 'https://x.example.com';
  const urlY = 'https://y.example.com';

  it('统计 index 之前的同 URL 兄弟数量', () => {
    const siblings = [
      { title: 'X', url: urlX },
      { title: 'Y', url: urlY },
      { title: 'X2', url: urlX },
    ] as BookmarkInfo[];

    expect(duplicateIndexOf(siblings, 0, siblings[0])).toBe(0);
    expect(duplicateIndexOf(siblings, 2, siblings[2])).toBe(1);
  });

  it('删除场景：目标不在数组中时按 removeInfo.index 反查仍正确', () => {
    // 原树 [X, Y, X]，删除 index=2 的 X 后数组为 [X, Y]
    const afterRemoval = [
      { title: 'X', url: urlX },
      { title: 'Y', url: urlY },
    ] as BookmarkInfo[];

    expect(duplicateIndexOf(afterRemoval, 2, { title: 'X2', url: urlX } as BookmarkInfo)).toBe(1);
    // 删除 index=0 的 X（第一个）后数组为 [Y, X]，index=0 → 序号 0
    expect(duplicateIndexOf(afterRemoval, 0, { title: 'X', url: urlX } as BookmarkInfo)).toBe(0);
  });

  it('文件夹按同名统计，且书签与文件夹互不干扰', () => {
    const siblings = [
      { title: 'Work', children: [] },
      { title: 'Work', url: urlX },
      { title: 'Work', children: [] },
    ] as BookmarkInfo[];

    expect(duplicateIndexOf(siblings, 2, siblings[2])).toBe(1);
    expect(duplicateIndexOf(siblings, 1, siblings[1])).toBe(0);
  });
});

describe('P0-1: normalizeBookmarkIds 同文件夹重复项', () => {
  function collectIds(nodes: BookmarkInfo[]): string[] {
    const ids: string[] = [];
    for (const node of nodes) {
      if (node.id) ids.push(node.id);
      if (node.children) ids.push(...collectIds(node.children));
    }
    return ids;
  }

  it('同一文件夹内的重复 URL 书签应得到不同的 ID', () => {
    const tree = [
      { title: '书签栏', children: [
        { title: 'X', url: 'https://x.example.com' },
        { title: 'X 副本', url: 'https://x.example.com' },
      ] },
    ] as BookmarkInfo[];

    const ids = collectIds(normalizeBookmarkIds(structuredClone(tree)));
    const bookmarkIds = ids.filter(id => id.startsWith('bm_'));

    expect(bookmarkIds).toHaveLength(2);
    expect(new Set(bookmarkIds).size).toBe(2);
  });

  it('序号 ID 应可复现（多次标准化结果一致）', () => {
    const tree = [
      { title: '书签栏', children: [
        { title: 'X', url: 'https://x.example.com' },
        { title: 'X 副本', url: 'https://x.example.com' },
      ] },
    ] as BookmarkInfo[];

    const first = collectIds(normalizeBookmarkIds(structuredClone(tree)));
    const second = collectIds(normalizeBookmarkIds(structuredClone(tree)));

    expect(first).toEqual(second);
  });

  it('同一文件夹内的同名文件夹应得到不同的 ID', () => {
    const tree = [
      { title: '书签栏', children: [
        { title: 'Work', children: [{ title: 'A', url: 'https://a.example.com' }] },
        { title: 'Work', children: [{ title: 'B', url: 'https://b.example.com' }] },
      ] },
    ] as BookmarkInfo[];

    const ids = collectIds(normalizeBookmarkIds(structuredClone(tree)));
    const folderIds = ids.filter(id => id.startsWith('folder_'));

    expect(folderIds).toHaveLength(2);
    expect(new Set(folderIds).size).toBe(2);
  });
});

describe('P0-1: filterTombstonedNodes 旧版墓碑过渡匹配', () => {
  const urlX = 'https://x.example.com';

  it('旧版纯 URL 墓碑应按旧语义过滤同 URL 书签（任意路径/序号）', () => {
    const tree = [
      { id: 'bm_new_a', title: 'X', url: urlX, children: [] },
      { id: 'bm_new_b', title: 'X 副本', url: urlX, children: [] },
      { id: 'bm_other', title: 'Y', url: 'https://y.example.com', children: [] },
    ] as BookmarkInfo[];
    const tombstoneIds = new Set([legacyBookmarkId(urlX)]);

    const filtered = filterTombstonedNodes(tree, tombstoneIds);

    // 两份同 URL 副本都被过滤（旧版语义），不同 URL 不受影响
    expect(filtered.map(n => n.id)).toEqual(['bm_other']);
  });

  it('新版 ID 墓碑行为不变（按节点 ID 精确匹配）', () => {
    const tree = [
      { id: 'bm_new_a', title: 'X', url: urlX, children: [] },
      { id: 'bm_new_b', title: 'X 副本', url: urlX, children: [] },
    ] as BookmarkInfo[];
    const tombstoneIds = new Set(['bm_new_a']);

    const filtered = filterTombstonedNodes(tree, tombstoneIds);

    expect(filtered.map(n => n.id)).toEqual(['bm_new_b']);
  });
});
