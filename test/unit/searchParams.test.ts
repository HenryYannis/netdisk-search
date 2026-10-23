import { describe, it, expect } from "vitest";
import {
  normalizeSearchParams,
  MAX_CHANNELS_PER_REQUEST,
} from "../../server/utils/searchParams";

const ALLOWED = Array.from({ length: 20 }, (_, i) => `ch${i}`);

describe("normalizeSearchParams（GET/POST 共用校验）", () => {
  it("kw 必填且 ≤200", () => {
    expect(normalizeSearchParams({}, ALLOWED).ok).toBe(false);
    expect(normalizeSearchParams({ kw: "x".repeat(201) }, ALLOWED).ok).toBe(false);
    expect(normalizeSearchParams({ kw: "  ok  " }, ALLOWED).ok).toBe(true);
  });

  it("conc 只接受 1–16 的整数", () => {
    const get = (conc: unknown) => {
      const r = normalizeSearchParams({ kw: "a", conc }, ALLOWED);
      return r.ok ? r.req.conc : "err";
    };
    expect(get("4")).toBe(4);
    expect(get(16)).toBe(16);
    expect(get(0)).toBeUndefined();
    expect(get(1000)).toBeUndefined();
    expect(get(2.5)).toBeUndefined();
    expect(get("abc")).toBeUndefined();
  });

  it("频道只接受白名单内的，且最多 8 个", () => {
    const r = normalizeSearchParams(
      { kw: "a", src: "tg", channels: [...ALLOWED, "evil1", "evil2"].join(",") },
      ALLOWED
    );
    expect(r.ok && r.req.channels?.length).toBe(MAX_CHANNELS_PER_REQUEST);
    expect(r.ok && r.req.channels?.every((c) => ALLOWED.includes(c))).toBe(true);
  });

  it("指定的频道全部不合法时不回退到全部默认频道", () => {
    const tg = normalizeSearchParams({ kw: "a", src: "tg", channels: "evil" }, ALLOWED);
    expect(tg.ok && tg.noChannelsLeft).toBe(true);
    const all = normalizeSearchParams({ kw: "a", src: "all", channels: "evil" }, ALLOWED);
    expect(all.ok && all.req.src).toBe("plugin");
  });

  it("ext 只接受 JSON 对象（字符串或对象形式）", () => {
    expect(normalizeSearchParams({ kw: "a", ext: "{bad" }, ALLOWED).ok).toBe(false);
    expect(normalizeSearchParams({ kw: "a", ext: "[1]" }, ALLOWED).ok).toBe(false);
    const r = normalizeSearchParams({ kw: "a", ext: { __deep_search: false } }, ALLOWED);
    expect(r.ok && r.req.ext).toEqual({ __deep_search: false });
  });
});
