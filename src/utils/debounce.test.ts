/**
 * debounce.ts 单元测试
 *
 * 覆盖防抖与持久化锁的核心行为（fake timers）：
 * - SyncDebouncer.triggerSync: 防抖窗口合并多次触发
 * - maxWaitTime 上限强制触发
 * - cancel 取消计时器
 * - LockManager acquire / release / 过期锁清理
 * - checkAndResumePendingSync 恢复待同步标志
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BACKUP_STORAGE_KEYS, BACKUP_DEFAULTS } from './constants';

// ---------- 内存版 storage.local ----------
const storageMap = new Map<string, unknown>();

const storageLocal = {
  get: vi.fn(async (keys: string | string[]) => {
    const list = Array.isArray(keys) ? keys : [keys];
    const out: Record<string, unknown> = {};
    for (const key of list) {
      if (storageMap.has(key)) out[key] = structuredClone(storageMap.get(key));
    }
    return out;
  }),
  set: vi.fn(async (items: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(items)) storageMap.set(key, structuredClone(value));
  }),
  remove: vi.fn(async (keys: string | string[]) => {
    const list = Array.isArray(keys) ? keys : [keys];
    for (const key of list) storageMap.delete(key);
  }),
};

// @ts-expect-error test browser stub
globalThis.browser = { storage: { local: storageLocal } };

const { LockManager, SyncDebouncer } = await import('./debounce');

const LOCK_KEY = BACKUP_STORAGE_KEYS.SYNC_LOCK_KEY;
const PENDING_KEY = BACKUP_STORAGE_KEYS.PENDING_SYNC_KEY;

// 测试用更短的防抖窗口（默认 5s/30s 太慢）
const DEBOUNCE_TIME = 1000;
const MAX_WAIT_TIME = 5000;

function makeDebouncer(): SyncDebouncer {
  const debouncer = new SyncDebouncer();
  debouncer.updateConfig({ debounceTime: DEBOUNCE_TIME, maxWaitTime: MAX_WAIT_TIME });
  return debouncer;
}

beforeEach(() => {
  storageMap.clear();
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('LockManager', () => {
  it('acquires a free lock and persists lock state with timestamp', async () => {
    const manager = new LockManager();
    await expect(manager.acquire()).resolves.toBe(true);

    const lock = storageMap.get(LOCK_KEY) as { locked: boolean; timestamp: number };
    expect(lock.locked).toBe(true);
    expect(lock.timestamp).toBe(Date.now());
  });

  it('fails to acquire an already-held lock', async () => {
    const manager = new LockManager();
    await expect(manager.acquire()).resolves.toBe(true);
    await expect(manager.acquire()).resolves.toBe(false);
  });

  it('releases the lock and allows re-acquiring', async () => {
    const manager = new LockManager();
    await manager.acquire();
    await manager.release();
    expect(storageMap.has(LOCK_KEY)).toBe(false);
    await expect(manager.acquire()).resolves.toBe(true);
  });

  it('isLocked reflects lock state', async () => {
    const manager = new LockManager();
    await expect(manager.isLocked()).resolves.toBe(false);
    await manager.acquire();
    await expect(manager.isLocked()).resolves.toBe(true);
    await manager.release();
    await expect(manager.isLocked()).resolves.toBe(false);
  });

  it('cleans up a stale lock (older than LOCK_TIMEOUT) and reacquires', async () => {
    const staleTimestamp = Date.now() - BACKUP_DEFAULTS.LOCK_TIMEOUT - 1000;
    storageMap.set(LOCK_KEY, { locked: true, timestamp: staleTimestamp });

    const manager = new LockManager();
    // 过期锁应被清理后成功获取
    await expect(manager.acquire()).resolves.toBe(true);
    const lock = storageMap.get(LOCK_KEY) as { locked: boolean; timestamp: number };
    expect(lock.timestamp).toBe(Date.now());
  });

  it('isLocked returns false for a stale lock (auto-cleanup)', async () => {
    const staleTimestamp = Date.now() - BACKUP_DEFAULTS.LOCK_TIMEOUT - 1000;
    storageMap.set(LOCK_KEY, { locked: true, timestamp: staleTimestamp });

    const manager = new LockManager();
    await expect(manager.isLocked()).resolves.toBe(false);
    expect(storageMap.has(LOCK_KEY)).toBe(false);
  });

  it('does not clean up a fresh lock', async () => {
    storageMap.set(LOCK_KEY, { locked: true, timestamp: Date.now() - 1000 });

    const manager = new LockManager();
    await expect(manager.acquire()).resolves.toBe(false);
    expect(storageMap.has(LOCK_KEY)).toBe(true);
  });

  it('returns false when persisting the lock fails (storage error)', async () => {
    storageLocal.set.mockRejectedValueOnce(new Error('io error'));

    const manager = new LockManager();
    await expect(manager.acquire()).resolves.toBe(false);
  });

  it('release swallows storage errors', async () => {
    const manager = new LockManager();
    await manager.acquire();
    storageLocal.remove.mockRejectedValueOnce(new Error('io error'));
    await expect(manager.release()).resolves.toBeUndefined();
  });
});

describe('SyncDebouncer.triggerSync', () => {
  it('debounces multiple triggers into a single sync call', async () => {
    const debouncer = makeDebouncer();
    const callback = vi.fn().mockResolvedValue(undefined);
    debouncer.setSyncCallback(callback);

    await debouncer.triggerSync();
    await debouncer.triggerSync();
    await debouncer.triggerSync();

    // 防抖窗口内未触发
    await vi.advanceTimersByTimeAsync(DEBOUNCE_TIME - 1);
    expect(callback).not.toHaveBeenCalled();

    // 窗口到期后只触发一次
    await vi.advanceTimersByTimeAsync(1);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('resets the debounce window on each trigger', async () => {
    const debouncer = makeDebouncer();
    const callback = vi.fn().mockResolvedValue(undefined);
    debouncer.setSyncCallback(callback);

    await debouncer.triggerSync();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_TIME - 100);
    await debouncer.triggerSync(); // 重置窗口

    await vi.advanceTimersByTimeAsync(DEBOUNCE_TIME - 100);
    expect(callback).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(100);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('forces execution at maxWaitTime even with continuous triggers', async () => {
    const debouncer = makeDebouncer();
    const callback = vi.fn().mockResolvedValue(undefined);
    debouncer.setSyncCallback(callback);

    // 以短于防抖窗口的间隔连续触发，防止防抖计时器在 maxWait 之前到期
    await debouncer.triggerSync(); // t=0: maxTimer 定在 5000
    let last = 0;
    for (const next of [400, 800, 1200, 1600, 2000, 2400, 2800, 3200, 3600, 4000, 4400, 4800]) {
      await vi.advanceTimersByTimeAsync(next - last);
      last = next;
      await debouncer.triggerSync(); // 每次重置防抖窗口
    }

    await vi.advanceTimersByTimeAsync(199); // t=4999
    expect(callback).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1); // t=5000: maxWait 到期强制触发
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('cancel prevents pending timers from firing', async () => {
    const debouncer = makeDebouncer();
    const callback = vi.fn().mockResolvedValue(undefined);
    debouncer.setSyncCallback(callback);

    await debouncer.triggerSync();
    debouncer.cancel();

    await vi.advanceTimersByTimeAsync(MAX_WAIT_TIME * 2);
    expect(callback).not.toHaveBeenCalled();
  });

  it('can trigger again after cancel', async () => {
    const debouncer = makeDebouncer();
    const callback = vi.fn().mockResolvedValue(undefined);
    debouncer.setSyncCallback(callback);

    await debouncer.triggerSync();
    debouncer.cancel();
    await vi.advanceTimersByTimeAsync(MAX_WAIT_TIME * 2);
    expect(callback).not.toHaveBeenCalled();

    await debouncer.triggerSync();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_TIME);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('releases the lock after a successful sync', async () => {
    const debouncer = makeDebouncer();
    const callback = vi.fn().mockResolvedValue(undefined);
    debouncer.setSyncCallback(callback);

    await debouncer.triggerSync();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_TIME);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(storageMap.has(LOCK_KEY)).toBe(false);
  });

  it('sets pendingSync when locked instead of scheduling a sync', async () => {
    // 先占用锁
    storageMap.set(LOCK_KEY, { locked: true, timestamp: Date.now() });

    const debouncer = makeDebouncer();
    const callback = vi.fn().mockResolvedValue(undefined);
    debouncer.setSyncCallback(callback);

    await debouncer.triggerSync();

    expect(storageMap.get(PENDING_KEY)).toBe(true);
    // 无计时器：推进很久也不会执行同步
    await vi.advanceTimersByTimeAsync(MAX_WAIT_TIME * 2);
    expect(callback).not.toHaveBeenCalled();
  });

  it('sets pendingSync when the lock is taken between scheduling and execution', async () => {
    const debouncer = makeDebouncer();
    const callback = vi.fn().mockResolvedValue(undefined);
    debouncer.setSyncCallback(callback);

    await debouncer.triggerSync();
    // 防抖到期前锁被占用
    const lockSetAt = Date.now();
    storageMap.set(LOCK_KEY, { locked: true, timestamp: lockSetAt });

    await vi.advanceTimersByTimeAsync(DEBOUNCE_TIME);

    expect(callback).not.toHaveBeenCalled();
    expect(storageMap.get(PENDING_KEY)).toBe(true);
    // executeSync 失败获取锁后不应改动已存在的锁
    expect(storageMap.get(LOCK_KEY)).toEqual({ locked: true, timestamp: lockSetAt });
  });
});

describe('SyncDebouncer.checkAndResumePendingSync', () => {
  it('resumes a pending sync after the lock is released', async () => {
    // 锁被占用时触发同步 → pendingSync 置位
    storageMap.set(LOCK_KEY, { locked: true, timestamp: Date.now() });
    const debouncer = makeDebouncer();
    const callback = vi.fn().mockResolvedValue(undefined);
    debouncer.setSyncCallback(callback);
    await debouncer.triggerSync();
    expect(storageMap.get(PENDING_KEY)).toBe(true);

    // 锁释放后恢复待同步
    await storageLocal.remove(LOCK_KEY);
    await debouncer.checkAndResumePendingSync();

    expect(storageMap.has(PENDING_KEY)).toBe(false);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_TIME);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(storageMap.has(LOCK_KEY)).toBe(false);
  });

  it('does nothing when no pending sync flag exists', async () => {
    const debouncer = makeDebouncer();
    const callback = vi.fn().mockResolvedValue(undefined);
    debouncer.setSyncCallback(callback);

    await debouncer.checkAndResumePendingSync();

    await vi.advanceTimersByTimeAsync(MAX_WAIT_TIME * 2);
    expect(callback).not.toHaveBeenCalled();
    expect(storageMap.has(PENDING_KEY)).toBe(false);
  });

  it('re-triggers a pending sync left by a failed lock acquisition', async () => {
    const debouncer = makeDebouncer();
    const callback = vi.fn().mockResolvedValue(undefined);
    debouncer.setSyncCallback(callback);

    // 防抖到期前锁被占用 → executeSync 置 pendingSync
    await debouncer.triggerSync();
    storageMap.set(LOCK_KEY, { locked: true, timestamp: Date.now() });
    await vi.advanceTimersByTimeAsync(DEBOUNCE_TIME);
    expect(storageMap.get(PENDING_KEY)).toBe(true);

    // 释放锁后手动恢复（模拟 Service Worker 唤醒）
    await storageLocal.remove(LOCK_KEY);
    await debouncer.checkAndResumePendingSync();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_TIME);

    expect(callback).toHaveBeenCalledTimes(1);
    // 同步完成后 pendingSync 已清除
    expect(storageMap.has(PENDING_KEY)).toBe(false);
  });
});

describe('SyncDebouncer.updateConfig', () => {
  it('applies new debounce timing', async () => {
    const debouncer = new SyncDebouncer();
    debouncer.updateConfig({ debounceTime: 300, maxWaitTime: 2000 });
    const callback = vi.fn().mockResolvedValue(undefined);
    debouncer.setSyncCallback(callback);

    await debouncer.triggerSync();
    await vi.advanceTimersByTimeAsync(299);
    expect(callback).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(callback).toHaveBeenCalledTimes(1);
  });
});

describe('SyncDebouncer edge cases', () => {
  it('re-triggers a pending sync queued while a sync was executing', async () => {
    const debouncer = makeDebouncer();
    let calls = 0;
    const callback = vi.fn(async () => {
      calls++;
      if (calls === 1) {
        // 模拟第一次同步执行期间又有新变更排队（pendingSync 置位）
        storageMap.set(PENDING_KEY, true);
      }
    });
    debouncer.setSyncCallback(callback);

    await debouncer.triggerSync();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_TIME);
    // 第一次同步结束后发现 pendingSync → 自动重新触发
    await vi.advanceTimersByTimeAsync(DEBOUNCE_TIME);

    expect(callback).toHaveBeenCalledTimes(2);
    expect(storageMap.has(PENDING_KEY)).toBe(false);
    expect(storageMap.has(LOCK_KEY)).toBe(false);
  });

  it('falls back to the default no-op callback when none is set', async () => {
    const debouncer = makeDebouncer();
    // 不调用 setSyncCallback
    await debouncer.triggerSync();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_TIME);
    // 默认回调为空操作，同步流程仍正常完成（锁已释放）
    expect(storageMap.has(LOCK_KEY)).toBe(false);
  });
});
