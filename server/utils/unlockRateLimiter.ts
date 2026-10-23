/**
 * 密码爆破防护限流器（IP 级）
 * 失败次数达到阈值后锁定一段时间，成功认证则清除计数。
 * 用于 /api/auth/unlock 路由，补充全局 rateLimiter 的不足。
 *
 * 内存上限：
 * - 失败计数有 TTL（默认 15 分钟无新失败即清零），过期条目定期清理；
 * - Map 有条目上限，满了淘汰最旧条目，防止大量 IP 撑爆内存。
 */

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_LOCKOUT_MS = 5 * 60 * 1000; // 5 分钟
const DEFAULT_ATTEMPT_TTL_MS = 15 * 60 * 1000; // 15 分钟内无新失败 → 计数清零
const DEFAULT_MAX_ENTRIES = 10_000;
const PRUNE_INTERVAL_MS = 60 * 1000;

interface AttemptEntry {
  count: number;
  lockedUntil: number;
  /** 计数过期时间（最近一次失败 + attemptTtlMs） */
  expiresAt: number;
}

export class UnlockRateLimiter {
  private attempts = new Map<string, AttemptEntry>();
  private lastPrune = Date.now();

  constructor(
    private maxAttempts = DEFAULT_MAX_ATTEMPTS,
    private lockoutMs = DEFAULT_LOCKOUT_MS,
    private attemptTtlMs = DEFAULT_ATTEMPT_TTL_MS,
    private maxEntries = DEFAULT_MAX_ENTRIES
  ) {}

  /** 条目是否已无意义（锁定已过、计数已过期） */
  private isStale(entry: AttemptEntry, now: number): boolean {
    if (entry.lockedUntil > 0) return now >= entry.lockedUntil;
    return now >= entry.expiresAt;
  }

  private prune(now: number): void {
    if (now - this.lastPrune < PRUNE_INTERVAL_MS) return;
    this.lastPrune = now;
    for (const [ip, entry] of this.attempts) {
      if (this.isStale(entry, now)) this.attempts.delete(ip);
    }
  }

  isBlocked(ip: string): boolean {
    const now = Date.now();
    this.prune(now);
    const entry = this.attempts.get(ip);
    if (!entry) return false;
    if (this.isStale(entry, now)) {
      this.attempts.delete(ip);
      return false;
    }
    return entry.lockedUntil > 0;
  }

  recordFailure(ip: string): void {
    const now = Date.now();
    let entry = this.attempts.get(ip);
    if (entry && this.isStale(entry, now)) entry = undefined;
    if (!entry) entry = { count: 0, lockedUntil: 0, expiresAt: 0 };
    entry.count++;
    entry.expiresAt = now + this.attemptTtlMs;
    if (entry.count >= this.maxAttempts) {
      entry.lockedUntil = now + this.lockoutMs;
    }
    // 重新插入到末尾，Map 插入序 ≈ 最近活跃序
    this.attempts.delete(ip);
    while (this.attempts.size >= this.maxEntries) {
      const oldest = this.attempts.keys().next().value;
      if (oldest === undefined) break;
      this.attempts.delete(oldest);
    }
    this.attempts.set(ip, entry);
  }

  recordSuccess(ip: string): void {
    this.attempts.delete(ip);
  }

  /** 当前条目数（监控/测试用） */
  get size(): number {
    return this.attempts.size;
  }
}

// 模块级单例：同一进程内共享状态
const unlockLimiter = new UnlockRateLimiter();

/** 获取 unlock 路由专用的限流器实例 */
export function getUnlockRateLimiter(): UnlockRateLimiter {
  return unlockLimiter;
}
