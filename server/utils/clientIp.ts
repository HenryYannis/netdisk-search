import { getHeader } from "h3";
import { isIP } from "node:net";

/**
 * 客户端 IP 获取（全站唯一实现：限流中间件、密码爆破防护都用它）
 *
 * 限流必须建立在"攻击者不可伪造的客户端标识"之上，优先级：
 *   1. event.context.clientAddress —— 平台注入（CF Workers 等），完全可信
 *   2. CF-Connecting-IP —— 仅当显式设置 TRUST_PROXY=1（前置 Cloudflare / Tunnel，
 *      CF 会覆盖用户伪造的该头，此时可信）
 *   3. socket remoteAddress —— 默认路径（直连），攻击者无法伪造
 *
 * 不读 X-Forwarded-For / X-Real-IP：Cloudflare 会把真实 IP *追加* 到客户端自带的
 * XFF 后面，取第一项等于让攻击者自选 IP，任何基于它的限流/锁定都可被绕过。
 */

/** 是否显式声明前置了可信代理（Cloudflare）。默认 false → 不信任任何代理头 */
function trustProxy(): boolean {
  return process.env.TRUST_PROXY === "1";
}

/** IPv4-mapped IPv6 规范化：::ffff:1.2.3.4 -> 1.2.3.4 */
export function normalizeIp(ip: string): string {
  const v = ip.trim();
  if (v.startsWith("::ffff:")) return v.slice(7);
  return v;
}

/** 严格校验 IP 格式，防止代理头塞任意字符串撑爆 store */
export function isValidIp(ip: string): boolean {
  return isIP(normalizeIp(ip)) > 0;
}

export function getClientIp(event: any): string {
  const ctx = event?.context?.clientAddress;
  if (typeof ctx === "string" && ctx) return normalizeIp(ctx);

  if (trustProxy()) {
    const cf = getHeader(event, "cf-connecting-ip");
    if (typeof cf === "string" && isValidIp(cf)) return normalizeIp(cf);
  }

  const sock = event?.node?.req?.socket?.remoteAddress;
  if (typeof sock === "string" && sock) return normalizeIp(sock);
  return "unknown";
}
