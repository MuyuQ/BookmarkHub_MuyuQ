import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import BookmarkService, { getBookmarks } from './services';
import type { BookmarkInfo } from './models';

vi.mock('./setting', () => ({
  Setting: {
    build: vi.fn(),
  },
}));

vi.mock('./http', () => ({
  http: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

vi.mock('./retry', () => ({
  retryOperation: vi.fn((fn) => fn()),
}));

vi.mock('./bookmarkUtils', () => ({
  getBookmarkCount: vi.fn(() => 10),
  formatBookmarks: vi.fn((b) => b),
}));

const mockBrowser = {
  bookmarks: {
    getTree: vi.fn(),
  },
};

(globalThis as any).browser = mockBrowser;

const { Setting } = await import('./setting');
const { http } = await import('./http');

function createMockSetting(overrides: Partial<{
    githubToken: string;
    gistID: string;
    gistFileName: string;
    enableNotify: boolean;
    enableAutoSync: boolean;
    enableIntervalSync: boolean;
    enableEventSync: boolean;
    syncInterval: number;
    storageType: 'github' | 'webdav';
    conflictMode: 'auto' | 'prompt';
    webdavUrl: string;
    webdavUsername: string;
    webdavPassword: string;
    maxBackups: number;
    debounceTime: number;
    maxWaitTime: number;
    webdavPath: string;
  }> = {}): any {
  return {
    githubToken: 'test-token',
    // P1-5: Use valid 32-char hex Gist ID format
    gistID: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
    gistFileName: 'BookmarkHub',
    enableNotify: false,
    enableAutoSync: true,
    enableIntervalSync: false,
    enableEventSync: true,
    syncInterval: 60,
    storageType: 'github',
    conflictMode: 'auto',
    webdavUrl: '',
    webdavUsername: '',
    webdavPassword: '',
    maxBackups: 3,
    debounceTime: 5000,
    maxWaitTime: 30000,
    webdavPath: '/bookmarkhub-bookmarks.json',
    ...overrides,
  };
}

describe('BookmarkService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('get()', () => {
    it('should succeed with normal content', async () => {
      const mockContent = JSON.stringify({ bookmarks: [] });
      const mockResponse = {
        files: {
          BookmarkHub: {
            content: mockContent,
            truncated: false,
            raw_url: '',
          },
        },
      };

      vi.mocked(Setting.build).mockResolvedValue(createMockSetting());
      vi.mocked(http.get).mockReturnValue({
        json: vi.fn().mockResolvedValue(mockResponse),
      } as any);

      const result = await BookmarkService.get();

      expect(result).toBe(mockContent);
      expect(http.get).toHaveBeenCalledWith('gists/a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6');
    });

    it('should succeed with truncated content (uses raw_url)', async () => {
      const mockContent = JSON.stringify({ bookmarks: [] });
      const mockRawUrl = 'https://raw.githubusercontent.com/gist/123/bookmarks.json';
      const mockResponse = {
        files: {
          BookmarkHub: {
            content: '',
            truncated: true,
            raw_url: mockRawUrl,
          },
        },
      };

      vi.mocked(Setting.build).mockResolvedValue(createMockSetting());
      vi.mocked(http.get).mockReturnValue({
        json: vi.fn().mockResolvedValue(mockResponse),
      } as any);

      // P1-10: raw_url 改用独立的无凭证 fetch（token 不出域）
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => mockContent,
      });
      vi.stubGlobal('fetch', fetchSpy);

      try {
        const result = await BookmarkService.get();

        expect(result).toBe(mockContent);
        expect(fetchSpy).toHaveBeenCalledWith(mockRawUrl, expect.objectContaining({ signal: expect.anything() }));
        expect(http.get).toHaveBeenCalledTimes(1);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('should reject raw_url from non-whitelisted hosts (P1-10)', async () => {
      const mockResponse = {
        files: {
          BookmarkHub: {
            content: '',
            truncated: true,
            raw_url: 'https://evil.example.com/steal',
          },
        },
      };

      vi.mocked(Setting.build).mockResolvedValue(createMockSetting());
      vi.mocked(http.get).mockReturnValue({
        json: vi.fn().mockResolvedValue(mockResponse),
      } as any);

      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);

      try {
        await expect(BookmarkService.get()).rejects.toThrow('Untrusted gist raw_url host');
        // 不允许向白名单以外的主机发起任何请求
        expect(fetchSpy).not.toHaveBeenCalled();
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('should throw error for invalid gistID format', async () => {
      vi.mocked(Setting.build).mockResolvedValue(createMockSetting({ gistID: '' }));
      vi.mocked(http.get).mockReturnValue({
        json: vi.fn().mockResolvedValue({ files: {} }),
      } as any);

      await expect(BookmarkService.get()).rejects.toThrow('Invalid Gist ID format');
    });

    it('should return null when file not found in gist', async () => {
      const mockResponse = {
        files: {
          OtherFile: {
            content: 'other content',
            truncated: false,
            raw_url: '',
          },
        },
      };

      vi.mocked(Setting.build).mockResolvedValue(createMockSetting());
      vi.mocked(http.get).mockReturnValue({
        json: vi.fn().mockResolvedValue(mockResponse),
      } as any);

      const result = await BookmarkService.get();

      expect(result).toBeNull();
    });

    it('should return null when gist has no files', async () => {
      const mockResponse = {
        files: {},
      };

      vi.mocked(Setting.build).mockResolvedValue(createMockSetting());
      vi.mocked(http.get).mockReturnValue({
        json: vi.fn().mockResolvedValue(mockResponse),
      } as any);

      const result = await BookmarkService.get();

      expect(result).toBeNull();
    });
  });

  describe('update()', () => {
    it('should succeed with valid update', async () => {
      const mockUpdateData = {
        files: {
          BookmarkHub: { content: 'new content' },
        },
      };
      const mockResponse = {
        id: 'test-gist-id',
        files: {},
      };

      vi.mocked(Setting.build).mockResolvedValue(createMockSetting());
      vi.mocked(http.patch).mockReturnValue({
        json: vi.fn().mockResolvedValue(mockResponse),
      } as any);

      const result = await BookmarkService.update(mockUpdateData);

      expect(result).toEqual(mockResponse);
      expect(http.patch).toHaveBeenCalledWith('gists/a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6', {
        json: mockUpdateData,
      });
    });

    it('should throw error for invalid gistID format', async () => {
      vi.mocked(Setting.build).mockResolvedValue(createMockSetting({ gistID: '' }));
      vi.mocked(http.patch).mockReturnValue({
        json: vi.fn().mockResolvedValue({ id: '', files: {} }),
      } as any);

      const mockUpdateData = {
        files: {
          BookmarkHub: { content: 'new content' },
        },
      };

      await expect(BookmarkService.update(mockUpdateData)).rejects.toThrow('Invalid Gist ID format');
    });
  });

  describe('getAllGist()', () => {
    it('should return list of gists', async () => {
      const mockGistList = [
        {
          id: 'gist1',
          description: 'First Gist',
          public: false,
          files: {
            'file1.json': { filename: 'file1.json', raw_url: 'https://...' },
          },
        },
        {
          id: 'gist2',
          description: 'Second Gist',
          public: true,
          files: {},
        },
      ];

      vi.mocked(http.get).mockReturnValue({
        json: vi.fn().mockResolvedValue(mockGistList),
      } as any);

      const result = await BookmarkService.getAllGist();

      expect(result).toEqual(mockGistList);
      expect(http.get).toHaveBeenCalledWith('gists');
    });
  });
});

describe('getBookmarks', () => {
  it('should return bookmark tree from browser API', async () => {
    const mockBookmarks: BookmarkInfo[] = [
      { id: 'bm1', title: 'Bookmark 1', url: 'https://example.com/1' },
      { id: 'bm2', title: 'Bookmark 2', url: 'https://example.com/2' },
    ];

    vi.mocked(mockBrowser.bookmarks.getTree).mockResolvedValue(mockBookmarks);

    const result = await getBookmarks();

    expect(result).toEqual(mockBookmarks);
    expect(mockBrowser.bookmarks.getTree).toHaveBeenCalled();
  });
});
