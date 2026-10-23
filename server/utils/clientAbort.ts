import type { H3Event } from "h3";

/**
 * 客户端断开信号：响应在写完之前连接就关闭了 → abort。
 *
 * 按 Node 文档推荐的方式监听 `res` 的 'close'（而不是 `req` 的 'close'：
 * 新版 Node 里 req 读完 body 就会 close，POST 场景下会误判/漏判）。
 */
export function getClientAbortSignal(event: H3Event): AbortSignal | undefined {
  const res = event.node?.res;
  if (!res || typeof res.on !== "function") return undefined;
  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });
  return controller.signal;
}
