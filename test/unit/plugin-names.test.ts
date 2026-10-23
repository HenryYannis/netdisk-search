import { describe, it, expect } from "vitest";
import { ALL_PLUGIN_NAMES } from "../../config/plugins";

describe("ALL_PLUGIN_NAMES", () => {
  it("has the 6 active plugins, no duplicates", () => {
    expect([...ALL_PLUGIN_NAMES]).toEqual([
      "pansearch",
      "melost",
      "quark4k",
      "ouge",
      "yunso",
      "dyyjv",
    ]);
    expect(new Set(ALL_PLUGIN_NAMES).size).toBe(ALL_PLUGIN_NAMES.length);
  });
  it("no longer lists wanou (duplicate of ouge, removed 2026-10-23)", () => {
    expect(ALL_PLUGIN_NAMES as readonly string[]).not.toContain("wanou");
  });
});
