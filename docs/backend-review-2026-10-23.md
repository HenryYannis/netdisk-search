# PanHub backend review — 2026-10-23

Scope: `server/**` (api, middleware, routes, utils, core), plus the parts of `nuxt.config.ts` and `composables/useSearch.ts` that affect the backend. This was a read-only review. No code was changed and no server was touched. Line numbers refer to the current working tree. h3 is 1.15.11 (from package-lock).

**Correction to the brief:** the hot-search GET endpoints do **not** throw when Turso is unset. `hot-searches.get.ts:14-21`, `hot-calendar.get.ts:17-24` and `hot-days.get.ts:17-24` all check `service.isReady()` and return empty data with `configured:false`. `POST /api/hot-searches` buffers terms and then drops them quietly (`hotSearchService.ts:122-124`). No fix is needed there.

---

## HIGH

### H1. SSRF in the link checker: the UC branch fetches the URL the user supplies
- `core/services/linkChecker.ts:344-362`: `detectPlatform()` runs unanchored regexes over the **whole URL string**, so `/drive\.uc\.cn/` also matches a query string or fragment.
- `linkChecker.ts:1117-1119` → `checkUC(item.url)` → `linkChecker.ts:832-841` → `httpRequest(url)` at `:112-133`. That request uses `redirect: "follow"` and an unbounded `res.text()`.
- **Impact:** `POST /api/check {"links":["http://172.17.0.1:2375/version#drive.uc.cn"]}` (also `http://127.0.0.1:4000/...?drive.uc.cn`, cloud metadata IPs, and anything on the host/Docker network) gets fetched from inside the container. The response leaks back to the caller in three ways:
  - `status` tells 404 → `bad`, keyword hit → `ok`/`locked`, and otherwise `uncertain`.
  - `reason` carries `respSummary` → `errorChain` (`:96-110, :146`), e.g. `ECONNREFUSED` vs a timeout, which is enough for an internal port scan.
  - A huge or slow response is read fully into memory (768 MB container).
- The only gate is `requireSearchAuth`, which does nothing when `SEARCH_PASSWORD` is unset.
- **Fix:**
  - Parse with `new URL()`, require `https:`, and match `hostname` exactly per platform (`=== "drive.uc.cn"`, `endsWith(".quark.cn")`, …) in `detectPlatform`.
  - In `httpRequest`, use `redirect: "manual"` (or re-check the host after each hop) and cap the body size (stream it and stop at ~512 KB).
  - Never return `errorChain` text to clients. Log it instead.

### H2. The global rate limiter is keyed on path **plus query string**, so it is bypassable and can be used to exhaust memory
- `middleware/rateLimiter.ts:108,116`: `event.path` in h3 1.x includes `?query`, so `key = ip:/api/search?kw=…&channels=…&ext=…`.
- **Impact:**
  - Every fan-out request from the frontend already has a unique URL, so the 60/min `/api/search` limit is effectively never hit. An attacker gets around any limit (including `/api/check` 15/min and `/api/img`) by adding `&x=<random>`.
  - Each key can be several KB (kw + ext JSON + channel list). `DEFAULT_MAX_STORE_ENTRIES = 100_000` (`:41`) works out to hundreds of MB of keys under a 512 MB heap.
  - Once the store is full, the limiter **fails open for everyone** (`:120-127`).
  - The unit tests use bare paths only, so none of this is caught.
- **Fix:**
  - Key on the pathname only: `getRequestURL(event).pathname` or `path.split("?")[0]`. Also use it for the `/api/health` check at `:110`.
  - Lower the cap to ~10k entries. When it is full, evict the oldest entries rather than letting everyone through.
  - Re-tune the search limit to the real fan-out. One search is 8 plugin requests + ceil(69 channels / 2) = 35 TG batches ≈ **43 requests**, so 60/min would block a user's second search. Use something like 200–300/min, or rate-limit "searches" (unique kw) instead of raw requests.

### H3. Password brute-force lockout is bypassable through `X-Forwarded-For`
- `api/auth/unlock.post.ts:10-16` takes the **first** XFF entry. Cloudflare *appends* the real IP to any XFF the client sends, so the first entry is attacker-chosen. Rotating it gives unlimited password guesses, and the 5-tries/5-min lockout never applies.
- `utils/unlockRateLimiter.ts:16,38-45`: the `attempts` Map is never pruned. An IP with 1–4 failures stays in it forever, and with spoofed XFF that growth has no limit.
- **Fix:**
  - Reuse `getClientIp` from `middleware/rateLimiter.ts:61-78` (`CF-Connecting-IP` when `TRUST_PROXY=1`).
  - Give entries a TTL (e.g. reset the count after 15 min) and prune them periodically or cap the Map's size.

