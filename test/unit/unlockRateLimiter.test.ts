import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { UnlockRateLimiter } from "../../server/utils/unlockRateLimiter";

describe("UnlockRateLimiter", () => {
  let limiter: UnlockRateLimiter;

  beforeEach(() => {
    limiter = new UnlockRateLimiter(3, 60_000);
  });

  it("默认不封禁新 IP", () => {
    expect(limiter.isBlocked("1.2.3.4")).toBe(false);
  });

  it("失败次数达到阈值后锁定 IP", () => {
    limiter.recordFailure("1.2.3.4");
    limiter.recordFailure("1.2.3.4");
    expect(limiter.isBlocked("1.2.3.4")).toBe(false);

    limiter.recordFailure("1.2.3.4");
    expect(limiter.isBlocked("1.2.3.4")).toBe(true);
  });

  it("不同 IP 独立计数", () => {
    limiter.recordFailure("1.2.3.4");
    limiter.recordFailure("1.2.3.4");
    limiter.recordFailure("1.2.3.4");
    expect(limiter.isBlocked("1.2.3.4")).toBe(true);
    expect(limiter.isBlocked("5.6.7.8")).toBe(false);
  });

  it("成功认证清除该 IP 的失败记录", () => {
    limiter.recordFailure("1.2.3.4");
    limiter.recordFailure("1.2.3.4");
    limiter.recordSuccess("1.2.3.4");

    expect(limiter.isBlocked("1.2.3.4")).toBe(false);
  });

  it("锁定过期后自动解封", () => {
    vi.useFakeTimers();
    try {
      limiter.recordFailure("1.2.3.4");
      limiter.recordFailure("1.2.3.4");
      limiter.recordFailure("1.2.3.4");
      expect(limiter.isBlocked("1.2.3.4")).toBe(true);

      vi.advanceTimersByTime(61_000);
      expect(limiter.isBlocked("1.2.3.4")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("锁定期内持续封禁", () => {
    vi.useFakeTimers();
    try {
      limiter.recordFailure("1.2.3.4");
      limiter.recordFailure("1.2.3.4");
      limiter.recordFailure("1.2.3.4");

      vi.advanceTimersByTime(30_000);
      expect(limiter.isBlocked("1.2.3.4")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("失败计数有 TTL：长时间无新失败后清零", () => {
    vi.useFakeTimers();
    try {
      const l = new UnlockRateLimiter(3, 60_000, 15 * 60_000);
      l.recordFailure("1.2.3.4");
      l.recordFailure("1.2.3.4");
      vi.advanceTimersByTime(16 * 60_000);
      l.recordFailure("1.2.3.4");
      expect(l.isBlocked("1.2.3.4")).toBe(false); // 旧的 2 次已过期，只算 1 次
    } finally {
      vi.useRealTimers();
    }
  });

  it("条目数有上限：大量 IP 不会无限增长", () => {
    const l = new UnlockRateLimiter(5, 60_000, 15 * 60_000, 100);
    for (let i = 0; i < 1000; i++) l.recordFailure(`10.0.${i >> 8}.${i & 255}`);
    expect(l.size).toBeLessThanOrEqual(100);
  });
});
