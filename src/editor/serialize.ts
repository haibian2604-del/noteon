import type { Editor } from "@milkdown/kit/core";
import { remarkStringifyOptionsCtx } from "@milkdown/kit/core";

type EditorCtx = Parameters<Parameters<Editor["config"]>[0]>[0];

/**
 * 复刻 milkdown（mdast-util-to-markdown + gfm/math 扩展）对文本的默认转义：
 * ` * _ ~ 无条件、行首块级标记（- + > # =、数字+. 或 +)），
 * 裸反斜杠不转义。唯一差异：[ ] 只在可能构成链接/引用（]( / ]:）时才转义——
 * Typora/GitHub 的警告框标记 [!NOTE] 与字面 [abc] 必须原样写盘。
 */
function escapeMarkdownText(value: string): string {
  const dangerous = /\]\s*\(/.test(value) || /\]:/.test(value);
  let out = value.replace(dangerous ? /([`*_[\]~])/g : /([`*_~])/g, "\\$1");
  out = out.replace(/^([ ]{0,3})([-+>#=])(?=\s|$)/gm, "$1\\$2");
  out = out.replace(/^([ ]{0,3})(\d+)([.)])(?=\s)/gm, "$1$2\\$3");
  return out;
}

export function applyRawBracketText(ctx: EditorCtx): void {
  ctx.update(remarkStringifyOptionsCtx, (prev) => ({
    ...prev,
    handlers: {
      ...(prev.handlers ?? {}),
      text: (node: { value: string }) => escapeMarkdownText(node.value),
    },
  }));
}
