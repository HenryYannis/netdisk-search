import { describe, it, expect } from "vitest";
import { parseYunsoHtml } from "../../server/core/plugins/yunso";

// 取自真实响应结构的精简 fixture（yunso: data 字段内的 HTML 片段）
const YUNSO_HTML = `
<div class="responsive-container"><div style=""><a onclick="open_sid(this)" id="1" url="https:\\/\\/pan.quark.cn\\/s\\/abc123" pa="8888" rel="noreferrer" target="_blank" style=""><u>测试片A（全集）张三</u></a></div>
<div class="responsive-container"><div style=""><a onclick="open_sid(this)" id="2" url="https:\\/\\/pan.quark.cn\\/s\\/def456" pa="" rel="noreferrer" target="_blank" style=""><u>测试片B 李四</u></a></div>
<div class="feedback"><a href="javascript:;" onclick="x()">忽略</a></div>
`;

describe("yunso parser", () => {
  it("提取 quark 链接 + 标题 + 密码，并跳过无 url 属性的链接", () => {
    const r = parseYunsoHtml(YUNSO_HTML, "测试");
    // 仅 2 个带 url= 的结果锚点，feedback 的 <a> 被跳过
    expect(r.length).toBe(2);
    expect(r[0]!.links[0]!.url).toBe("https://pan.quark.cn/s/abc123");
    expect(r[0]!.links[0]!.type).toBe("quark");
    expect(r[0]!.links[0]!.password).toBe("8888");
    expect(r[0]!.title).toContain("测试片A");
    expect(r[1]!.links[0]!.url).toBe("https://pan.quark.cn/s/def456");
    expect(r[1]!.links[0]!.password).toBe("");
    expect(r[1]!.title).toContain("测试片B");
  });
});
