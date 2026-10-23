import { createHash, timingSafeEqual } from "node:crypto";
import { readBody, createError } from "h3";
import { createAuthToken, setAuthCookie } from "../../utils/auth";
import { getUnlockRateLimiter } from "../../utils/unlockRateLimiter";
import { getClientIp } from "../../utils/clientIp";

function hash(s: string): Buffer {
  return createHash("sha256").update(s, "utf8").digest();
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const password = (config.searchPassword as string) || "";
  if (!password.trim()) {
    return { ok: true };
  }

  const ip = getClientIp(event);
  const limiter = getUnlockRateLimiter();

  if (limiter.isBlocked(ip)) {
    throw createError({
      statusCode: 429,
      statusMessage: "too many failed attempts, try again later",
    });
  }

  const body = await readBody<{ password?: string }>(event);
  const input = (body?.password ?? "").trim();
  if (!input) {
    throw createError({ statusCode: 400, statusMessage: "password required" });
  }

  const a = hash(input);
  const b = hash(password);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    limiter.recordFailure(ip);
    throw createError({ statusCode: 401, statusMessage: "invalid password" });
  }

  limiter.recordSuccess(ip);
  const token = createAuthToken(password);
  setAuthCookie(event, token);
  return { ok: true, token };
});