### H4. The global `"/**": { swr: 3600 }` caches every unique URL in Nitro's in-memory cache
- `nuxt.config.ts:69`. No `nitro.storage` is configured, so the route cache uses Nitro's default in-memory storage. Each cache key includes the full URL with its query.
- **Impact:**
  - `/?q=<random>` and `/anything?utm=<random>` each render SSR HTML and keep it for an hour. A crawler or a simple loop grows memory without limit until the 768 MB container OOMs. Cloudflare does not cache HTML by default, so every request reaches the origin.
  - The rule also covers `/api/health`, so the Docker healthcheck (`docker-compose.yml:38`) reads a cached 200 for up to an hour and can't detect a hung process.
  - It also covers `/api/hot-calendar` and `/api/hot-days`.
- **Fix:**
  - Remove the global SWR rule. The pages are client-rendered search shells and cheap to SSR.
  - Alternatively, configure `nitro.storage.cache` with an LRU driver (unstorage `lru-cache`, `max` ≈ 200).
  - Add `"/api/health": { cache: false }`. Put long immutable `Cache-Control` headers on `/_nuxt/**` instead.

### H5. One request can trigger unbounded upstream fan-out (amplification and resource exhaustion)
- **Channel count is uncapped:**
  - `api/search.get.ts:68` (`parseList(q.channels)`) and `api/search.post.ts:41` accept any number of channels, limited only by URL or body size.
  - For each channel, `searchTG` (`core/services/searchService.ts:360-386`) fetches t.me, plus an r.jina.ai fallback (`core/services/tg.ts:41-51`). When there are fewer than 3 hits, it does a deep pass of up to 8 pages per channel (`TG_DEEP_CHANNEL_LIMIT=160` ÷ 20).
  - One POST with 1,000 channels means thousands of outbound fetches and cheerio parses on a 1-CPU box.
- **Timeout is client-controlled with no upper bound:**
  - `searchService.ts:307-313` and `:443-449` use `Math.max(3000, ext.__plugin_timeout_ms)`, and every plugin uses the same value as its ofetch timeout (`melost.ts:100-103`, `yunso.ts:51-54`, `u3c3.ts:61-64`, `dyyjv.ts:150-153`, `ouge.ts:109-112`, `wanou.ts:103-106`, `quark4k.ts:66-69`).
  - `ext={"__plugin_timeout_ms":1e9}` therefore holds sockets and closures open for as long as the upstream is slow.
- **POST is less validated than GET:** POST has no `kw` length cap (GET caps it at 200, `search.get.ts:40`), and `conc` is not validated.
- **Fix:**
  - Clamp the timeout to `[3000, 15000]` in one place (the service) and pass the clamped value down.
  - Cap channels per request (the frontend sends 2, so ≤ 8 is generous). Ideally only accept channels from `config/channels.json` `defaultChannels`.
  - Apply the same `kw` ≤ 200 and integer `conc` 1–16 validation to POST, or delete POST if only GET is used: the frontend only calls GET, `useSearch.ts:171`.

---

## MEDIUM

### M1. Timeouts and client aborts don't cancel plugin work
- No plugin reads `ext.signal`. I grepped `signal` in all 8 registered plugins and found no use.
- `withTimeout` (`searchService.ts:543-564`) resolves with `[]` and aborts a controller that nothing is listening to, so the real fetches keep running in the background.
- The pansearch worst case: `getBuildId` and the data fetch each go through `fetchWithRetry` with `maxRetries:2`, an 8 s timeout and 1 s/2 s backoff (`pansearch.ts:224-234, 265-275`). That is about 27 s per call, ~54 s total, repeated for up to 3 keyword variants.
- When the frontend auto-pauses at 50 results and aborts, the server keeps scraping.
- **Fix:** pass `signal: ext?.signal` into every plugin's `ofetch` call and into `fetchWithRetry` (it already supports `signal`, `fetch.ts:47,79-91`). Drop pansearch's retries to 0–1.

