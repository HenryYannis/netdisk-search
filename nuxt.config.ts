// https://nuxt.com/docs/api/configuration/nuxt-config
import channelsConfig from "./config/channels.json";

export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: false },
  devServer: {
    port: 4000,
  },
  app: {
    head: {
      htmlAttrs: { lang: "zh-CN" },
      title: "小宝网盘搜索引擎",
      titleTemplate: "%s · 小宝网盘搜索引擎",
      meta: [
        {
          name: "viewport",
          content:
            "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover",
        },
        {
          name: "description",
          content:
            "免费的网盘搜索引擎，一键搜索夸克网盘、阿里云盘、百度网盘、115、迅雷云盘的电影、剧集、动漫、软件、学习资料分享链接，实时聚合、自动去重、无广告。",
        },
        {
          name: "keywords",
          content:
            "小宝网盘搜索引擎, 网盘搜索引擎, 网盘搜索, 夸克网盘搜索, 阿里云盘搜索, 百度网盘资源搜索, 115 网盘搜索, 迅雷云盘, 网盘资源, 盘搜",
        },
        { name: "theme-color", content: "#0f766e" },
        { property: "og:type", content: "website" },
        { property: "og:site_name", content: "小宝网盘搜索引擎" },
      ],
      link: [
        { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
        { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32x32.png" },
        { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
        { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
        { rel: "manifest", href: "/site.webmanifest" },
      ],
    },
  },
  nitro: {
    // 根据环境变量动态选择部署预设
    preset: process.env.VERCEL
      ? "vercel"
      : process.env.NITRO_PRESET || "node-server",
    // Vercel serverless function 最大执行时间（Pro: 60s, Hobby: 10s）
    vercel: {
      functions: {
        maxDuration: 60,
      },
    },
  },
  routeRules: {
    // 注意：不要再加全局 "/**": { swr } —— Nitro 默认用进程内存存路由缓存，键含完整
    // URL（含 query），/?q=<随机> 之类请求会无限堆积 SSR HTML 直到容器 OOM，
    // 还会把 /api/health 缓存成 200 让健康检查失效。页面 SSR 很便宜，直接实时渲染。
    // 健康检查必须实时
    "/api/health": { cache: false },
    // 热搜接口不缓存，否则 POST 写入后 GET 仍返回旧数据
    "/api/hot-searches": { cache: false },
    "/api/douban-hot": { cache: false },
    "/api/auth/**": { cache: false },
    // 搜索接口依赖 Cookie 鉴权，禁止缓存避免 401 被缓存
    "/api/search": { cache: false },
    "/api/check": { cache: false },
    "/api/img": { cache: false },
    // 构建产物文件名带内容 hash，可长期强缓存（浏览器 + Cloudflare）
    "/_nuxt/**": {
      headers: { "cache-control": "public, max-age=31536000, immutable" },
    },
  },
  runtimeConfig: {
    // server-only 配置
    searchPassword: process.env.SEARCH_PASSWORD || "",
    priorityChannels: channelsConfig.priorityChannels,
    defaultChannels: channelsConfig.defaultChannels,
    defaultConcurrency: channelsConfig.defaultConcurrency,
    pluginTimeoutMs: channelsConfig.pluginTimeoutMs,
    cacheEnabled: true,
    cacheTtlMinutes: channelsConfig.cacheTtlMinutes,
    public: {
      apiBase: "/api",
      siteUrl: "https://pan.xbkjz.icu",
      // 向前端暴露默认频道清单
      tgDefaultChannels: channelsConfig.defaultChannels,
    },
  },
});
