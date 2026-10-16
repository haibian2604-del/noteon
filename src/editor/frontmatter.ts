/**
 * YAML frontmatter 与无语言 fenced code block 的双向转换。
 * Milkdown 不解析 frontmatter（会渲染成加粗正文），读入时把 --- 围栏
 * 转成 ``` 块（Typora 同款灰底代码块），保存时转回 ---。
 * 仅对「打开时本就带 frontmatter」的文档做回转，避免用户手写的首块
 * ``` 代码块被误改写。
 */

export function encodeFrontmatter(md: string): { text: string; had: boolean } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(md);
  if (!m) return { text: md, had: false };
  return {
    text: "```\n" + m[1] + "\n```\n" + md.slice(m[0].length),
    had: true,
  };
}

export function decodeFrontmatter(md: string): string {
  const m = /^```\n([\s\S]*?)\n```(?:\n|$)/.exec(md);
  if (!m) return md;
  return "---\n" + m[1] + "\n---\n" + md.slice(m[0].length);
}
