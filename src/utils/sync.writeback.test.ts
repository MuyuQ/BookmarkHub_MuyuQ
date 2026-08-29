/**
 * P0-2 合并结果写回本地书签树 —— 端到端回归测试
 *
 * 场景：设备 B 首次同步时，远程有本地没有的书签 C。
 * 修复前：C 只进入基线缓存，本地树不变 → 下次同步 C 被误判为"本地删除"，
 *         生成墓碑并把 C 从远程删除（数据丢失）。
 * 修复后：C 被写回本地书签树，基线以真实本地树重建 → 第二次同步无任何变更。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./setting', () => ({
  Setting: {
    build: vi.fn(),
  },
}));

vi.mock('./services', () => ({
  default: {
    get: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('./webdav', () => ({
  webdavRead: vi.fn(),
  webdavWrite: vi.fn(),
}));

// ---------- 内存版书签树（模拟浏览器 bookmarks API） ----------
interface MemNode {
  id: string;
  parentId?: string;
  title: string;
  url?: string;
  index?: number;
  dateAdded?: number;
  dateGroupModified?: number;
  children?: MemNode[];
}

type Listener = (id: string, info: unknown) => void;

class MemBookmarkStore {
  root: MemNode;
  private counter = 10;
  onCreated: Listener[] = [];
  onRemoved: Listener[] = [];
  onChanged: Listener[] = [];
  onMoved: Listener[] = [];

  constructor() {
    this.root = {
      id: '0',
      title: '',
      children: [
        { id: '1', parentId: '0', title: '书签栏', index: 0, dateGroupModified: 1000, children: [] },
        { id: '2', parentId: '0', title: '其他书签', index: 1, dateGroupModified: 1000, children: [] },
      ],
    };
  }

  async getTree(): Promise<MemNode[]> {
    // 真实浏览器每次 getTree() 返回独立快照对象；
    // 深拷贝以保持该语义（normalizeBookmarkIds 会就地改写快照的 id）
    return [structuredClone(this.root)];
  }

  async create(details: { parentId?: string; title?: string; url?: string; index?: number }): Promise<MemNode> {
    const parent = this.findById(details.parentId || '0');
    if (!parent || !parent.children) throw new Error(`parentId not found: ${details.parentId}`);
    const node: MemNode = {
      id: String(++this.counter),
      parentId: parent.id,
      title: details.title || '',
      url: details.url,
      index: details.index ?? parent.children.length,
      dateAdded: Date.now(),
      children: details.url ? undefined : [],
    };
    const idx = Math.min(node.index ?? parent.children.length, parent.children.length);
    parent.children.splice(idx, 0, node);
    parent.children.forEach((c, i) => { c.index = i; });
    this.onCreated.forEach(cb => cb(node.id, node));
    return node;
  }

  async removeTree(id: string): Promise<void> {
    const parent = this.findParent(id);
    if (!parent?.children) throw new Error(`node not found: ${id}`);
    const idx = parent.children.findIndex(c => c.id === id);
    const [removed] = parent.children.splice(idx, 1);
    parent.children.forEach((c, i) => { c.index = i; });
    this.onRemoved.forEach(cb => cb(id, { parentId: parent.id, index: idx, node: removed }));
  }

  async update(id: string, changes: { title?: string; url?: string }): Promise<MemNode> {
    const node = this.findById(id);
    if (!node) throw new Error(`node not found: ${id}`);
    if (changes.title !== undefined) node.title = changes.title;
    if (changes.url !== undefined) node.url = changes.url;
    this.onChanged.forEach(cb => cb(id, changes));
    return node;
  }

  async move(id: string, target: { parentId?: string; index?: number }): Promise<MemNode> {
    const node = this.findById(id);
    const oldParent = this.findParent(id);
    if (!node || !oldParent?.children) throw new Error(`node not found: ${id}`);
    const oldIdx = oldParent.children.findIndex(c => c.id === id);
    const [removed] = oldParent.children.splice(oldIdx, 1);
    oldParent.children.forEach((c, i) => { c.index = i; });
    const newParent = target.parentId ? this.findById(target.parentId) : oldParent;
    if (!newParent?.children) throw new Error(`target parent not found: ${target.parentId}`);
    removed.parentId = newParent.id;
    const idx = Math.min(target.index ?? newParent.children.length, newParent.children.length);
    newParent.children.splice(idx, 0, removed);
    newParent.children.forEach((c, i) => { c.index = i; });
    this.onMoved.forEach(cb => cb(id, { parentId: newParent.id, index: removed.index }));
    return node;
  }

  findById(id: string, node: MemNode = this.root): MemNode | null {
    if (node.id === id) return node;
    for (const child of node.children || []) {
      const found = this.findById(id, child);
      if (found) return found;
    }
    return null;
  }

  findParent(id: string, node: MemNode = this.root): MemNode | null {
    for (const child of node.children || []) {
      if (child.id === id) return node;
      const found = this.findParent(id, child);
      if (found) return found;
    }
    return null;
  }
}

// ---------- 内存版 storage.local ----------
const storageMap = new Map<string, unknown>();
const mockStorageLocal = {
  get: vi.fn(async (keys: string | string[]) => {
    const list = Array.isArray(keys) ? keys : [keys];
    const out: Record<string, unknown> = {};
    for (const key of list) {
      if (storageMap.has(key)) out[key] = storageMap.get(key);
    }
    return out;
  }),
  set: vi.fn(async (items: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(items)) storageMap.set(key, value);
  }),
  remove: vi.fn(async (keys: string | string[]) => {
    const list = Array.isArray(keys) ? keys : [keys];
    for (const key of list) storageMap.delete(key);
  }),
};

const mockBookmarks = {
  getTree: vi.fn(),
  create: vi.fn(),
  removeTree: vi.fn(),
  update: vi.fn(),
  move: vi.fn(),
  onCreated: { addListener: vi.fn(), removeListener: vi.fn() },
  onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  onMoved: { addListener: vi.fn(), removeListener: vi.fn() },
  onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
};

const mockBrowser = {
  runtime: {
    sendMessage: vi.fn().mockResolvedValue(undefined),
    onStartup: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  alarms: { create: vi.fn(), clear: vi.fn().mockResolvedValue(true), onAlarm: { addListener: vi.fn() } },
  bookmarks: mockBookmarks,
  storage: { local: mockStorageLocal },
};

// @ts-expect-error test browser stub
globalThis.browser = mockBrowser;

const { Setting } = await import('./setting');
const BookmarkService = (await import('./services')).default;
const { performSync } = await import('./sync');

const githubSetting = {
  conflictMode: 'auto',
  enableAutoSync: true,
  enableNotify: false,
  gistFileName: 'BookmarkHub',
  gistID: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
  githubToken: 'token',
  storageType: 'github',
  syncInterval: 60,
  webdavPassword: '',
  webdavPath: '/bookmarkhub-bookmarks.json',
  webdavUrl: '',
  webdavUsername: '',
} as never;

function makeRemoteContent(extraToolbarChildren: MemNode[]): string {
  return JSON.stringify({
    version: '2.0',
    lastSyncTimestamp: Date.now(),
    sourceBrowser: { browser: 'Firefox', os: 'Linux' },
    backupRecords: [
      {
        backupTimestamp: Date.now(),
        bookmarkCount: extraToolbarChildren.length,
        bookmarkData: [
          { title: '书签栏', children: extraToolbarChildren },
          { title: '其他书签', children: [] },
        ],
      },
    ],
    tombstones: [],
  });
}

describe('P0-2: 合并结果写回本地书签树', () => {
  let store: MemBookmarkStore;

  beforeEach(() => {
    vi.clearAllMocks();
    storageMap.clear();
    store = new MemBookmarkStore();

    mockBookmarks.getTree.mockImplementation(() => store.getTree());
    mockBookmarks.create.mockImplementation(async (details: { parentId?: string; title?: string; url?: string; index?: number }) => store.create(details));
    mockBookmarks.removeTree.mockImplementation(async (id: string) => store.removeTree(id));
    mockBookmarks.update.mockImplementation(async (id: string, changes: { title?: string; url?: string }) => store.update(id, changes));
    mockBookmarks.move.mockImplementation(async (id: string, target: { parentId?: string; index?: number }) => store.move(id, target));

    vi.mocked(Setting.build).mockResolvedValue(githubSetting);
  });

  it('远程新书签应写回本地书签树（首次同步联合合并）', async () => {
    // 本地：书签栏有 A；远程：书签栏有 C
    store.root.children![0].children = [
      { id: '10', parentId: '1', title: 'A', url: 'https://a.example.com', index: 0, dateAdded: 1000 },
    ];
    const remoteContent = makeRemoteContent([
      { id: '30', title: 'C', url: 'https://c.example.com', index: 0, dateAdded: 2000 },
    ]);
    vi.mocked(BookmarkService.get).mockResolvedValue(remoteContent);
    let uploadedContent = '';
    vi.mocked(BookmarkService.update).mockImplementation(async (payload: { files: Record<string, { content: string }> }) => {
      uploadedContent = Object.values(payload.files)[0].content;
      return {} as never;
    });

    const result = await performSync();

    expect(result.status).toBe('success');

    // 断言 1: 远程新书签 C 已写回本地书签树
    const toolbar = store.root.children![0];
    expect(toolbar.children!.map(c => c.url)).toContain('https://c.example.com');

    // 断言 2: 上传内容包含写回后的真实本地树（A 与 C 都在）
    const uploaded = JSON.parse(uploadedContent);
    const uploadedUrls = JSON.stringify(uploaded.backupRecords[0].bookmarkData);
    expect(uploadedUrls).toContain('https://a.example.com');
    expect(uploadedUrls).toContain('https://c.example.com');

    // 断言 3: 本地基线缓存 = 真实本地树（也包含 C）
    const baseline = storageMap.get('bookmarkHubCache') as { backupRecords: Array<{ bookmarkData: MemNode[] }> };
    const baselineStr = JSON.stringify(baseline.backupRecords[0].bookmarkData);
    expect(baselineStr).toContain('https://c.example.com');
    expect(baselineStr).not.toContain('"folder_0"'); // 不再包含合成根包裹

    // 断言 4: 没有生成墓碑（C 是新增，不是删除）
    const cache = storageMap.get('bookmarkHubCache') as { tombstones: unknown[] };
    expect(cache.tombstones).toHaveLength(0);
  });

  it('第二次同步不应产生任何虚假变更或墓碑（P0-2 回归核心断言）', async () => {
    store.root.children![0].children = [
      { id: '10', parentId: '1', title: 'A', url: 'https://a.example.com', index: 0, dateAdded: 1000 },
    ];
    const remoteContent = makeRemoteContent([
      { id: '30', title: 'C', url: 'https://c.example.com', index: 0, dateAdded: 2000 },
    ]);
    vi.mocked(BookmarkService.get).mockResolvedValue(remoteContent);
    let uploadedContent = '';
    vi.mocked(BookmarkService.update).mockImplementation(async (payload: { files: Record<string, { content: string }> }) => {
      uploadedContent = Object.values(payload.files)[0].content;
      return {} as never;
    });

    // 第一次同步：C 写回本地
    const first = await performSync();
    expect(first.status).toBe('success');
    expect(vi.mocked(BookmarkService.update)).toHaveBeenCalledTimes(1);

    // 第二次同步：远程 = 上一次上传的内容，本地 = 写回后的真实树，基线一致
    vi.mocked(BookmarkService.get).mockResolvedValue(uploadedContent);
    vi.mocked(BookmarkService.update).mockClear();

    const second = await performSync();

    expect(second.status).toBe('success');
    // 核心断言：无变更 → 不再上传，也不把 C 误判为本地删除
    expect(vi.mocked(BookmarkService.update)).not.toHaveBeenCalled();

    const cache = storageMap.get('bookmarkHubCache') as { tombstones: unknown[] };
    expect(cache.tombstones).toHaveLength(0);

    // 本地书签树完好：A 与 C 都还在
    const urls = store.root.children![0].children!.map(c => c.url);
    expect(urls).toContain('https://a.example.com');
    expect(urls).toContain('https://c.example.com');
  });

  it('本地删除的书签（有墓碑）在下次同步时不应复活', async () => {
    // 初始：本地与远程都有 A，先做一次同步建立基线
    store.root.children![0].children = [
      { id: '10', parentId: '1', title: 'A', url: 'https://a.example.com', index: 0, dateAdded: 1000 },
    ];
    const remoteContent = makeRemoteContent([
      { id: '30', title: 'A', url: 'https://a.example.com', index: 0, dateAdded: 1000 },
    ]);
    vi.mocked(BookmarkService.get).mockResolvedValue(remoteContent);
    let uploadedContent = remoteContent;
    vi.mocked(BookmarkService.update).mockImplementation(async (payload: { files: Record<string, { content: string }> }) => {
      uploadedContent = Object.values(payload.files)[0].content;
      return {} as never;
    });

    await performSync();

    // 用户在本地删除 A（模拟 background 的删除事件流程：写墓碑到缓存）
    const { generateStableId } = await import('./bookmarkUtils');
    const stableId = generateStableId({ title: 'A', url: 'https://a.example.com' } as never);
    await store.removeTree('10');

    const cache = storageMap.get('bookmarkHubCache') as { tombstones: Array<{ id: string; deletedAt: number; deletedBy: string }>; backupRecords: unknown[] };
    cache.tombstones.push({ id: stableId, deletedAt: Date.now(), deletedBy: 'test-device' });

    // 下一次同步：本地没有 A，远程有 A → 应保持删除（不上传 A）
    vi.mocked(BookmarkService.get).mockResolvedValue(uploadedContent);
    vi.mocked(BookmarkService.update).mockClear();

    const result = await performSync();
    expect(result.status).toBe('success');

    // A 未复活：本地树和上传内容中都没有 A
    expect(store.root.children![0].children!.map(c => c.url)).not.toContain('https://a.example.com');
    const cacheAfter = storageMap.get('bookmarkHubCache') as { tombstones: Array<{ id: string }> };
    expect(cacheAfter.tombstones.some(t => t.id === stableId)).toBe(true);
  });
});
