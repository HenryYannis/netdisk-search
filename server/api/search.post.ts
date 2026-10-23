import { defineEventHandler, readBody } from "h3";
import { requireSearchAuth } from "../utils/requireAuth";
import { runSearch } from "../utils/runSearch";

/** POST 与 GET 走完全相同的参数校验（kw ≤200、conc 1–16、频道白名单 ≤8） */
export default defineEventHandler(async (event) => {
  requireSearchAuth(event);
  let body: unknown = null;
  try {
    body = await readBody(event);
  } catch {
    body = null;
  }
  const raw = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  return runSearch(event, raw);
});
