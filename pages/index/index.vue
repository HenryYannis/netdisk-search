<template>
  <div class="home">
    <!-- SEO 标题（原英雄区已移除，介绍文案移至页脚） -->
    <h1 class="page-title">一键检索全网网盘资源</h1>

    <!-- 热搜词云 + 热搜趋势入口：暂时关闭（features.hotSearch=false），代码保留 -->
    <template v-if="FEATURES.hotSearch">
      <aside class="hero-aside">
        <ErrorBoundary message="热搜加载失败">
          <HotSearchSection ref="hotSearchRef" :on-search="quickSearch" />
        </ErrorBoundary>
      </aside>
      <div class="trends-entry">
        <NuxtLink to="/hot" class="trends-entry__link">
          <span class="trends-entry__icon">🔥</span>
          <span class="trends-entry__text">热搜趋势</span>
          <span class="trends-entry__hint">飙升榜 · 完整榜单</span>
          <span class="trends-entry__arrow">→</span>
        </NuxtLink>
      </div>
    </template>

    <!-- 搜索框 -->
    <SearchBox
      v-model="kw"
      :loading="searchState.loading"
      :paused="searchState.paused"
      :searched="searched"
      :placeholder="placeholder"
      @search="onSearch"
      @reset="fullReset"
      @pause="pauseSearch"
      @continue="handleContinueSearch" />

    <!-- 统计和过滤器 -->
    <div v-if="searched" class="stats-bar">
      <div class="stats-content">
        <div class="stats-main">
          <span class="stat-item">
            <span class="stat-label">结果</span>
            <span class="stat-value">{{ searchState.total }}</span>
          </span>
          <span class="stat-item">
            <span class="stat-label">用时</span>
            <span class="stat-value">{{ searchState.elapsedMs }}ms</span>
          </span>
          <span v-if="searchState.deepLoading && !searchState.paused" class="loading-indicator">
            <span class="pulse-dot"></span>
            <span class="loading-text">持续搜索中…</span>
          </span>
          <span v-if="searchState.paused" class="paused-indicator-bar">
            <span class="pause-icon">⏸</span>
            <span v-if="autoPausedAtLimit" class="paused-text">
              已找到 {{ searchState.total }} 条结果，可继续搜索更多
            </span>
            <span v-else class="paused-text">搜索已暂停</span>
          </span>
        </div>

        <!-- 平台过滤器 -->
        <div class="platform-filters" v-if="hasResults">
          <button
            :class="['filter-pill', { active: filterPlatform === 'all' }]"
            @click="filterPlatform = 'all'">
            全部 ({{ searchState.total }})
          </button>
          <button
            v-for="p in platforms"
            :key="p"
            :class="['filter-pill', { active: filterPlatform === p }]"
            @click="filterPlatform = p">
            {{ platformName(p) }} ({{ searchState.merged[p]?.length || 0 }})
          </button>
        </div>

        <!-- 排序选择器 -->
        <div class="sorter" v-if="hasResults">
          <select v-model="sortType" class="sort-select">
            <option value="default">默认排序</option>
            <option value="date-desc">最新发布</option>
            <option value="date-asc">最早发布</option>
            <option value="name-asc">名称 A→Z</option>
            <option value="name-desc">名称 Z→A</option>
          </select>
        </div>
      </div>
    </div>

    <!-- 搜索结果 -->
    <section v-if="hasResults" class="results-section">
      <div class="results-grid">
        <ResultGroup
          v-for="group in groupedResults"
          :key="group.type"
          :title="platformName(group.type)"
          :color="platformColor(group.type)"
          :icon="platformIcon(group.type)"
          :items="visibleSorted(group.items)"
          :expanded="filterPlatform !== 'all' || isExpanded(group.type)"
          :initial-visible="initialVisible"
          :can-toggle-collapse="false"
          @toggle="handleToggle(group.type)"
          @copy="copyLink" />
      </div>
    </section>

    <!-- 空状态：仅当搜索完全结束且无结果时显示，搜索进行中不显示 -->
    <section v-else-if="searched && !searchState.loading && !searchState.deepLoading && !searchState.paused" class="empty-state">
      <div class="empty-card">
        <div class="empty-icon">🔍</div>
        <h3>未找到相关资源</h3>
        <p>试试其他关键词，或检查设置中的搜索来源是否已启用</p>
        <div v-if="FEATURES.hotSearch && hotTerms.length > 0" class="empty-suggestions">
          <span class="empty-suggestions__label">大家都在搜：</span>
          <button
            v-for="term in hotTerms.slice(0, 5)"
            :key="term"
            class="empty-suggestions__tag"
            @click="quickSearch(term)">
            {{ term }}
          </button>
        </div>
      </div>
    </section>

    <!-- 错误提示 -->
    <section v-if="searchState.error" class="error-alert">
      <span class="error-icon">⚠️</span>
      <span>{{ searchState.error }}</span>
    </section>

    <!-- 豆瓣电影新片榜 - 搜索时隐藏 -->
    <section v-if="!searched" class="douban-hot-section">
      <ErrorBoundary message="豆瓣热榜加载失败">
        <DoubanHotSection ref="doubanHotRef" :on-search="quickSearch" />
      </ErrorBoundary>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from "vue";