### M2. Plugin failures and timeouts are recorded as successes, so the circuit breaker never trips
- Every plugin swallows its own errors (`.catch(() => undefined)` → `[]`, e.g. `melost.ts:144`, `yunso.ts:69`, `u3c3.ts:76`, `pansearch.ts:234`).
- `withTimeout` returns the fallback instead of throwing.
- So `searchService.ts:496-497` calls `recordSuccess` even when the upstream is dead. `PluginHealthChecker` (`pluginHealth.ts:73-97`) never opens, and `warnings`/`partial_success` never show plugin outages.
- **Impact:** a dead source costs the full timeout × up to 3 variants on every search and gives no signal in logs or the API.
- **Fix:** have `withTimeout` reject with a `TimeoutError`, or return `{timedOut:true}`, and count that as a failure. Let plugins rethrow network/HTTP errors and keep `[]` only for real empty results.

### M3. `u3c3` returns only magnet links, and every result is thrown away
- `core/plugins/u3c3.ts:33-41` emits only `magnet:` links. `searchService.ts:232-236` and `:623` strip magnets and drop results that end up with no links.
- **Impact:** every search spends 1–3 full HTML fetches plus regex parsing for zero output.
- The u3c3 checkbox in the UI is a no-op.
- **Fix:**
  - Remove `safeRegister("u3c3", …)` (`core/services/index.ts:61`) and the `"u3c3"` entry in `config/plugins.ts:13`.
  - Delete `u3c3.ts` and its half of `test/unit/plugin-yunso-u3c3.test.ts`.

### M4. pansearch keeps a stale `buildId` for up to an hour after the site redeploys
- `pansearch.ts:256-295` caches `buildId` for 1 h.
- After pansearch.me redeploys, `/_next/data/<old>/search.json` returns 404. `fetchWithRetry` throws right away on a 4xx (`fetch.ts:95-97`), `.catch(() => undefined)` swallows it (`pansearch.ts:234`), and the cache is never invalidated.
- **Impact:** pansearch silently returns nothing for up to 60 min after each upstream deploy.
- **Fix:** on a 404 or a non-JSON response, set `cachedBuildId = null`, refetch the build ID and retry once.

### M5. The link-check cache has no size limit, and its circuit breaker can be tripped by attackers
- **Unbounded cache:**
  - `linkChecker.ts:1048` is a plain `Map` with TTLs up to 24 h. That includes `unsupported` results for arbitrary junk URLs (`:1093-1095, :73-86`).
  - It is pruned only hourly (`:1256-1267`). Given H2's bypass, 50 unique 500-char URLs per request accumulate for a day.
- **Breaker can be poisoned:**
  - Any outcome whose reason starts with "请求失败" counts toward the per-platform breaker (`:1162-1167`), and 3 strikes disable that platform for **all users** for 5 min.
  - Attacker-supplied UC URLs pointing at a blackhole host (until H1 is fixed) trip it.
  - A malformed Baidu URL whose `item.url` is reused as a `referer` header can also make `fetch` throw (`:852-855, :866-869`), and 115 interpolates the raw password into `referer` (`:981`).
- **Fix:**
  - Use `MemoryCache` with `maxSize` (~5,000) and don't cache `others`.
  - Count breaker failures only for requests to the fixed API hosts.
  - Build `referer` from the parsed and normalized share URL, never the raw input.

### M6. Client-disconnect detection doesn't follow Node's documented pattern, and it is copy-pasted
- `api/search.get.ts:4-21` and `api/search.post.ts:4-21` are identical.
- `req.writableEnded` does not exist on `IncomingMessage`, so the second clause of the condition at `:14` is always false.
- Watching `req` `'close'` is the old pattern. On modern Node, `req` closes when its body has been read, so on POST (after `readBody`) the check is unreliable either way.
- **Fix:** move it to one helper in `server/utils/`. Use `event.node.res.on("close", () => { if (!event.node.res.writableEnded) controller.abort(); })`.

### M7. The TG cache key ignores `__deep_search`
- `searchService.ts:296` builds the key from kw + channels only.
- The frontend sends `__deep_search:false` for every batch except the last (`useSearch.ts:256-258`). A shallow result with 1–2 hits is cached (`:388`) and later served to a deep-allowed request for the same channels, which then never goes deep for the 30-min TTL.
- **Fix:** add `deep ? ":deep" : ""` to the key, or only cache when the deep decision doesn't apply (results ≥ 3).

---

## LOW

