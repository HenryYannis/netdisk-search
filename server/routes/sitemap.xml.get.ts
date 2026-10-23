import { defineEventHandler } from "h3";

/**
 * 静态 sitemap.xml：只收录首页。
 * 搜索结果由浏览器端加载，/?q= 页面对爬虫是空壳，不收录以免被判定为低质页面。
 */
export default defineEventHandler((event) => {
  const config = useRuntimeConfig();
  const siteUrl = ((config.public?.siteUrl as string) || "https://pan.xbkjz.icu").replace(/\/$/, "");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteUrl}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`;
  event.node.res.setHeader("Content-Type", "application/xml; charset=utf-8");
  event.node.res.setHeader("Cache-Control", "public, max-age=3600");
  return xml;
});
