/**
 * crypto.ts 单元测试
 * 
 * 测试加密/解密功能的核心安全逻辑
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { encrypt, decrypt, isEncrypted } from './crypto';

// Mock browser.runtime.id for encryption key derivation
const mockExtensionId = 'bookmarkhub-test-extension-id';

describe('crypto', () => {
  beforeEach(() => {
    vi.stubGlobal('browser', {
      runtime: {
        id: mockExtensionId,
      },
    });
  });

  describe('encrypt', () => {
    it('should encrypt a non-empty string', async () => {
      const plaintext = 'test-secret-token';
      const encrypted = await encrypt(plaintext);
      
      expect(encrypted).toBeTruthy();
      expect(encrypted).not.toBe(plaintext);
      expect(typeof encrypted).toBe('string');
    });

    it('should return empty string for empty input', async () => {
      const encrypted = await encrypt('');
      expect(encrypted).toBe('');
    });

    it('should return empty string for undefined input', async () => {
      const encrypted = await encrypt(undefined as unknown as string);
      expect(encrypted).toBe('');
    });

    it('should produce different encrypted outputs for same input (due to random salt/iv)', async () => {
      const plaintext = 'same-secret';
      const encrypted1 = await encrypt(plaintext);
      const encrypted2 = await encrypt(plaintext);

      // 不同的 salt 和 iv 应产生不同的加密结果
      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should encrypt with master password', async () => {
      const plaintext = 'secret-data';
      const masterPassword = 'my-strong-password';
      const encrypted = await encrypt(plaintext, masterPassword);
      
      expect(encrypted).toBeTruthy();
      expect(encrypted).not.toBe(plaintext);
    });

    it('should handle special characters and Unicode', async () => {
      const plaintext = '中文密码 🔐 special!@#$%^&*()';
      const encrypted = await encrypt(plaintext);
      const decrypted = await decrypt(encrypted);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should handle long strings', async () => {
      const plaintext = 'a'.repeat(10000);
      const encrypted = await encrypt(plaintext);
      const decrypted = await decrypt(encrypted);
      
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('decrypt', () => {
    it('should decrypt encrypted data correctly', async () => {
      const plaintext = 'my-github-token';
      const encrypted = await encrypt(plaintext);
      const decrypted = await decrypt(encrypted);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should return empty string for empty input', async () => {
      const decrypted = await decrypt('');
      expect(decrypted).toBe('');
    });

    it('should decrypt data encrypted with master password', async () => {
      const plaintext = 'webdav-password';
      const masterPassword = 'master-pass-123';
      const encrypted = await encrypt(plaintext, masterPassword);
      const decrypted = await decrypt(encrypted, masterPassword);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should throw error when decrypting with wrong password', async () => {
      const plaintext = 'secret';
      const correctPassword = 'correct-password';
      const wrongPassword = 'wrong-password';
      const encrypted = await encrypt(plaintext, correctPassword);
      
      await expect(decrypt(encrypted, wrongPassword)).rejects.toThrow();
    });

    it('should throw error for corrupted data', async () => {
      const corruptedData = 'not-valid-base64-encrypted-data';
      
      await expect(decrypt(corruptedData)).rejects.toThrow();
    });

    it('should throw error for truncated encrypted data', async () => {
      // Base64 编码的截断数据（缺少必要的 salt + iv + encrypted 部分）
      const truncatedData = btoa('short');
      
      await expect(decrypt(truncatedData)).rejects.toThrow();
    });
  });

  describe('isEncrypted', () => {
    it('should return true for valid encrypted data', async () => {
      const encrypted = await encrypt('test');
      expect(isEncrypted(encrypted)).toBe(true);
    });

    it('should return false for empty string', () => {
      expect(isEncrypted('')).toBe(false);
    });

    it('should return false for plain text', () => {
      expect(isEncrypted('plain-text')).toBe(false);
    });

    it('should return false for invalid base64', () => {
      expect(isEncrypted('not-valid-base64!!!')).toBe(false);
    });

    it('should return false for short base64 (insufficient length)', () => {
      // Base64 编码的数据，但长度不足以包含 salt + iv + encrypted
      const shortBase64 = btoa('abc');
      expect(isEncrypted(shortBase64)).toBe(false);
    });
  });

  describe('encryption roundtrip', () => {
    it('should maintain data integrity through encrypt-decrypt cycle', async () => {
      const testCases = [
        'simple-text',
        'with spaces and punctuation!',
        'numbers 12345',
        'unicode 你好世界 🎉',
        'json-like {"key": "value"}',
        'url https://example.com/path?query=value',
        'empty-value-test',
      ];

      for (const testCase of testCases) {
        const encrypted = await encrypt(testCase);
        const decrypted = await decrypt(encrypted);
        expect(decrypted).toBe(testCase);
      }
    });

    it('should work with master password roundtrip', async () => {
      const plaintext = 'sensitive-credential';
      const masterPassword = 'strong-master-password-123!';
      
      const encrypted = await encrypt(plaintext, masterPassword);
      const decrypted = await decrypt(encrypted, masterPassword);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should work without master password (extension ID fallback)', async () => {
      const plaintext = 'credential-without-master';
      
      const encrypted = await encrypt(plaintext);
      const decrypted = await decrypt(encrypted);
      
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('security considerations', () => {
    it('should use different salt for each encryption', async () => {
      // 加密相同数据两次，结果应不同（因为 salt 和 iv 是随机的）
      const plaintext = 'same-data';
      const enc1 = await encrypt(plaintext);
      const enc2 = await encrypt(plaintext);
      
      expect(enc1).not.toBe(enc2);
      
      // 但两者都能正确解密
      expect(await decrypt(enc1)).toBe(plaintext);
      expect(await decrypt(enc2)).toBe(plaintext);
    });

    it('should not reveal plaintext in encrypted output', async () => {
      const plaintext = 'secret-github-token-abc123';
      const encrypted = await encrypt(plaintext);
      
      // 加密结果不应包含原始文本
      expect(encrypted.toLowerCase()).not.toContain(plaintext.toLowerCase());
      expect(encrypted).not.toContain('secret');
      expect(encrypted).not.toContain('token');
    });

    it('should produce sufficiently long output (salt + iv + encrypted data)', async () => {
      const plaintext = 'x';
      const encrypted = await encrypt(plaintext);
      
      // Base64 编码后的最小长度：
      // salt (16 bytes) + iv (12 bytes) + encrypted (至少 16 bytes for AES-GCM tag)
      // = 至少 44 bytes 的二进制数据，base64 编码后至少约 60 个字符
      expect(encrypted.length).toBeGreaterThan(50);
    });
  });
});