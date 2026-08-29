/**
 * retry.ts 单元测试
 *
 * 覆盖 retryOperation 的重试策略：
 * - 成功不重试
 * - 失败重试后成功
 * - 超过 maxRetries 抛出最后一个错误
 * - 指数退避延迟被正确计算（含随机抖动与上限）
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { retryOperation } from './retry';

// 用可记录的 setTimeout 桩替换全局 setTimeout：
// - 记录每次重试的延迟毫秒数（验证指数退避）
// - 以 0 延迟委托给真实 setTimeout，让测试无需等待真实退避时间
const realSetTimeout = globalThis.setTimeout;
const delayCalls: number[] = [];

beforeEach(() => {
  delayCalls.length = 0;
  vi.stubGlobal(
    'setTimeout',
    vi.fn((cb: (...args: unknown[]) => void, ms?: number) => {
      delayCalls.push(ms ?? 0);
      return realSetTimeout(cb, 0) as unknown as ReturnType<typeof setTimeout>;
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('retryOperation', () => {
  it('returns the result immediately on success without retrying', async () => {
    const operation = vi.fn().mockResolvedValue('ok');

    await expect(retryOperation(operation)).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(1);
    expect(delayCalls).toEqual([]);
  });

  it('retries after a failure and returns the eventual result', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce('recovered');

    await expect(retryOperation(operation, { maxRetries: 3 })).resolves.toBe('recovered');
    expect(operation).toHaveBeenCalledTimes(2);
    // 恰好等待一次初始延迟
    expect(delayCalls).toEqual([1000]);
  });

  it('throws the last error after exhausting maxRetries', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('always fails'));

    await expect(retryOperation(operation, { maxRetries: 2 })).rejects.toThrow('always fails');
    // 1 次初始调用 + 2 次重试
    expect(operation).toHaveBeenCalledTimes(3);
    expect(delayCalls).toHaveLength(2);
  });

  it('does not retry when maxRetries is 0', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('no retry'));

    await expect(retryOperation(operation, { maxRetries: 0 })).rejects.toThrow('no retry');
    expect(operation).toHaveBeenCalledTimes(1);
    expect(delayCalls).toEqual([]);
  });

  it('applies default options (3 retries) when none are provided', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('e1'))
      .mockRejectedValueOnce(new Error('e2'))
      .mockRejectedValueOnce(new Error('e3'))
      .mockResolvedValueOnce('finally');

    await expect(retryOperation(operation)).resolves.toBe('finally');
    expect(operation).toHaveBeenCalledTimes(4);
    expect(delayCalls).toHaveLength(3);
  });

  it('uses exponential backoff between retries (±25% jitter)', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('fail'));
    const initialDelay = 100;

    await expect(
      retryOperation(operation, { maxRetries: 3, initialDelay, maxDelay: 10000, backoffFactor: 2 })
    ).rejects.toThrow('fail');

    // 第一次重试：精确等待 initialDelay
    expect(delayCalls[0]).toBe(100);
    // 第二次重试：min(100*2, 10000) + [0, 25] 抖动 → [200, 225]
    expect(delayCalls[1]).toBeGreaterThanOrEqual(200);
    expect(delayCalls[1]).toBeLessThanOrEqual(225);
    // 第三次重试：上一轮延迟 ∈ [200, 225] → min(*2) ∈ [400, 450] + [0, 56.25] 抖动 → [400, 507]
    expect(delayCalls[2]).toBeGreaterThanOrEqual(400);
    expect(delayCalls[2]).toBeLessThanOrEqual(507);
  });

  it('caps the delay at maxDelay (jitter added on top of the cap)', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('fail'));

    await expect(
      retryOperation(operation, { maxRetries: 2, initialDelay: 500, maxDelay: 600, backoffFactor: 10 })
    ).rejects.toThrow('fail');

    expect(delayCalls[0]).toBe(500);
    // min(500*10, 600) = 600，叠加 [0, 125] 抖动
    expect(delayCalls[1]).toBeGreaterThanOrEqual(600);
    expect(delayCalls[1]).toBeLessThanOrEqual(725);
  });

  it('propagates the operation result value unchanged', async () => {
    const payload = { bookmarks: [{ title: 'A', url: 'https://a.example.com' }] };
    const operation = vi.fn().mockResolvedValue(payload);

    await expect(retryOperation(operation, { maxRetries: 2 })).resolves.toBe(payload);
  });

  it('handles non-Error thrown values by rethrowing the last one', async () => {
    const operation = vi.fn().mockRejectedValue('string failure');

    await expect(retryOperation(operation, { maxRetries: 1 })).rejects.toBe('string failure');
  });

  it('logs retry progress when logRetries is enabled (success path)', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce('ok');

    await expect(retryOperation(operation, { maxRetries: 3, logRetries: true })).resolves.toBe('ok');
    expect(infoSpy).toHaveBeenCalled();
    infoSpy.mockRestore();
  });

  it('logs retry progress when logRetries is enabled (exhausted path)', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const operation = vi.fn().mockRejectedValue(new Error('always fails'));

    await expect(retryOperation(operation, { maxRetries: 1, logRetries: true })).rejects.toThrow('always fails');
    expect(errorSpy).toHaveBeenCalled();
    infoSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