import { PLATFORM_INFO } from "~/config/plugins";
import { FEATURES } from "~/config/features";

const config = useRuntimeConfig();
const apiBase = (config.public?.apiBase as string) || "/api";
const siteUrl = (config.public?.siteUrl as string) || "";
const route = useRoute();
const router = useRouter();

// 热搜组件引用
const hotSearchRef = ref<InstanceType<typeof HotSearchSection> | null>(null);
const doubanHotRef = ref<InstanceType<typeof DoubanHotSection> | null>(null);

// 页面加载时初始化热搜数据
onMounted(async () => {
  await nextTick();
  // 从 URL 读取搜索关键词
  const q = route.query.q;
  if (q && typeof q === "string") {
    kw.value = q;
    await doSearch();
  }
  if (doubanHotRef.value) await doubanHotRef.value.init();
  if (FEATURES.hotSearch) {
    if (hotSearchRef.value) await hotSearchRef.value.init();
    fetchHotTerms();
  }
});

// SEO 元数据（带 q 参数时标题/描述包含关键词，SSR 输出）
const SITE_NAME = "小宝网盘搜索引擎";
const HOME_TITLE = "小宝网盘搜索引擎 - 免费网盘资源搜索｜夸克、阿里云盘、百度网盘一键搜";
const HOME_DESC =
  "免费的网盘搜索引擎，一键搜索夸克网盘、阿里云盘、百度网盘、115、迅雷云盘的电影、剧集、动漫、软件、学习资料分享链接，实时聚合、自动去重、无广告。";
const seoTerm = computed(() => {
  const q = route.query.q;
  return typeof q === "string" ? q.trim().slice(0, 50) : "";
});
const seoTitle = computed(() =>
  seoTerm.value
    ? `${seoTerm.value} 网盘资源 - 夸克/阿里云盘/百度网盘 · ${SITE_NAME}`
    : HOME_TITLE
);
const seoDesc = computed(() =>
  seoTerm.value
    ? `「${seoTerm.value}」的网盘资源搜索结果：聚合夸克网盘、阿里云盘、百度网盘、115、迅雷云盘的公开分享链接，实时更新、自动去重。`
    : HOME_DESC
);
const ogImage = siteUrl ? `${siteUrl}/og.png` : "/og.png";
useSeoMeta({
  title: seoTitle,
  titleTemplate: "%s",
  description: seoDesc,
  ogTitle: seoTitle,
  ogDescription: seoDesc,
  ogType: "website",
  ogSiteName: SITE_NAME,
  ogUrl: siteUrl ? `${siteUrl}/` : "/",
  ogImage,
  twitterCard: "summary_large_image",
  twitterTitle: seoTitle,
  twitterDescription: seoDesc,
  twitterImage: ogImage,
});

