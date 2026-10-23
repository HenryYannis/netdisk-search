import { describe, it, expect } from "vitest";
import { load } from "cheerio";
import { parseChannelPage } from "../../server/core/services/tg";

function wrapMessage(text: string, post = "chan/1"): string {
  return `
    <div class="tgme_widget_message_wrap">
      <div class="tgme_widget_message" data-post="${post}">
        <div class="tgme_widget_message_text">${text}</div>
      </div>
      <time datetime="2026-01-01T00:00:00.000Z"></time>
    </div>`;
}

describe("parseChannelPage 链接提取", () => {
  it("展开 t.me 分享链接里嵌套的真实网盘地址（不被整体当成 t.me 丢弃）", () => {
    const html = wrapMessage(
      "资源 https://t.me/share/url?url=https://pan.quark.cn/s/abcdef 提取码：1234"
    );
    const $ = load(html);
    const results = parseChannelPage($, "testchan", "", 10);

    expect(results).toHaveLength(1);
    const quarkLinks = results[0].links.filter((l) => l.type === "quark");
    expect(quarkLinks).toHaveLength(1);
    expect(quarkLinks[0].url).toBe("https://pan.quark.cn/s/abcdef");
  });

  it("仍然能直接提取普通网盘链接", () => {
    const html = wrapMessage("电影 https://pan.quark.cn/s/xyz");
    const $ = load(html);
    const results = parseChannelPage($, "testchan", "", 10);

    const quarkLinks = results[0].links.filter((l) => l.type === "quark");
    expect(quarkLinks).toHaveLength(1);
    expect(quarkLinks[0].url).toBe("https://pan.quark.cn/s/xyz");
  });
});

describe("parseChannelPage 提取码与日期", () => {
  it("提取码只配给紧邻的链接（百度的提取码不串到夸克）", () => {
    const html = wrapMessage(
      "百度 https://pan.baidu.com/s/1abc 提取码：bd12\n夸克 https://pan.quark.cn/s/qk34"
    );
    const results = parseChannelPage(load(html), "testchan", "", 10);
    const baidu = results[0]!.links.find((l) => l.type === "baidu");
    const quark = results[0]!.links.find((l) => l.type === "quark");
    expect(baidu?.password).toBe("bd12");
    expect(quark?.password).toBe("");
  });

  it("单链接时提取码写在前面也能识别", () => {
    const html = wrapMessage("提取码：ab12 链接 https://pan.baidu.com/s/1xyz");
    const results = parseChannelPage(load(html), "testchan", "", 10);
    expect(results[0]!.links[0]?.password).toBe("ab12");
  });

  it("非法日期不抛错，整页结果保留", () => {
    const html = `
      <div class="tgme_widget_message_wrap">
        <div class="tgme_widget_message" data-post="c/1">
          <div class="tgme_widget_message_text">片 https://pan.quark.cn/s/a1</div>
        </div>
        <time datetime="not-a-date"></time>
      </div>` + wrapMessage("片2 https://pan.quark.cn/s/b2", "c/2");
    const results = parseChannelPage(load(html), "testchan", "", 10);
    expect(results).toHaveLength(2);
    expect(results[0]!.datetime).toBe("");
  });
});
