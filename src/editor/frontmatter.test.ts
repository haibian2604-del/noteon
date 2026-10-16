import { describe, expect, it } from "vitest";
import { decodeFrontmatter, encodeFrontmatter } from "./frontmatter";

describe("frontmatter 转换", () => {
  it("有 frontmatter 时转为无语言代码块", () => {
    const md = "---\nname: job-prep\nagent_created: true\n---\n\n# 标题\n";
    const { text, had } = encodeFrontmatter(md);
    expect(had).toBe(true);
    expect(text).toBe("```\nname: job-prep\nagent_created: true\n```\n\n# 标题\n");
    expect(decodeFrontmatter(text)).toBe(md);
  });

  it("CRLF frontmatter 也识别", () => {
    const { text, had } = encodeFrontmatter("---\r\na: 1\r\n---\r\nbody");
    expect(had).toBe(true);
    expect(text).toBe("```\na: 1\n```\nbody");
  });

  it("无 frontmatter 原样返回", () => {
    expect(encodeFrontmatter("# hi\n---\n").had).toBe(false);
    expect(encodeFrontmatter("---\n没有闭合").had).toBe(false);
  });

  it("decode 只在块位于文档开头时生效", () => {
    expect(decodeFrontmatter("正文\n```\nx\n```\n")).toBe("正文\n```\nx\n```\n");
  });
});