useHead({
  link: [{ rel: "canonical", href: siteUrl ? `${siteUrl}/` : "/" }],
  meta: [
    {
      name: "keywords",
      content:
        "小宝网盘搜索引擎, 网盘搜索引擎, 网盘搜索, 夸克网盘搜索, 阿里云盘搜索, 百度网盘资源搜索, 115 网盘搜索, 迅雷云盘, 网盘资源, 盘搜",
    },
  ],
  script: [
    {
      type: "application/ld+json",
      innerHTML: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "小宝网盘搜索引擎",
        url: siteUrl || "",
        potentialAction: {
          "@type": "SearchAction",
          target: (siteUrl || "") + "/?q={search_term_string}",
          "query-input": "required name=search_term_string",
        },
      }),
    },
  ],
});

// 搜索相关状态
const kw = ref("");
const placeholder =
  "搜索网盘资源，支持百度云、阿里云盘、夸克网盘、115网盘、迅雷云盘、天翼云盘、123网盘、移动云盘、UC网盘等";

// 排序和过滤
const sortType = ref<"default" | "date-desc" | "date-asc" | "name-asc" | "name-desc">("default");
const filterPlatform = ref<string>("all");
const initialVisible = 3;
const expandedSet = ref<Set<string>>(new Set());

// 空状态热搜推荐
const hotTerms = ref<string[]>([]);

async function fetchHotTerms() {
  try {
    const res = await fetch("/api/hot-searches?limit=5");
    const data = await res.json();
    if (data.code === 0) {
      hotTerms.value = data.data.hotSearches.map((s: any) => s.term);
    }
  } catch {}
}

// 使用搜索 composable
const {
  state: searchState,
  searched,
  performSearch,
  resetSearch,
  copyLink,
  pauseSearch,
  continueSearch,
  hasResults,
  autoPausedAtLimit,
} = useSearch();
const { settings, loadSettings } = useSettings();
const auth = useAuth();
const { checkSearchAuth } = useWxAuth();
const requestUnlock = inject<(onSuccess?: () => void) => void>("requestUnlock");

// 获取搜索选项（使用最新的用户设置）
function getSearchOptions() {
  return {
    apiBase,
    keyword: kw.value,
    settings: {
      enabledPlugins: settings.value.enabledPlugins,
      enabledTgChannels: settings.value.enabledTgChannels,
      concurrency: settings.value.concurrency,
      pluginTimeoutMs: settings.value.pluginTimeoutMs,
    },
  };
}

// 记录热搜词
async function recordHotSearch(keyword: string) {
  const term = keyword?.trim();
  if (!term) return;
  try {
    await $fetch(`${apiBase}/hot-searches`, { method: "POST", body: { term } });
  } catch (_e) {}
}

// 执行实际搜索逻辑（供 requestUnlock 回调复用）
async function doSearch() {
  if (!kw.value || searchState.value.loading) return;
  loadSettings();
  const keyword = kw.value.trim();
  if (FEATURES.hotSearch) recordHotSearch(keyword);
  // 同步搜索词到 URL
  if (router) {
    router.replace({ query: { q: keyword } });
  }
  await performSearch({
    ...getSearchOptions(),
    onAuthRequired: requestUnlock ?? undefined,
  });
}

// 搜索执行
async function onSearch() {
  if (!kw.value) return;
  // 暂停状态下发起新搜索：放弃旧任务重新开始（想继续旧搜索请点"继续"按钮）
  if (searchState.value.paused) {
    resetSearch();
  }
  if (searchState.value.loading) return;
  if (auth.locked.value && requestUnlock) {
    requestUnlock(doSearch);
    return;
  }
  // 微信公众号认证（强制：未认证先完成关注+验证码验证，成功后自动继续搜索）
  const authed = await checkSearchAuth();
  if (!authed) return;
  await doSearch();
}