### L1. Dead code worth deleting (~900 lines)
- **Unregistered plugins:** `core/plugins/susu.ts`, `pan666.ts`, `torrentgalaxy.ts`, `x1337x.ts`, `solidtorrents.ts` (~670 lines). The last three are magnet-only, so they could never return results; see `index.ts:20-21`.
- **`wx-auth-sdk`:** listed in `package.json` dependencies but not imported anywhere in the app or server code.
- **Mini-program auth path:** `utils/auth.ts:44-46, 55-63` (`MP_CLIENT_SECRET` shared secret, noted in-code as "上线初期放开，后续收口"). Remove it if the mini-program isn't live. Separately, an invalid `Bearer` header returns `false` before the shared-secret check (`:52-54`).
- **`setMainCacheKey` / `setCurrentKeyword`:** concurrent requests mutate these on the **shared singleton** plugin instances (`searchService.ts:452-453`, `manager.ts:154-159`). No plugin reads them, so delete them before someone starts relying on that racy state.
- **Unused helpers:** `safeExecuteAll`, `createPersistentFetcher` (`core/utils/fetch.ts:164-190`), `getSearchServiceStats` (`core/services/index.ts:113-122`), and the `images` field, which no plugin sets (`searchService.ts:632`).

### L2. One-character keywords search unrelated terms
- `searchService.ts:459-462` uses `queries = [keyword, "电影", "movie", "1080p"]` when the kw is ≤ 1 character.
- A search for "我" can return generic movie results, and they are cached under "我".
- **Fix:** search only `[keyword]`, or reject 1-character keywords with a hint.

### L3. TG parser correctness
- `tg.ts:183-185`: one password regex runs over the whole message for **every** link, so a Baidu `提取码` gets attached to the Quark/Aliyun links in the same post. The link checker then injects it as `pwd` (`linkChecker.ts:190-195`).
- `tg.ts:232`: `new Date(dateTitle).toISOString()` throws `RangeError` on a bad date. That aborts `parseChannelPage` and loses the whole page (it is caught upstream as `[]`).
- **Fix:** pick the password nearest each URL (the text right after it). Guard the date with `isNaN`.

### L4. Douban: cache stampede, no negative caching, and error text leaked to clients
- `doubanHotService.ts:234-260` has no in-flight dedupe. Concurrent cold requests each scrape (Top250 is 4 pages + 1.5 s of sleeps).
- When Douban blocks, nothing is cached, so every page view retries.
- `api/douban-hot.get.ts:27-30` echoes the upstream `error.message` to clients.
- **Fix:** add an inflight `Map<string, Promise>`, cache an empty or failed result for ~5 min, and return a generic message.

### L5. `/api/img` edge cases
- `api/img.get.ts:9`: `getQuery` already decodes, and the extra `decodeURIComponent` throws `URIError` on a literal `%`. It runs outside the `try`, so the client gets a 500.
- No response size cap or content-type check. ofetch buffers the whole body.
- Redirects are followed by default. The host allowlist itself (`:4,22-29`) is tight.
- **Fix:** drop the second decode, set `redirect: "manual"`, check `content-type` starts with `image/`, and cap at ~5 MB.

### L6. Cache-size estimates are optimistic for a 768 MB container (and a deployment note)
- **Cache sizing:**
  - `memoryCache.ts:266-269` estimates an array as `length × size(first element)`.
  - `UnifiedCache` creates **two** namespaces at the default 64 MB estimate each (`unifiedCache.ts:57-67`, `memoryCache.ts:39-40`). That is a 128 MB budget by estimate, and the real V8 cost of small objects and strings is usually higher.
  - Next to the 512 MB heap (`Dockerfile` `--max-old-space-size=512`), consider 24–32 MB per namespace.
- **Port binding:**
  - `docker-compose.yml:8` publishes `4000:4000` on all interfaces while `TRUST_PROXY=1`.
  - If the host port is reachable from the internet, a direct request can spoof `CF-Connecting-IP` and bypass the limiter.
  - Bind `127.0.0.1:4000:4000` (the tunnel connects locally). Check the GitHub Actions `docker run` script too; I didn't see it.

---

## Suggested order of work
1. H1 (SSRF) and H3 (unlock IP): small, contained fixes.
2. H2 (limiter key) together with re-tuning the search limit.
3. H4 (drop the global SWR rule, uncache health).
4. H5 (clamp timeout and channels).
5. M1/M2 together (signal plumbing plus honest failure accounting), then M3/M4.
6. L1 cleanup in one "remove dead code" commit, updating the tests that import u3c3.
