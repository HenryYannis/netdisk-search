import { BaseAsyncPlugin, pluginSignal, pluginTimeout } from "./manager";
import type { SearchResult } from "../types/models";
import { fetchWithRetry } from "../utils/fetch";

// 轻量版：直接请求 pansearch 的 _next data 接口

type Item = { id: number; content: string; pan: string; time?: string };
type Resp = { pageProps: { data: { total: number; data: Item[] } } };

const WEBSITE = "https://www.pansearch.me/search";
const DATA = (buildId: string) =>
  `https://www.pansearch.me/_next/data/${buildId}/search.json`;

interface ReqOpts {
  timeout: number;
  signal?: AbortSignal;
}

/** buildId 失效的信号：404，或返回的不是 Next data JSON（如被重定向到 HTML 页面） */
function isStaleBuildIdResponse(err: unknown, resp: unknown): boolean {
  if (err) return (err as any)?.statusCode === 404;
  return !resp || typeof resp !== "object" || !("pageProps" in (resp as any));
}

async function fetchData(buildId: string, keyword: string, opts: ReqOpts) {
  const url = `${DATA(buildId)}?keyword=${encodeURIComponent(keyword)}&offset=0`;
  try {
    const resp = await fetchWithRetry<Resp>(
      url,
      { headers: { "user-agent": "Mozilla/5.0" } },
      // 不做重试：超时由 SearchService 统一控制，重试只会把一次失败拖到几十秒
      { maxRetries: 0, timeout: opts.timeout, logWarnings: false, signal: opts.signal }
    );
    return { resp, err: undefined as unknown };
  } catch (err) {
    return { resp: undefined, err };
  }
}

export class PansearchPlugin extends BaseAsyncPlugin {
  constructor() {
    super("pansearch", 3);
  }
  override async search(
    keyword: string,
    ext?: Record<string, any>
  ): Promise<SearchResult[]> {
    const opts: ReqOpts = { timeout: pluginTimeout(ext), signal: pluginSignal(ext) };
    let buildId = await getBuildId(opts);
    let { resp, err } = await fetchData(buildId, keyword, opts);

    // pansearch 重新部署后旧 buildId 会 404：清掉缓存、重新拿 buildId 再试一次
    if (!opts.signal?.aborted && isStaleBuildIdResponse(err, resp)) {
      invalidateBuildId();
      buildId = await getBuildId(opts);
      ({ resp, err } = await fetchData(buildId, keyword, opts));
    }
    if (err) throw err;

    const items = (resp as Resp | undefined)?.pageProps?.data?.data || [];
    const out: SearchResult[] = [];
    for (const it of items) {
      const link = extractLink(it.content);
      if (!link.url) continue;
      out.push({
        message_id: "",
        unique_id: `pansearch-${it.id}`,
        channel: "",
        datetime: it.time || "",
        title: extractTitle(it.content, keyword),
        content: cleanHTML(it.content),
        links: [
          { type: mapType(link.url), url: link.url, password: link.password },
        ],
      });
    }
    return out;
  }
}

// buildId 是 Next.js 构建产物 ID，变化频率以天/部署计，缓存 1 小时避免每次搜索都重抓首页；
// 数据接口 404 / 非 JSON 时会主动失效（见 search）
let cachedBuildId: { value: string; expires: number } | null = null;
const BUILD_ID_TTL = 3600_000; // 1 小时

function invalidateBuildId(): void {
  cachedBuildId = null;
}

/** 仅测试用 */
export function _resetPansearchBuildId(): void {
  cachedBuildId = null;
}

async function getBuildId(opts: ReqOpts): Promise<string> {
  if (cachedBuildId && Date.now() < cachedBuildId.expires) {
    return cachedBuildId.value;
  }

  const html = await fetchWithRetry<string>(
    WEBSITE,
    { headers: { "user-agent": "Mozilla/5.0" } },
    { maxRetries: 0, timeout: opts.timeout, logWarnings: false, signal: opts.signal }
  );
  const m = /"buildId":"([^"]+)"/.exec(html);
  if (m) {
    cachedBuildId = { value: m[1], expires: Date.now() + BUILD_ID_TTL };
    return m[1];
  }
  const m2 =
    /<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s.exec(
      html
    );
  if (m2) {
    try {
      const data = JSON.parse(m2[1]);
      if (data?.buildId) {
        cachedBuildId = { value: data.buildId, expires: Date.now() + BUILD_ID_TTL };
        return data.buildId;
      }
    } catch {}
  }
  throw new Error("pansearch: no buildId");
}

function extractLink(content: string): { url: string; password: string } {
  // 简单从 a 标签与 pwd 参数提取
  const mHref = /href=\"([^\"]+)\"/.exec(content);
  const url = mHref ? mHref[1] : "";
  let password = "";
  const mPwd = /[?&]pwd=([^"&#]+)/.exec(content);
  if (mPwd) password = mPwd[1];
  return { url, password };
}
function extractTitle(content: string, keyword: string): string {
  const m = /名称：([^<\n]+)/.exec(content);
  if (m) return cleanHTML(m[1]);
  return keyword;
}
function cleanHTML(html: string): string {
  return html
    .replace(/<span class='highlight-keyword'>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function mapType(url: string): string {
  const u = url.toLowerCase();
  if (u.startsWith("magnet:")) return "magnet";
  if (u.startsWith("ed2k:")) return "ed2k";
  if (u.includes("pan.baidu.com")) return "baidu";
  if (u.includes("alipan.com") || u.includes("aliyundrive.com"))
    return "aliyun";
  if (u.includes("pan.quark.cn")) return "quark";
  if (u.includes("cloud.189.cn")) return "tianyi";
  if (u.includes("pan.xunlei.com")) return "xunlei";
  if (u.includes("caiyun") || u.includes("yun.139.com")) return "mobile";
  if (u.includes("115.com")) return "115";
  if (u.includes("123pan.com")) return "123";
  if (u.includes("drive.uc.cn")) return "uc";
  if (u.includes("mypikpak.com")) return "pikpak";
  if (u.includes("lanzou")) return "lanzou";
  return "others";
}

