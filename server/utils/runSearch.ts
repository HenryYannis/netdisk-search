import type { H3Event } from "h3";
import { createError, sendError } from "h3";
import { getOrCreateSearchService } from "../core/services";
import type { GenericResponse } from "../core/types/models";
import { getClientAbortSignal } from "./clientAbort";
import { normalizeSearchParams } from "./searchParams";

/** GET / POST /api/search 共用：参数校验 → 搜索 → 统一响应 */
export async function runSearch(event: H3Event, raw: Record<string, unknown>) {
  const config = useRuntimeConfig();
  const service = getOrCreateSearchService(config);

  const allowed = [
    ...((config.defaultChannels as string[]) || []),
    ...((config.priorityChannels as string[]) || []),
  ];
  const parsed = normalizeSearchParams(raw, allowed);
  if (!parsed.ok) {
    return sendError(
      event,
      createError({ statusCode: parsed.status, statusMessage: parsed.message })
    );
  }
  const req = parsed.req;

  if (parsed.noChannelsLeft) {
    const empty: GenericResponse<{ total: number }> = {
      code: 0,
      message: "success",
      data: { total: 0 },
    };
    return empty;
  }

  const signal = getClientAbortSignal(event);

  const { response: result, warnings } = await service.searchWithWarnings(
    req.kw,
    req.channels,
    req.conc,
    !!req.refresh,
    req.res,
    req.src,
    req.plugins,
    req.cloud_types,
    req.ext || {},
    signal
  );

  const resp: GenericResponse<typeof result> = {
    code: 0,
    message: warnings.length > 0 ? "partial_success" : "success",
    data: result,
  };
  if (warnings.length > 0) {
    (resp as any).warnings = warnings;
  }
  return resp;
}
