import { describe, expect, it } from "vitest";
import {
  Editor,
  defaultValueCtx,
  editorViewCtx,
  rootCtx,
} from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { getMarkdown } from "@milkdown/kit/utils";
import { math } from "@milkdown/plugin-math";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { parseAlertLine, scanAlerts } from "./alerts";
import { applyRawBracketText } from "./serialize";

// 与 MilkdownEditor.tsx 相同的配置（含裸方括号序列化），测真实管线
async function makeEditor(md: string): Promise<Editor> {
  const root = document.createElement("div");
  document.body.appendChild(root);
  return Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, md);
      applyRawBracketText(ctx);
    })
    .use(commonmark)
    .use(gfm)
    .use(math)
    .create();
}

function getDoc(ed: Editor): PMNode {
  return ed.action((ctx) => ctx.get(editorViewCtx).state.doc);
}

function getMd(ed: Editor): string {
  return ed.action(getMarkdown());
}

const NOTE_DOC = "> [!NOTE]\n> 正文第一行\n> 正文第二行\n";

// 富样本来当序列化电池：字面方括号 / 行内标记 / 链接 / 数学 / 表格 / 行首符号
const BATTERY = `# 标题

前缀 [abc] def，与 GitHub 警告框 [!NOTE] 同段。

Some **bold** and *italic* with [link](https://example.com) text.

- item one
- [ ] task undone

> a quote line

\`\`\`rust
fn main() {}
\`\`\`

| a | b |
| --- | --- |
| 1 | 2 |

行内公式 $E=mc^2$ 与钱 $5 and $10 混排。

1. ordered
2. second
`;

describe("github alerts", () => {
  it("parseAlertLine:整行才算,段中/带后缀不算", () => {
    expect(parseAlertLine("[!NOTE]")).toBe("note");
    expect(parseAlertLine("[!warning] ")).toBe("warning");
    expect(parseAlertLine("前缀 [!NOTE]")).toBeNull();
    expect(parseAlertLine("[!NOTE] 后缀")).toBeNull();
    expect(parseAlertLine("[!UNKNOWN]")).toBeNull();
  });

  it("scanAlerts:找到 NOTE 及 marker 位置;第二行 marker 不算", async () => {
    const ed = await makeEditor(NOTE_DOC);
    const doc = getDoc(ed);
    const hits = scanAlerts(doc);
    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe("note");
    expect(doc.textBetween(hits[0].markerFrom, hits[0].markerTo, "\n")).toBe(
      "[!NOTE]",
    );
    const ed2 = await makeEditor("> 正文\n> [!NOTE]\n");
    expect(scanAlerts(getDoc(ed2))).toHaveLength(0);
    await Promise.all([ed.destroy(), ed2.destroy()]);
  });

  it("round-trip:加载→序列化幂等,marker 原样保留（裸方括号写盘）", async () => {
    const ed = await makeEditor(NOTE_DOC);
    const first = getMd(ed);
    const second = await makeEditor(first).then((e) => {
      const md = getMd(e);
      void e.destroy();
      return md;
    });
    expect(second).toBe(first);
    expect(first).toContain("> [!NOTE]");
    await ed.destroy();
  });

  it("序列化电池:富文档幂等,方括号/既有标记不劣化", async () => {
    const ed = await makeEditor(BATTERY);
    const first = getMd(ed);
    const second = await makeEditor(first).then((e) => {
      const md = getMd(e);
      void e.destroy();
      return md;
    });
    expect(second).toBe(first);
    expect(first).toContain("[abc]");
    expect(first).toContain("**bold**");
    expect(first).toContain("[link](https://example.com)");
    expect(first).toContain("$E=mc^2$");
    await ed.destroy();
  });
});
