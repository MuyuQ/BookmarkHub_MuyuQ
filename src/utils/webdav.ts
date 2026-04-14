/**
 * BookmarkHub WebDAV 客户端模块
 * 
 * 提供 WebDAV 协议的读写操作
 * 用于将书签数据存储到用户自己的 WebDAV 服务器
 * 支持: Nextcloud, OwnCloud, NAS 等支持 WebDAV 的服务
 */

import { Setting } from './setting';
import { retryOperation } from './retry';
import { logger } from './logger';

/**
 * 危险路径模式 - 用于检测路径遍历攻击
 * 包括: .. (目录遍历), // (双斜杠), \ (反斜杠), \0 和 \u0000 (空字节)
 */
const FORBIDDEN_PATH_PATTERNS = /\.\.|\/\/|\\|\0|\u0000/g;

/**
 * 清理和验证 WebDAV 路径
 * 防止路径遍历攻击 (如 ../../../etc/passwd)
 * 
 * @param path - 原始路径
 * @returns 清理后的安全路径
 */
function sanitizePath(path: string): string {
    if (!path || typeof path !== 'string') {
        return '/';
    }

    // 循环解码 URL 编码直到稳定（防止双编码绕过如 %252e%252e）
    let sanitized = path;
    let prev = '';
    while (sanitized !== prev) {
        prev = sanitized;
        try {
            sanitized = decodeURIComponent(sanitized);
        } catch {
            break;
        }
    }

    // 移除危险的路径模式
    sanitized = sanitized.replace(FORBIDDEN_PATH_PATTERNS, '');
    
    // 确保以 / 开头
    if (!sanitized.startsWith('/')) {
        sanitized = '/' + sanitized;
    }

    // 规范化多个连续斜杠
    sanitized = sanitized.replace(/\/+/g, '/');
    
    return sanitized;
}


/**
 * WebDAV 客户端类
 * 封装 WebDAV 协议的基本操作
 * 
 * 支持的操作:
 * - 读取文件 (read)
 * - 写入文件 (write)
 * - 检查文件是否存在 (exists)
 * 
 * 使用 Basic Auth 进行身份验证
 */
export class WebDAVClient {
    /** WebDAV 服务器基础 URL */
    private baseUrl: string;
    /** 缓存的认证头（密码不存储在内存中） */
    private authHeader: string;
    /** 默认 Content-Type */
    private contentType: string;

    /**
     * 构造函数
     * 
     * @param baseUrl - WebDAV 服务器地址 (如：https://your-nas.com/remote.php/dav/files/username/)
     * @param username - 用户名
     * @param password - 密码
     * @param contentType - 可选的 Content-Type，默认 'application/json'
     */
    constructor(baseUrl: string, username: string, password: string, contentType: string = 'application/json') {
        // 验证 URL 格式
        if (!baseUrl || typeof baseUrl !== 'string') {
            throw new Error('WebDAV URL is required and must be a string');
        }

        // 检查 URL 协议
        if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
            throw new Error('WebDAV URL must start with http:// or https://');
        }

        // 验证用户名
        if (!username || typeof username !== 'string' || username.trim() === '') {
            throw new Error('WebDAV username is required and must be non-empty');
        }

        // 验证密码
        if (password === undefined || password === null || typeof password !== 'string') {
            throw new Error('WebDAV password is required and must be a string');
        }