// 快速搜索
async function quickSearch(keyword: string) {
  kw.value = keyword;
  await onSearch();
}

// 继续搜索（从暂停处继续）
async function handleContinueSearch() {
  if (!searchState.value.paused) return;
  if (auth.locked.value && requestUnlock) {
    requestUnlock(async () => {
      loadSettings();
      await continueSearch({
        ...getSearchOptions(),
        onAuthRequired: requestUnlock ?? undefined,
      });
    });
    return;
  }
  loadSettings();
  await continueSearch({
    ...getSearchOptions(),
    onAuthRequired: requestUnlock ?? undefined,
  });
}

// 完全重置 - 清空输入框、结果、状态，并刷新页面
async function fullReset() {
  // 清空输入框和重置状态
  kw.value = "";
  sortType.value = "default";
  filterPlatform.value = "all";
  expandedSet.value = new Set();
  resetSearch();
  // 清除 URL 参数
  if (router) {
    router.replace({ query: {} });
  }
  // 刷新页面以恢复初始状态（包括豆瓣电影）
  await nextTick();
  if (doubanHotRef.value) await doubanHotRef.value.init();
}

// 平台信息
const platformIcon = (t: string): string => PLATFORM_INFO[t]?.icon || "📦";
const platformName = (t: string): string => PLATFORM_INFO[t]?.name || t;
const platformColor = (t: string): string => PLATFORM_INFO[t]?.color || "#9ca3af";

// 获取所有有结果的平台类型
const platforms = computed(() => {
  const m = searchState.value?.merged ?? {};
  return Object.keys(m).filter((type) => (m[type]?.length ?? 0) > 0);
});

const groupedResults = computed(() => {
  const list: Array<{ type: string; items: any[] }> = [];
  const source =
    filterPlatform.value === "all"
      ? searchState.value.merged
      : { [filterPlatform.value]: searchState.value.merged[filterPlatform.value] || [] };
  for (const type of Object.keys(source)) {
    if (!source[type]?.length) continue;
    list.push({ type, items: source[type] || [] });
  }
  return list;
});

// 展开/收起
function isExpanded(type: string) {
  return expandedSet.value.has(type);
}

function handleToggle(type: string) {
  filterPlatform.value = type;
}

function visibleItems(type: string, items: any[]) {
  return isExpanded(type) ? items : items.slice(0, initialVisible);
}

// 排序
function sortItems(items: any[]) {
  const arr = [...items];
  switch (sortType.value) {
    case "date-desc":
      return arr.sort(
        (a, b) =>
          new Date(b.datetime || "1970-01-01").getTime() -
          new Date(a.datetime || "1970-01-01").getTime()
      );
    case "date-asc":
      return arr.sort(
        (a, b) =>
          new Date(a.datetime || "1970-01-01").getTime() -
          new Date(b.datetime || "1970-01-01").getTime()
      );
    case "name-asc":
      return arr.sort((a, b) =>
        String(a.note || "").localeCompare(String(b.note || ""), "zh-CN")
      );
    case "name-desc":
      return arr.sort((a, b) =>
        String(b.note || "").localeCompare(String(a.note || ""), "zh-CN")
      );
    default:
      return items;
  }
}

function visibleSorted(items: any[]) {
  return sortItems(items);
}
</script>

