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
    // 热搜接口不缓存，否则 POST 写入后 GET 仍返回旧数据
    "/api/hot-searches": { swr: false, cache: false },
    // 豆瓣热搜允许短时缓存（服务端已有 60 分钟 cache）
    "/api/douban-hot": { swr: false, cache: false },
    // 密码门接口不缓存，确保 POST body 正常处理
    "/api/auth/**": { swr: false, cache: false },
    // 搜索接口依赖 Cookie 鉴权，禁止缓存避免 401 被缓存
    "/api/search": { swr: false, cache: false },
    // 链接检测接口需要读 POST body，禁止缓存避免 body 被中间件消费
    "/api/check": { swr: false, cache: false },
    // 图片代理依赖豆瓣，禁止 SWR 缓存避免错误响应被缓存
    "/api/img": { swr: false, cache: false },
    "/**": { swr: 3600 },
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
