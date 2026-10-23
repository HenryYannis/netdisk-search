# 新增一个搜索源（插件）

参考实现：**`server/core/plugins/yunso.ts`**（约 70 行：一个 POST 请求 + 一个可单测的纯解析函数）。
两段式抓取（先搜列表、再抓详情页）可参考 `dyyjv.ts`。

## 1. 实现插件

在 `server/core/plugins/<name>.ts` 里继承 `BaseAsyncPlugin`：

```ts
import { ofetch } from "ofetch";
import { BaseAsyncPlugin, pluginSignal, pluginTimeout } from "./manager";
import type { SearchResult } from "../types/models";
import { extractLinksFromText, getLinkType, cleanHTML } from "./panLink";

/** 纯函数：上游响应 → SearchResult[]。单独导出，方便不联网单测 */
export function parseFooResponse(body: string, kw: string): SearchResult[] {
  /* ... */
}

export class FooPlugin extends BaseAsyncPlugin {
  constructor() {
    super("foo", 3); // 名称（全局唯一，小写）、优先级
  }

  override async search(keyword: string, ext?: Record<string, any>): Promise<SearchResult[]> {
    const kw = (keyword || "").trim();
    if (!kw) return [];
    const body = await ofetch<string>(`https://foo.example/search?q=${encodeURIComponent(kw)}`, {
      timeout: pluginTimeout(ext),  // 已由 SearchService 钳制到 3–15 秒
      signal: pluginSignal(ext),    // 必须传：超时 / 用户取消时真正中断请求
    });
    return parseFooResponse(body, kw);
  }
}
```

约定（`SearchService` 依赖这些行为）：

- **每个网络请求都传 `signal: pluginSignal(ext)`**（`ofetch` / `fetchWithRetry` 都支持）。不传的话，超时或前端取消后请求仍在后台跑。
- **网络 / HTTP 错误直接 `throw`**，不要 `.catch(() => [])`。只有"上游正常响应但确实没结果"才返回 `[]`。服务层据此计数熔断（连续 5 次失败停用 5 分钟）并在响应里返回 `warnings`。多镜像的源：全部镜像失败才抛。
- 不要在插件里重试：超时由服务层统一控制，重试只会把一次失败拖长。
- 链接类型用 `panLink.ts` 的 `getLinkType` / `extractLinksFromText`，不要自己再写一份域名映射。
- **磁力链接会被服务层全部过滤**：只产出 magnet 的种子站不要加。
- 不要在插件实例上存每次请求的状态：插件是全局单例，会被并发请求共享。
- 不需要自己处理关键词变体：服务层最多会用 3 个变体调用 `search()`。

## 2. 注册

`server/core/services/index.ts` 的 `createPluginManager()` 里加一行（构造抛错只跳过这一个插件，不影响启动）：

```ts
import { FooPlugin } from "../plugins/foo";
// ...
safeRegister("foo", () => new FooPlugin());
```

## 3. 加入前端可选列表

`config/plugins.ts` 的 `ALL_PLUGIN_NAMES` 里加上 `"foo"`。前端设置面板、默认启用列表都读这里；前端对每个启用的插件各发一个 `GET /api/search?src=plugin&plugins=foo`。

## 4. 测试

- 在 `test/unit/plugin-foo.test.ts` 用一段真实响应裁剪出的 fixture 测解析函数（参考 `test/unit/plugin-yunso.test.ts`）。
- `npx vitest run`
- 本地 `npm run dev` 后试一下：`curl 'http://localhost:4000/api/search?kw=测试&src=plugin&plugins=foo'`，`GET /api/health` 的 `plugins` 里应出现 `foo`。

## 下线一个源

删掉插件文件、`index.ts` 里的 `safeRegister`、`config/plugins.ts` 里的名字，以及相关测试。用户本地保存的设置里残留的旧名字会被前端自动忽略。