        // 移除末尾的斜杠
        this.baseUrl = baseUrl.replace(/\/$/, '');
        // 立即生成认证头，不存储密码（安全考虑）
        this.authHeader = this.createAuthHeader(username, password);
        this.contentType = contentType;
    }

    /**
     * 创建 Basic Auth 认证头
     * 使用 UTF-8 编码支持 Unicode 字符（如中文用户名/密码）
     *
     * @param username - 用户名
     * @param password - 密码
     * @returns Basic Auth 认证字符串
     */
    private createAuthHeader(username: string, password: string): string {
        const credentials = `${username}:${password}`;
        const encoder = new TextEncoder();
        const encoded = encoder.encode(credentials);
        const utf8Credentials = Array.from(encoded, byte => String.fromCharCode(byte)).join('');
        return `Basic ${btoa(utf8Credentials)}`;
    }

    /**
     * 生成 Basic Auth 认证头
     * 返回缓存的认证头
     * 
     * @returns Basic Auth 认证字符串
     */
    private getAuthHeader(): string {
        return this.authHeader;
    }

    /**
     * 读取文件
     * 使用 WebDAV GET 方法读取文件内容
     * 支持自动重试
     * 
     * @param path - 文件路径
     * @returns Promise<string | null> 文件内容，失败返回 null
     */
    async read(path: string): Promise<string | null> {
        try {
            return await retryOperation(async () => {
                const response = await fetch(`${this.baseUrl}${sanitizePath(path)}`, {
                    method: 'GET',
                    headers: {
                        'Authorization': this.getAuthHeader()
                    }
                });

                if (!response.ok) {
                    throw new Error(`WebDAV read failed: ${response.status}`);
                }

                return await response.text();
            }, { maxRetries: 3, logRetries: true });
        } catch (error) {
            logger.error('WebDAV read error', error);
            return null;
        }
    }

    /**
     * 写入文件
     * 使用 WebDAV PUT 方法创建或更新文件
     * 支持自动重试
     * 
     * @param path - 文件路径
     * @param content - 文件内容
     * @param contentType - 可选的 Content-Type，覆盖构造函数中的默认值
     * @returns Promise<boolean> 是否成功
     */
    async write(path: string, content: string, contentType?: string): Promise<boolean> {
        try {
            return await retryOperation(async () => {
                const response = await fetch(`${this.baseUrl}${sanitizePath(path)}`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': this.getAuthHeader(),
                        'Content-Type': contentType ?? this.contentType
                    },
                    body: content
                });

                if (!response.ok) {
                    throw new Error(`WebDAV write failed: ${response.status}`);
                }

                return true;
            }, { maxRetries: 3, logRetries: true });
        } catch (error) {
            logger.error('WebDAV write error', error);
            return false;
        }
    }

    /**
     * 检查文件是否存在
     * 使用 WebDAV HEAD 方法检查文件
     * 
     * @param path - 文件路径
     * @returns Promise<boolean> 是否存在
     */
    async exists(path: string): Promise<boolean> {
        try {
            // 发送 HEAD 请求
            const response = await fetch(`${this.baseUrl}${sanitizePath(path)}`, {
                method: 'HEAD',
                headers: {
                    'Authorization': this.getAuthHeader()
                }
            });

            return response.ok;
        } catch {
            return false;
        }
    }

    /**
     * 清除凭证信息
     * 在操作完成后调用此方法可以立即清除内存中的认证信息
     * 安全最佳实践：减少敏感数据在内存中的留存时间
     * 
     * @returns void
     */
    public clearCredentials(): void {
        this.authHeader = '';
    }

    /**
     * 删除文件
     * 使用 WebDAV DELETE 方法删除文件
     * 支持自动重试
     * 
     * @param path - 文件路径
     * @returns Promise<boolean> 是否成功
     */
    async remove(path: string): Promise<boolean> {
        try {
            return await retryOperation(async () => {
                const response = await fetch(`${this.baseUrl}${sanitizePath(path)}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': this.getAuthHeader()
                    }
                });

                // 204 No Content 表示删除成功
                // 404 表示文件不存在，也视为成功 (幂等性)
                return response.ok || response.status === 404;
            }, { maxRetries: 3, logRetries: true });
        } catch (error) {
            logger.error('WebDAV delete error', error);
            return false;
        }
    }
}

/**
 * 获取 WebDAV 客户端实例
 * 从设置中读取 WebDAV 配置并创建客户端
 * 
 * @returns Promise<WebDAVClient | null> 客户端实例，如果未配置返回 null
 */
export async function getWebDAVClient(): Promise<WebDAVClient | null> {
    // 获取设置
    const setting = await Setting.build();

    // 检查是否选择了 WebDAV 存储类型
    if (setting.storageType !== 'webdav') {
        return null;
    }

    // 检查 WebDAV 配置是否完整
    if (!setting.webdavUrl || !setting.webdavUsername || !setting.webdavPassword) {
        return null;
    }

    // 创建并返回客户端实例
    return new WebDAVClient(
        setting.webdavUrl,
        setting.webdavUsername,
        setting.webdavPassword
    );
}

/**
 * 从 WebDAV 读取书签数据
 * 
 * @param path - 可选的自定义路径，默认使用设置中的路径
 * @returns Promise<string | null> 书签数据的 JSON 字符串
 */
export async function webdavRead(path?: string): Promise<string | null> {
    // 获取客户端
    const client = await getWebDAVClient();
    if (!client) return null;

    try {
        // 获取设置中的默认路径
        const setting = await Setting.build();
        return await client.read(sanitizePath(path || setting.webdavPath));
    } finally {
        // 操作完成后立即清除凭证，减少内存中的敏感数据留存时间
        client.clearCredentials();
    }
}

/**
 * 向 WebDAV 写入书签数据
 * 
 * @param content - 要写入的内容 (JSON 字符串)
 * @param path - 可选的自定义路径，默认使用设置中的路径
 * @returns Promise<boolean> 是否成功
 */
export async function webdavWrite(content: string, path?: string): Promise<boolean> {
    // 获取客户端
    const client = await getWebDAVClient();
    if (!client) return false;

    try {
        // 获取设置中的默认路径
        const setting = await Setting.build();
        return await client.write(sanitizePath(path || setting.webdavPath), content);
    } finally {
        // 操作完成后立即清除凭证，减少内存中的敏感数据留存时间
        client.clearCredentials();
    }
}

/**
 * 测试 WebDAV 连接
 * 通过写入和读取测试文件来验证连接是否正常
 * 
 * 使用方法:
 *   const result = await testWebDAVConnection(url, username, password);
 *   if (result.success) {
 *     console.log('连接成功');
 *   } else {
 *     console.log('连接失败:', result.message);
 *   }
 * 
 * @param url - WebDAV 服务器地址
 * @param username - 用户名
 * @param password - 密码
 * @returns Promise<{ success: boolean; message: string }> 测试结果
 */
export async function testWebDAVConnection(
    url: string,
    username: string,
    password: string
): Promise<{ success: boolean; message: string }> {
    // 创建测试客户端
    const client = new WebDAVClient(url, username, password);

    try {
        // 生成唯一的测试文件路径
        const testPath = sanitizePath('/.bookmarkhub-test-' + Date.now());

        // 1. 尝试写入测试文件
        const writeResult = await client.write(testPath, 'test');
        if (!writeResult) {
            return { success: false, message: 'Failed to write test file' };
        }

        // 2. 尝试读取测试文件
        const readResult = await client.read(testPath);
        if (readResult !== 'test') {
            return { success: false, message: 'Failed to read test file' };
        }

        // 3. 删除测试文件
        const deleteResult = await client.remove(testPath);
        if (!deleteResult) {
            return { success: false, message: 'Failed to delete test file' };
        }

        // 4. 返回成功
        return { success: true, message: 'Connection successful' };
    } catch (error: unknown) {
        const err = error as Error;
        return { success: false, message: err.message };
    } finally {
        // 测试完成后立即清除凭证，减少内存中的敏感数据留存时间
        client.clearCredentials();
    }
}
