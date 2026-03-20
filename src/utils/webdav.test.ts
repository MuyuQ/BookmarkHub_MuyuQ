import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebDAVClient, getWebDAVClient, webdavRead, webdavWrite, testWebDAVConnection } from './webdav';

// Mock Setting module
vi.mock('./setting', () => ({
  Setting: {
    build: vi.fn(),
  },
}));

// Mock retry module - this needs to be at the top level
vi.mock('./retry', async () => {
  const actual = await vi.importActual('./retry');
  return {
    ...(actual as object),
    retryOperation: vi.fn((fn) => fn()),
  };
});

// Mock logger
vi.mock('./logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
  },
}));

const { Setting } = await import('./setting');

function createMockSetting(overrides: Partial<{
  storageType: 'github' | 'webdav';
  webdavUrl: string;
  webdavUsername: string;
  webdavPassword: string;
  webdavPath: string;
}> = {}): any {
  return {
    storageType: 'webdav',
    webdavUrl: 'https://example.com/dav',
    webdavUsername: 'testuser',
    webdavPassword: 'testpass',
    webdavPath: '/bookmarks.json',
    ...overrides,
  };
}

describe('WebDAVClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Unicode authentication', () => {
    it('should handle Unicode characters in username and password', async () => {
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue('test content'),
      };

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      // 使用中文用户名和密码测试 Unicode 支持
      const client = new WebDAVClient(
        'https://example.com/dav',
        '用户名',
        '密码123'
      );

      await client.read('/file.txt');

      // 验证请求被正确发送（如果 Unicode 编码有问题会抛出异常）
      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/dav/file.txt',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': expect.stringContaining('Basic '),
          }),
        })
      );
    });
  });

  describe('read', () => {
    it('should succeed with valid response', async () => {
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue('test content'),
      };

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const client = new WebDAVClient(
        'https://example.com/dav',
        'user',
        'pass'
      );

      const result = await client.read('/file.txt');

      expect(result).toBe('test content');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/dav/file.txt',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': expect.stringContaining('Basic '),
          }),
        })
      );
    });

    it('should return null on failure', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
      };

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const client = new WebDAVClient(
        'https://example.com/dav',
        'user',
        'pass'
      );

      const result = await client.read('/nonexistent.txt');

      expect(result).toBeNull();
    });

    it('should return null on network error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const client = new WebDAVClient(
        'https://example.com/dav',
        'user',
        'pass'
      );

      const result = await client.read('/file.txt');

      expect(result).toBeNull();
    });
  });

  describe('write', () => {
    it('should succeed with valid response', async () => {
      const mockResponse = {
        ok: true,
      };

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const client = new WebDAVClient(
        'https://example.com/dav',
        'user',
        'pass'
      );

      const result = await client.write('/file.txt', 'content');

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/dav/file.txt',
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            'Authorization': expect.stringContaining('Basic '),
            'Content-Type': 'application/json',
          }),
          body: 'content',
        })
      );
    });

    it('should use custom content type when provided', async () => {
      const mockResponse = {
        ok: true,
      };

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const client = new WebDAVClient(
        'https://example.com/dav',
        'user',
        'pass',
        'text/plain'
      );

      const result = await client.write('/file.txt', 'content', 'application/xml');

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/dav/file.txt',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/xml',
          }),
        })
      );
    });

    it('should return false on failure', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
      };

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const client = new WebDAVClient(
        'https://example.com/dav',
        'user',
        'pass'
      );

      const result = await client.write('/file.txt', 'content');

      expect(result).toBe(false);
    });

    it('should return false on network error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const client = new WebDAVClient(
        'https://example.com/dav',
        'user',
        'pass'
      );

      const result = await client.write('/file.txt', 'content');

      expect(result).toBe(false);
    });
  });

  describe('exists', () => {
    it('should return true when file exists', async () => {
      const mockResponse = {
        ok: true,
      };

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const client = new WebDAVClient(
        'https://example.com/dav',
        'user',
        'pass'
      );

      const result = await client.exists('/file.txt');

      expect(result).toBe(true);
    });

    it('should return false when file does not exist', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
      };

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const client = new WebDAVClient(
        'https://example.com/dav',
        'user',
        'pass'
      );

      const result = await client.exists('/nonexistent.txt');

      expect(result).toBe(false);
    });

    it('should return false on network error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const client = new WebDAVClient(
        'https://example.com/dav',
        'user',
        'pass'
      );

      const result = await client.exists('/file.txt');

      expect(result).toBe(false);
    });
  });

  describe('remove', () => {
    it('should succeed with valid response', async () => {
      const mockResponse = {
        ok: true,
      };

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const client = new WebDAVClient(
        'https://example.com/dav',
        'user',
        'pass'
      );

      const result = await client.remove('/file.txt');

      expect(result).toBe(true);
    });

    it('should succeed with 404 (idempotent)', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
      };

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const client = new WebDAVClient(
        'https://example.com/dav',
        'user',
        'pass'
      );

      const result = await client.remove('/nonexistent.txt');

      expect(result).toBe(true);
    });

    it('should return false on failure', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
      };

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const client = new WebDAVClient(
        'https://example.com/dav',
        'user',
        'pass'
      );

      const result = await client.remove('/file.txt');

      expect(result).toBe(false);
    });
  });
});