<style scoped>
.home {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* 英雄区域 + 热门搜索（frontend-design: editorial + industrial） */
.page-title {
  margin: 8px 0 14px;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 0.01em;
}

.hero-aside {
  flex-shrink: 0;
  width: 340px;
}

/* 嵌入时去除热门搜索的独立卡片感 */
.hero-aside :deep(.tag-cloud-wrap),
.hero-aside :deep(.loading-state),
.hero-aside :deep(.tag-cloud-placeholder) {
  background: transparent;
  border: none;
  border-radius: 0;
  box-shadow: none;
}

.hero-aside :deep(.tag-cloud-wrap) {
  padding: 12px 16px;
  min-height: 260px;
}

.hero-aside :deep(.hot-tagcloud) {
  height: 240px !important;
}

/* 热搜趋势入口 */
.trends-entry {
  display: flex;
}

.trends-entry__link {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 16px;
  background: var(--bg-surface);
  backdrop-filter: blur(8px);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  text-decoration: none;
  color: var(--text-secondary);
  transition: border-color var(--transition-fast), color var(--transition-fast),
    transform var(--transition-fast), box-shadow var(--transition-fast);
}

.trends-entry__link:hover {
  border-color: rgba(15, 118, 110, 0.4);
  color: var(--primary);
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.trends-entry__icon {
  font-size: 15px;
}

.trends-entry__text {
  font-size: 14px;
  font-weight: 700;
  color: var(--primary);
}

.trends-entry__hint {
  font-size: 12px;
  color: var(--text-tertiary);
}

.trends-entry__arrow {
  margin-left: auto;
  font-size: 15px;
  transition: transform var(--transition-fast);
}

.trends-entry__link:hover .trends-entry__arrow {
  transform: translateX(3px);
}

/* 统计和过滤器栏 */
.stats-bar {
  background: var(--bg-primary);
  backdrop-filter: blur(10px);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  padding: 16px;
  box-shadow: var(--shadow-md);
  animation: fadeIn 0.4s ease;
}

.stats-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.stats-main {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-light);
}

.stat-label {
  font-size: 13px;
  color: var(--text-tertiary);
  font-weight: 500;
}

.stat-value {
  font-size: 18px;
  font-weight: 700;
  color: var(--primary);
}

/* 加载指示器 */
.loading-indicator {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(15, 118, 110, 0.1);
  border-radius: var(--radius-md);
  border: 1px solid rgba(15, 118, 110, 0.2);
}

.pulse-dot {
  width: 8px;
  height: 8px;
  background: var(--primary);
  border-radius: 50%;
  animation: pulse 1.5s ease-in-out infinite;
}

.loading-text {
  font-size: 13px;
  color: var(--primary);
  font-weight: 500;
}

/* 暂停状态指示器（统计栏） */
.paused-indicator-bar {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(245, 158, 11, 0.1);
  border-radius: var(--radius-md);
  border: 1px solid rgba(245, 158, 11, 0.3);
  color: #f59e0b;
  font-weight: 500;
}

.pause-icon {
  font-size: 14px;
}

.paused-text {
  font-size: 13px;
}

/* 平台过滤器 */
.platform-filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.filter-pill {
  padding: 6px 12px;
  border: 1px solid var(--border-light);
  background: var(--bg-secondary);
  border-radius: 999px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background-color var(--transition-fast), border-color var(--transition-fast),
    color var(--transition-fast), transform var(--transition-fast),
    box-shadow var(--transition-fast);
  white-space: nowrap;
}

.filter-pill:hover {
  background: var(--bg-primary);
  border-color: var(--border-medium);
  transform: translateY(-1px);
}

.filter-pill.active {
  background: var(--primary);
  color: white;
  border-color: transparent;
  box-shadow: 0 4px 12px rgba(15, 118, 110, 0.28);
}

/* 排序选择器 */
.sorter {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sort-select {
  padding: 8px 12px;
  border: 1px solid var(--border-light);
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  cursor: pointer;
  transition: background-color var(--transition-fast), border-color var(--transition-fast),
    box-shadow var(--transition-fast);
  min-width: 140px;
}

.sort-select:hover {
  background: var(--bg-primary);
  border-color: var(--border-medium);
}

.sort-select:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.12);
}

/* 搜索结果区域 */
.results-section {
  animation: fadeIn 0.5s ease;
}

.results-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

