/**
 * 增强的 fetch 工具函数
 * 提供重试机制、超时控制和统一错误处理
 */

import { ofetch } from "ofetch";
import type { $Fetch } from "ofetch";

function normalizeError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === "string") return new Error(error);
  return new Error("Unknown error");
}

export interface FetchWithRetryOptions {
  /** 最大重试次数，默认 3 */
  maxRetries?: number;
  /** 重试间隔基础时间（毫秒），默认 1000 */
  baseDelay?: number;
  /** 是否使用指数退避，默认 true */
  exponentialBackoff?: boolean;
  /** 超时时间（毫秒），默认 8000 */
  timeout?: number;
  /** 请求失败时是否记录警告日志，默认 true */
  logWarnings?: boolean;
  /** 取消信号，客户端断开时中止请求和重试 */
  signal?: AbortSignal;
}

/**
 * 指数退避延迟（可被 signal 打断）
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Request was cancelled", "AbortError"));
      return;
    }
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException("Request was cancelled", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * 带重试机制的 fetch 函数
 *
 * @param url 请求 URL
 * @param options fetch 选项
 * @param retryOptions 重试配置
 * @returns 响应数据
 *
 * @example
 * ```typescript
 * const data = await fetchWithRetry('https://api.example.com/data', {}, {
 *   maxRetries: 3,
 *   timeout: 5000
 * });
 * ```
 */
export async function fetchWithRetry<T = any>(
  url: string,
  options: RequestInit = {},
  retryOptions: FetchWithRetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    exponentialBackoff = true,
    timeout = 8000,
    logWarnings = true,
    signal,
  } = retryOptions;

  const fetcher: $Fetch = ofetch.create({
    timeout,
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      ...options.headers,
    },
    ...options,
  });

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // 客户端断开时立即中止，不再重试
    if (signal?.aborted) {
      throw new DOMException("Request was cancelled", "AbortError");
    }

    try {
      // signal 必须传给底层请求，否则超时/客户端断开后请求仍在后台跑
      const result = await fetcher<T>(url, signal ? { signal } : {});
      return result;
    } catch (error) {
      lastError = error as Error;

      // 如果是取消信号导致的错误，直接抛出不再重试
      if (signal?.aborted) {
        throw lastError;
      }

      // 4xx 客户端错误不可恢复，立即放弃不做无意义重试
      if ((error as any)?.statusCode >= 400 && (error as any)?.statusCode < 500) {
        throw lastError;
      }

      // 如果是最后一次尝试，抛出错误
      if (attempt === maxRetries) {
        throw lastError;
      }

      // 计算延迟时间
      const delay = exponentialBackoff
        ? baseDelay * Math.pow(2, attempt)
        : baseDelay;

      await sleep(delay, signal);
    }
  }

  // 理论上不会到达这里，但为了类型安全
  throw lastError;
}

/**
 * 安全执行异步操作，捕获错误并返回默认值
 *
 * @param operation 异步操作函数
 * @param fallback 失败时的默认值
 * @param errorLogger 错误日志记录器
 * @returns 操作结果或默认值
 *
 * @example
 * ```typescript
 * const data = await safeExecute(
 *   () => fetchWithRetry('https://api.example.com/data'),
 *   [],
 *   logger
 * );
 * ```
 */
export async function safeExecute<T>(
  operation: () => Promise<T>,
  fallback: T,
  errorLogger?: { error?: (message: string, error: Error) => void }
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    errorLogger?.error?.("Operation failed", normalizeError(error));
    return fallback;
  }
}
