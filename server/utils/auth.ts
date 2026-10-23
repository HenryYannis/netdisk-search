import { createHmac, timingSafeEqual } from "node:crypto";
import type { H3Event } from "h3";
import { getCookie, getRequestHeader, setHeader } from "h3";

const COOKIE_NAME = "panhub_unlock";
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 天
const COOKIE_PATH = "/";

export function createAuthToken(secret: string): string {
  const ts = String(Date.now());
  const sig = createHmac("sha256", secret).update(ts).digest("hex");
  return `${ts}.${sig}`;
}

export function verifyAuthToken(token: string, secret: string): boolean {
  if (!token || !secret) return false;
  const [ts, sig] = token.split(".");
  if (!ts || !sig) return false;
  const expected = createHmac("sha256", secret).update(ts).digest("hex");
  try {
    if (!timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex")))
      return false;
  } catch {
    return false;
  }
  const age = Date.now() - parseInt(ts, 10);
  return age >= 0 && age < COOKIE_MAX_AGE * 1000;
}

export function verifyAuthCookie(event: H3Event, secret: string): boolean {
  const cookie = getCookie(event, COOKIE_NAME);
  return !!cookie && verifyAuthToken(cookie, secret);
}

export function setAuthCookie(event: H3Event, token: string): void {
  setHeader(event, "Set-Cookie", [
    `${COOKIE_NAME}=${token}; Path=${COOKIE_PATH}; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`,
  ].join(""));
}

/**
 * 统一鉴权入口。兼容两套凭证（都由 /api/auth/unlock 输对密码后签发）：
 *   1. Web 端 Cookie（panhub_unlock）
 *   2. Authorization: Bearer <HMAC token>（非浏览器客户端）
 * 任一通过即算已解锁。secret 为空时直接放行（未设置密码门）。
 * （旧的小程序共享密钥 MP_CLIENT_SECRET 通道已删除：密钥写在客户端包里等于没有密码。）
 */
export function isUnlocked(event: H3Event, secret: string): boolean {
  if (!secret.trim()) return true;
  if (verifyAuthCookie(event, secret)) return true;
  const h = getRequestHeader(event, "authorization");
  if (h && h.startsWith("Bearer ")) {
    return verifyAuthToken(h.slice(7), secret);
  }
  return false;
}
