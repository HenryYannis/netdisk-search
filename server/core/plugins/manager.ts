import type { SearchResult } from "../types/models";

/** 插件请求超时的上下限（SearchService 已钳制，这里给插件自己兜底用同一组数） */
export const PLUGIN_TIMEOUT_MIN_MS = 3000;
export const PLUGIN_TIMEOUT_MAX_MS = 15000;

/** 把任意输入钳制成合法超时（毫秒）：非法/缺省用 fallback，再夹到 [3s, 15s] */
export function clampPluginTimeout(value: unknown, fallback: number): number {
  const n = Number(value);
  const v = Number.isFinite(n) && n > 0 ? n : fallback;
  return Math.min(PLUGIN_TIMEOUT_MAX_MS, Math.max(PLUGIN_TIMEOUT_MIN_MS, v));
}

/** 插件内取本次请求的超时（ext.__plugin_timeout_ms，已由 SearchService 钳制） */
export function pluginTimeout(ext: Record<string, any> | undefined, fallback = 8000): number {
  return clampPluginTimeout(ext?.__plugin_timeout_ms, fallback);
}

/** 插件内取取消信号（超时或客户端断开时 abort），传给每一个 ofetch / fetchWithRetry */
export function pluginSignal(ext: Record<string, any> | undefined): AbortSignal | undefined {
  const s = ext?.signal;
  return s && typeof s === "object" && typeof s.aborted === "boolean" ? s : undefined;
}

export interface AsyncSearchPlugin {
  name(): string;
  priority(): number;
  /**
   * 搜索。约定：
   * - 网络/HTTP 错误要 throw（SearchService 据此计入熔断与 warnings）；
   * - 只有"上游正常但确实没结果"才返回 []；
   * - 把 ext.signal 传给所有网络请求。
   */
  search(
    keyword: string,
    ext?: Record<string, any>
  ): Promise<SearchResult[]>;
  skipServiceFilter(): boolean;
}

export class BaseAsyncPlugin implements AsyncSearchPlugin {
  private pluginName: string;
  private pluginPriority: number;

  constructor(name: string, priority: number) {
    this.pluginName = name;
    this.pluginPriority = priority;
  }

  name(): string {
    return this.pluginName;
  }
  priority(): number {
    return this.pluginPriority;
  }
  skipServiceFilter(): boolean {
    return false;
  }

  async search(
    _keyword: string,
    _ext?: Record<string, any>
  ): Promise<SearchResult[]> {
    return [];
  }
}

// 全局注册表（与 Go 侧一致的语义）
const globalRegistry = new Map<string, AsyncSearchPlugin>();

export function registerGlobalPlugin(plugin: AsyncSearchPlugin) {
  if (!plugin) return;
  const name = plugin.name();
  if (!name) return;
  globalRegistry.set(name, plugin);
}

export function getRegisteredPlugins(): AsyncSearchPlugin[] {
  return Array.from(globalRegistry.values());
}

export class PluginManager {
  private plugins: AsyncSearchPlugin[] = [];

  registerPlugin(plugin: AsyncSearchPlugin) {
    this.plugins.push(plugin);
  }
  registerAllGlobalPlugins() {
    for (const p of getRegisteredPlugins()) this.registerPlugin(p);
  }
  getPlugins(): AsyncSearchPlugin[] {
    return this.plugins;
  }
}
