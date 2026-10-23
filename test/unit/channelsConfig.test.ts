import { describe, it, expect } from "vitest";
import channelsConfig from "../../config/channels.json";

describe("config/channels.json", () => {
  it("defaultChannels 无重复且非空", () => {
    const list = channelsConfig.defaultChannels;
    expect(list.length).toBeGreaterThan(0);
    expect(new Set(list).size).toBe(list.length);
  });

  it("priorityChannels 都在 defaultChannels 里（前端只发送 defaultChannels）", () => {
    const all = new Set(channelsConfig.defaultChannels);
    for (const c of channelsConfig.priorityChannels) expect(all.has(c)).toBe(true);
  });

  it("2026-10-23 体检下线的失效频道不再出现", () => {
    const removed = ["tgsearchers3", "share_aliyun", "yunpanqk", "NewQuark", "alyp_4K_Movies", "BaiduCloudDisk"];
    const all = new Set([...channelsConfig.defaultChannels, ...channelsConfig.priorityChannels]);
    for (const c of removed) expect(all.has(c)).toBe(false);
  });

  it("频道名符合 Telegram 用户名格式", () => {
    for (const c of channelsConfig.defaultChannels) expect(c).toMatch(/^[A-Za-z][A-Za-z0-9_]{3,31}$/);
  });
});