/* 空状态 */
.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 48px 24px;
  animation: fadeIn 0.4s ease;
}

.empty-card {
  background: var(--bg-glass);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: var(--radius-xl);
  padding: 32px;
  text-align: center;
  max-width: 400px;
  box-shadow: var(--shadow-lg);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.6;
}

.empty-card h3 {
  margin: 0 0 8px 0;
  font-size: 20px;
  color: var(--text-primary);
}

.empty-card p {
  margin: 0;
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.empty-suggestions {
  margin-top: 16px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  justify-content: center;
}
.empty-suggestions__label {
  font-size: 13px;
  color: var(--text-tertiary);
}
.empty-suggestions__tag {
  font-size: 13px;
  padding: 4px 12px;
  border-radius: 999px;
  border: 1px solid var(--border-light);
  background: var(--bg-secondary);
  color: var(--text-primary);
  cursor: pointer;
  transition: all var(--transition-fast);
}
.empty-suggestions__tag:hover {
  border-color: var(--primary);
  color: var(--primary);
}

/* 错误提示 */
.error-alert {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: var(--radius-md);
  padding: 12px 16px;
  color: var(--error);
  font-weight: 500;
  animation: fadeIn 0.3s ease;
}

.error-icon {
  font-size: 18px;
}

/* 热搜推荐 */
.hot-search-section {
  animation: fadeIn 0.6s ease;
}

/* 移动端优化 */
@media (max-width: 900px) {
  .hero-row {
    flex-direction: column;
  }

  .hero-aside {
    width: 100%;
  }
}

@media (max-width: 640px) {
  .hero-aside {
    display: none;
  }

  .hero {
    padding: 24px 18px;
  }

  .hero-content {
    padding-left: 4px;
  }

  .hero-badge {
    font-size: 10px;
    letter-spacing: 0.1em;
    margin-bottom: 10px;
  }

  .hero-title {
    font-size: 26px;
  }

  .hero-description {
    font-size: 14px;
    margin-bottom: 16px;
  }

  .hero-feature {
    font-size: 12px;
    padding: 6px 12px;
  }

  .hero-shape {
    width: 80px;
    height: 80px;
    right: 5%;
    bottom: 5%;
  }

  .stats-bar {
    padding: 12px;
  }

  .stats-main {
    gap: 8px;
  }

  .stat-item {
    padding: 6px 10px;
  }

  .stat-value {
    font-size: 16px;
  }

  .platform-filters {
    gap: 6px;
  }

  .filter-pill {
    padding: 5px 10px;
    font-size: 12px;
  }

  .sort-select {
    min-width: 120px;
    font-size: 12px;
  }

  .empty-card {
    padding: 24px;
  }

  .empty-icon {
    font-size: 36px;
  }

  .empty-card h3 {
    font-size: 18px;
  }

  .suggestions-card {
    padding: 16px;
  }

  .tag {
    padding: 6px 12px;
    font-size: 12px;
  }
}

/* 高对比度模式支持 */
@media (prefers-contrast: high) {
  .hero-title-line--accent {
    -webkit-text-fill-color: var(--primary);
    background: none;
  }

  .hero-badge,
  .hero-feature {
    border-width: 2px;
  }

  .filter-pill.active {
    border-width: 2px;
  }

  .sort-select {
    border-width: 2px;
  }

  .tag {
    border-width: 2px;
  }
}

/* 减少动画模式支持 */
@media (prefers-reduced-motion: reduce) {
  .hero-badge,
  .hero-title,
  .hero-description,
  .hero-feature {
    animation: none;
  }

  .hero-feature:hover {
    transform: none;
  }

  .hero,
  .stats-bar,
  .results-section,
  .empty-state,
  .error-alert,
  .hot-search-section {
    animation: none;
  }

  .filter-pill:hover,
  .sort-select:hover {
    transform: none;
  }

  .pulse-dot {
    animation: none;
    opacity: 0.7;
  }
}

</style>
