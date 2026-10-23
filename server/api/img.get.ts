import { defineEventHandler, getQuery, createError, setHeader } from "h3";

const ALLOWED_HOSTS = /^img[1-9]\.doubanio\.com$/;
/** 封面图上限：豆瓣海报一般 < 300KB，5MB 足够 */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 15000;
/** 只放行位图（不放行 image/svg+xml：同源 SVG 可执行脚本） */
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

function badUrl(): never {
  throw createError({ statusCode: 400, statusMessage: "Invalid url" });
}

/** 读取响应体，超过上限直接报错（不把超大响应整个读进内存） */
async function readCapped(res: Response): Promise<Buffer> {
  const declared = Number(res.headers.get("content-length") || 0);
  if (declared > MAX_IMAGE_BYTES) throw new Error("image too large");
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_IMAGE_BYTES) throw new Error("image too large");
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks);
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  // getQuery 已经解码过，不要再 decodeURIComponent（字面量 % 会抛 URIError → 500）
  const url = typeof query.url === "string" ? query.url : "";

  if (!url || !url.startsWith("https://")) badUrl();

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    badUrl();
  }

  if (!ALLOWED_HOSTS.test(parsed.hostname)) {
    throw createError({ statusCode: 403, statusMessage: "Host not allowed" });
  }

  // 防止 SSRF 绕过：URL 中不得包含用户信息段或非标准端口
  if (parsed.username || parsed.password || parsed.port) {
    throw createError({ statusCode: 403, statusMessage: "Host not allowed" });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(parsed.toString(), {
      // 不跟随跳转：跳到白名单外的地址就是 SSRF
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        "Referer": "https://movie.douban.com/",
        "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
      },
    });
    const contentType = (res.headers.get("content-type") || "").toLowerCase().split(";")[0].trim();
    if (res.status !== 200 || !ALLOWED_TYPES.has(contentType)) {
      res.body?.cancel().catch(() => {});
      throw new Error(`bad upstream response ${res.status}`);
    }
    const buffer = await readCapped(res);

    setHeader(event, "Cache-Control", "public, max-age=86400");
    setHeader(event, "X-Content-Type-Options", "nosniff");
    setHeader(event, "Content-Type", contentType);
    return buffer;
  } catch {
    throw createError({
      statusCode: 502,
      statusMessage: "Image fetch failed",
    });
  } finally {
    clearTimeout(timer);
  }
});
