/**
 * BookmarkHub 加密模块
 * 
 * 使用 Web Crypto API 加密敏感数据
 * 用于保护 GitHub Token 和 WebDAV 密码
 */

import { createError } from './errors';
import { logger } from './logger';

const ENCRYPTION_ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;

/**
 * 从密码派生加密密钥
 * 使用 PBKDF2 算法
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: 600000, // OWASP 2023 recommendation for PBKDF2-SHA256
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: ENCRYPTION_ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * 获取或创建加密密钥密码
 * 
 * 如果提供了 masterPassword，则使用用户密码进行加密（更安全）
 * 否则使用扩展 ID 作为密钥派生的基础，这样做的原因：
 * 1. 唯一性：每个扩展安装有唯一的 ID，确保不同实例的加密密钥不同
 * 2. 持久性：扩展 ID 在扩展生命周期内保持不变（除非重新安装）
 * 3. 隔离性：即使用户在同一浏览器安装多个相同扩展，密钥也会不同
 * 
 * 安全考虑：
 * - 使用扩展 ID 时安全性有限，属于 security via obscurity
 * - 使用 masterPassword 可提供更强的安全保障
 * - 如果用户卸载并重新安装扩展且未设置 masterPassword，将无法解密之前保存的凭证
 * - 不应依赖此加密防止有技术能力的本地攻击者
 * 
 * @param masterPassword - 可选的主密码，如果提供则优先使用
 * @returns 用于派生加密密钥的密码字符串
 */
function getEncryptionPassword(masterPassword?: string): string {
  // 优先使用用户提供的 masterPassword（如果非空）
  if (masterPassword && masterPassword.trim()) {
    return `BookmarkHub-master-${masterPassword}`;
  }
  
  // 回退到使用扩展 ID（向后兼容）
  const extensionId = browser.runtime.id;
  return `BookmarkHub-${extensionId}-encryption-key`;
}

/**
 * 加密数据
 * 
 * @param data - 要加密的明文数据
 * @param masterPassword - 可选的主密码，如果提供则使用密码派生密钥，否则使用扩展 ID
 * @returns 加密后的 Base64 字符串
 */
export async function encrypt(data: string, masterPassword?: string): Promise<string> {
  if (!data) return '';
  
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  
  const key = await deriveKey(getEncryptionPassword(masterPassword), salt);
  
  const encrypted = await crypto.subtle.encrypt(
    { name: ENCRYPTION_ALGORITHM, iv },
    key,
    encoder.encode(data)
  );
  
  const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encrypted), salt.length + iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

/**
 * 解密数据
 * 
 * @param encryptedData - 加密后的 Base64 字符串
 * @param masterPassword - 可选的主密码，如果提供则使用密码派生密钥，否则使用扩展 ID
 * @returns 解密后的明文数据
 * @throws {BookmarkHubError} 当解密失败时抛出错误
 */
export async function decrypt(encryptedData: string, masterPassword?: string): Promise<string> {
  if (!encryptedData) return '';
  
  try {
    const combined = new Uint8Array(
      atob(encryptedData).split('').map(c => c.charCodeAt(0))
    );
    
    const salt = combined.slice(0, SALT_LENGTH);
    const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const encrypted = combined.slice(SALT_LENGTH + IV_LENGTH);
    
    const key = await deriveKey(getEncryptionPassword(masterPassword), salt);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: ENCRYPTION_ALGORITHM, iv },
      key,
      encrypted
    );
    
    return new TextDecoder().decode(decrypted);
  } catch (error: unknown) {
    // 解密失败，抛出错误以便调用者区分空值和损坏数据
    logger.error(
      '解密失败 - 数据可能已损坏或使用了错误的凭证',
      { error: error instanceof Error ? error.message : error }
    );
    throw createError.parseError('Failed to decrypt data - it may be corrupted or credentials are incorrect');
  }
}

/**
 * 检查数据是否已加密
 * 通过尝试解码来验证格式
 */
export function isEncrypted(data: string): boolean {
  if (!data) return false;
  
  try {
    const decoded = atob(data);
    return decoded.length > SALT_LENGTH + IV_LENGTH;
  } catch {
    return false;
  }
}