describe('getWebDAVClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return null when storage type is not webdav', async () => {
    vi.mocked(Setting.build).mockResolvedValue(createMockSetting({ storageType: 'github' }));

    const result = await getWebDAVClient();

    expect(result).toBeNull();
  });

  it('should return null when WebDAV config is incomplete', async () => {
    vi.mocked(Setting.build).mockResolvedValue(createMockSetting({ webdavUrl: '' }));

    const result = await getWebDAVClient();

    expect(result).toBeNull();
  });

  it('should return client when config is complete', async () => {
    vi.mocked(Setting.build).mockResolvedValue(createMockSetting());

    const result = await getWebDAVClient();

    expect(result).toBeInstanceOf(WebDAVClient);
  });
});

describe('webdavRead', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return null when client is not available', async () => {
    vi.mocked(Setting.build).mockResolvedValue(createMockSetting({ storageType: 'github' }));

    const result = await webdavRead();

    expect(result).toBeNull();
  });

  it('should return null when getWebDAVClient returns null', async () => {
    vi.mocked(Setting.build).mockResolvedValue(createMockSetting({ webdavUrl: '' }));

    const result = await webdavRead();

    expect(result).toBeNull();
  });
});

describe('webdavWrite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return false when client is not available', async () => {
    vi.mocked(Setting.build).mockResolvedValue(createMockSetting({ storageType: 'github' }));

    const result = await webdavWrite('content');

    expect(result).toBe(false);
  });

  it('should return false when getWebDAVClient returns null', async () => {
    vi.mocked(Setting.build).mockResolvedValue(createMockSetting({ webdavUrl: '' }));

    const result = await webdavWrite('content');

    expect(result).toBe(false);
  });
});

describe('testWebDAVConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should succeed with full read-write-delete cycle', async () => {
    const testPath = '/.bookmarkhub-test-1234567890';
    
    const mockWriteResponse = { ok: true };
    const mockReadResponse = { ok: true, text: vi.fn().mockResolvedValue('test') };
    const mockDeleteResponse = { ok: true };
    
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(mockWriteResponse); // PUT
      } else if (callCount === 2) {
        return Promise.resolve(mockReadResponse); // GET
      } else {
        return Promise.resolve(mockDeleteResponse); // DELETE
      }
    });

    const result = await testWebDAVConnection('https://example.com/dav', 'user', 'pass');

    expect(result.success).toBe(true);
    expect(result.message).toBe('Connection successful');
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('should fail when write fails', async () => {
    const mockWriteResponse = { ok: false, status: 500 };
    
    global.fetch = vi.fn().mockResolvedValue(mockWriteResponse);

    const result = await testWebDAVConnection('https://example.com/dav', 'user', 'pass');

    expect(result.success).toBe(false);
    expect(result.message).toBe('Failed to write test file');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('should fail when read fails', async () => {
    const mockWriteResponse = { ok: true };
    const mockReadResponse = { ok: true, text: vi.fn().mockResolvedValue('wrong content') };
    
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(mockWriteResponse); // PUT
      } else {
        return Promise.resolve(mockReadResponse); // GET
      }
    });

    const result = await testWebDAVConnection('https://example.com/dav', 'user', 'pass');

    expect(result.success).toBe(false);
    expect(result.message).toBe('Failed to read test file');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('should fail when delete fails', async () => {
    const mockWriteResponse = { ok: true };
    const mockReadResponse = { ok: true, text: vi.fn().mockResolvedValue('test') };
    const mockDeleteResponse = { ok: false, status: 500 };
    
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(mockWriteResponse); // PUT
      } else if (callCount === 2) {
        return Promise.resolve(mockReadResponse); // GET
      } else {
        return Promise.resolve(mockDeleteResponse); // DELETE
      }
    });

    const result = await testWebDAVConnection('https://example.com/dav', 'user', 'pass');

    expect(result.success).toBe(false);
    expect(result.message).toBe('Failed to delete test file');
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('should fail with error message on exception', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

    const result = await testWebDAVConnection('https://example.com/dav', 'user', 'pass');

    expect(result.success).toBe(false);
    expect(result.message).toBe('Failed to write test file');
  });
});
