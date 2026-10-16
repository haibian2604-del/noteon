import { describe, expect, it } from "vitest";
import { Editor, defaultValueCtx, rootCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { getMarkdown } from "@milkdown/kit/utils";
import { math } from "@milkdown/plugin-math";

// M1 硬验收：磁盘 markdown 是唯一真相，加载→序列化必须稳定（幂等）。
const SAMPLE = `# 标题一

Some **bold** and *italic* with [link](https://example.com) text.

- item one
- item two
- [ ] task undone
- [x] task done

> a quote line

\`\`\`rust
fn main() {}
\`\`\`

| a | b |
| --- | --- |
| 1 | 2 |

行内公式 $E=mc^2$ 与块公式：

$$
\\int_0^1 x \\, dx
$$

最后一段，中文混排 English mixed。
`;

async function makeEditor(md: string): Promise<Editor> {
  const root = document.createElement("div");
  document.body.appendChild(root);
  return Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, md);
    })
    .use(commonmark)
    .use(gfm)
    .use(math)
    .create();
}

describe("markdown round-trip", () => {
  it("serialize(load(md)) 稳定（两次往返结果一致）", async () => {
    const editor = await makeEditor(SAMPLE);
    const first = editor.action(getMarkdown());
    const second = await makeEditor(first).then((e) => {
      const md = e.action(getMarkdown());
      void e.destroy();
      return md;
    });
    expect(second).toBe(first);
    await editor.destroy();
  });

  it("往返不丢内容要素", async () => {
    const editor = await makeEditor(SAMPLE);
    const out = editor.action(getMarkdown());
    // Milkdown 序列化风格：无序列表用 *，表格分隔列用 -；语义与 - / --- 等价
    for (const token of [
      "# 标题一",
      "**bold**",
      "*italic*",
      "[link](https://example.com)",
      "* item one",
      "* [ ] task undone",
      "* [x] task done",
      "> a quote line",
      "```rust",
      "| a | b |",
      "$E=mc^2$",
      "\\int_0^1",
      "中文混排",
    ]) {
      expect(out).toContain(token);
    }
    await editor.destroy();
  });
});
