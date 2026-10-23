import { defineEventHandler, createError, setHeader } from "h3";
import { getClientIp, isValidIp, normalizeIp } from "../utils/clientIp";

/**
 * 全局限流中间件（IP 级，固定窗口）
 *
 * - 客户端 IP：见 server/utils/clientIp.ts（CF-Connecting-IP，需 TRUST_PROXY=1；否则 socket 地址）
 * - 限流键 = IP + pathname（**不含 query**）：否则每个带不同 query 的请求都是新键，
 *   限流形同虚设，且长 query 会把 store 撑大
 * - store 有上限；满了淘汰最旧条目（而不是对所有人放行）
 */

export { getClientIp, isValidIp, normalizeIp };

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export interface RateLimitConfig {
  limits?: Record<string, { limit: number; windowMs: number }>;
  defaultLimit?: { limit: number; windowMs: number };
  maxStoreEntries?: number;
}

// 路径 → { limit, windowMs }
const RATE_LIMITS: Record<string, { limit: number; windowMs: number }> = {
  // 一次完整搜索 = 每个插件 1 请求（7）+ TG 每批 2 频道（69 频道 → 35 批）≈ 42 请求，
  // 自动暂停后点"继续"只是把剩下的请求发完，不额外增加。
  // 300/分 ≈ 每分钟 7 次完整搜索：正常用户连搜几次 + 继续都不会被拦，
  // 同时单 IP 的上游扇出仍有上限（单请求频道数另有 ≤8 的硬上限）。
  "/api/search": { limit: 300, windowMs: 60_000 },
  // 探活每次最多 50 个链接 → 对上游请求放大 50x，需单独收紧防打爆网盘接口
  "/api/check": { limit: 15, windowMs: 60_000 },
  "/api/hot-searches": { limit: 30, windowMs: 60_000 },
  // 豆瓣封面代理：榜单每页 25 张图，翻页/切分类会连续加载，给足余量
  "/api/img": { limit: 240, windowMs: 60_000 },
};

const DEFAULT_LIMIT = { limit: 60, windowMs: 60_000 };
const CLEANUP_INTERVAL = 60_000; // 1 分钟清理一次过期项
// 键 = IP + pathname，单条 < 100B；1 万条约 1~2MB
const DEFAULT_MAX_STORE_ENTRIES = 10_000;

/** 去掉 query / hash，只留 pathname（h3 1.x 的 event.path 含 query） */
export function toPathname(path: string): string {
  const i = path.search(/[?#]/);
  return i >= 0 ? path.slice(0, i) : path;
}

export function getRateLimit(pathname: string, limits: Record<string, { limit: number; windowMs: number }>, defaultLimit: { limit: number; windowMs: number }) {
  // 精确匹配
  if (limits[pathname]) return limits[pathname];
  // 前缀匹配（/api/hot-searches POST 和 GET 共享限制）
  for (const [prefix, config] of Object.entries(limits)) {
    if (pathname.startsWith(prefix)) return config;
  }
  return defaultLimit;
}

function cleanup(store: Map<string, RateLimitEntry>, lastCleanupRef: { value: number }, now: number) {
  if (now - lastCleanupRef.value < CLEANUP_INTERVAL) return;
  lastCleanupRef.value = now;
  for (const [key, entry] of store) {
    if (now > entry.resetTime) store.delete(key);
  }
}

/** 创建限流中间件（工厂：测试可用小限额/小上限构造独立实例） */
export function createRateLimitMiddleware(config: RateLimitConfig = {}) {
  const limits = config.limits ?? RATE_LIMITS;
  const defaultLimit = config.defaultLimit ?? DEFAULT_LIMIT;
  const maxStoreEntries = config.maxStoreEntries ?? DEFAULT_MAX_STORE_ENTRIES;
  const store = new Map<string, RateLimitEntry>();
  const lastCleanupRef = { value: Date.now() };

  return defineEventHandler((event: any) => {
    // 只限制 API 路由（健康检查和认证排除限流）
    const path = toPathname(event.path || "");
    if (!path.startsWith("/api/")) return;
    if (path === "/api/health") return;

    cleanup(store, lastCleanupRef, Date.now());

    const ip = getClientIp(event);
    const { limit, windowMs } = getRateLimit(path, limits, defaultLimit);
    const key = `${ip}:${path}`;
    const now = Date.now();

    let entry = store.get(key);
    if (!entry || now > entry.resetTime) {
      // 新窗口：先删再插，保持 Map 插入序 ≈ 窗口开始时间序，便于按"最旧"淘汰
      if (entry) store.delete(key);
      // store 满：先清过期项；仍满则淘汰最旧条目（绝不对所有人降级放行）
      if (store.size >= maxStoreEntries) {
        for (const [k, e] of store) {
          if (now > e.resetTime) store.delete(k);
        }
        while (store.size >= maxStoreEntries) {
          const oldest = store.keys().next().value;
          if (oldest === undefined) break;
          store.delete(oldest);
        }
      }
      entry = { count: 0, resetTime: now + windowMs };
      store.set(key, entry);
    }

    entry.count++;

    if (entry.count > limit) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      setHeader(event, "Retry-After", String(retryAfter));
      throw createError({
        statusCode: 429,
        message: `请求过于频繁，请${retryAfter}秒后重试`,
        data: { retryAfter },
      });
    }
  });
}

// 全局单例中间件（Nitro 约定）
export default createRateLimitMiddleware();
