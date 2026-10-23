import { parseList } from "./parseQuery";
import type { SearchRequest } from "../core/types/models";

/** 单请求最多 TG 频道数：前端每批只发 2 个，8 足够宽松，又能防一次请求扇出上千次抓取 */
export const MAX_CHANNELS_PER_REQUEST = 8;
export const MAX_KW_LENGTH = 200;
const RES_VALUES = new Set(["all", "results", "merge", "merged_by_type"]);
const SRC_VALUES = new Set(["all", "tg", "plugin"]);

export type SearchParamsResult =
  | { ok: true; req: SearchRequest; noChannelsLeft: boolean }
  | { ok: false; status: number; message: string };

function toConc(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : v != null ? parseInt(String(v), 10) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 16 ? n : undefined;
}

/**
 * GET / POST /api/search 共用的参数校验（两条路径校验规则完全一致）：
 * - kw 必填、≤200 字符
 * - conc 整数 1–16
 * - channels 只接受配置里的频道（defaultChannels ∪ priorityChannels），最多 8 个
 * - ext 必须是普通对象（超时由 SearchService 统一钳制到 3–15s）
 */
export function normalizeSearchParams(
  raw: {
    kw?: unknown;
    channels?: unknown;
    conc?: unknown;
    refresh?: unknown;
    res?: unknown;
    src?: unknown;
    plugins?: unknown;
    cloud_types?: unknown;
    ext?: unknown;
  },
  allowedChannels: Iterable<string>
): SearchParamsResult {
  const kw = typeof raw.kw === "string" ? raw.kw.trim() : "";
  if (!kw) return { ok: false, status: 400, message: "kw is required" };
  if (kw.length > MAX_KW_LENGTH) {
    return { ok: false, status: 400, message: `kw too long (max ${MAX_KW_LENGTH})` };
  }

  let ext: Record<string, any> = {};
  if (raw.ext != null && raw.ext !== "") {
    let parsed: unknown = raw.ext;
    if (typeof raw.ext === "string") {
      try {
        parsed = JSON.parse(raw.ext.trim() || "{}");
      } catch {
        return { ok: false, status: 400, message: "invalid ext json" };
      }
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, status: 400, message: "invalid ext json" };
    }
    ext = parsed as Record<string, any>;
  }

  const res = typeof raw.res === "string" && RES_VALUES.has(raw.res) ? raw.res : "merged_by_type";
  let src = typeof raw.src === "string" && SRC_VALUES.has(raw.src) ? raw.src : "all";

  const allow = new Set(allowedChannels);
  const requestedChannels = parseList(raw.channels as any);
  let channels: string[] | undefined;
  let noChannelsLeft = false;
  if (requestedChannels) {
    channels = [...new Set(requestedChannels.filter((c) => allow.has(c)))].slice(
      0,
      MAX_CHANNELS_PER_REQUEST
    );
    // 指定了频道但全部不在白名单：不能退回"全部默认频道"（那会放大扇出）
    if (channels.length === 0) {
      channels = undefined;
      noChannelsLeft = true;
      if (src === "all") src = "plugin";
    }
  }

  const req: SearchRequest = {
    kw,
    channels,
    conc: toConc(raw.conc),
    refresh: raw.refresh === true || String(raw.refresh).trim() === "true",
    res: (res === "merge" ? "merged_by_type" : res) as SearchRequest["res"],
    src: src as SearchRequest["src"],
    plugins: parseList(raw.plugins as any),
    cloud_types: parseList(raw.cloud_types as any),
    ext,
  };

  if (req.src === "tg") req.plugins = undefined;
  else if (req.src === "plugin") req.channels = undefined;

  return { ok: true, req, noChannelsLeft: noChannelsLeft && req.src === "tg" };
}
