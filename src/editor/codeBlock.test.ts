import { describe, expect, it } from "vitest";
import { Editor, defaultValueCtx, editorViewCtx, rootCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { history, undoCommand } from "@milkdown/kit/plugin/history";
import { $prose, callCommand } from "@milkdown/kit/utils";
import { createLangHintPlugin, langHintKey } from "./langHint";
import { mermaidView } from "./mermaidView";
import { createReadOnlyPlugin } from "./readOnly";

async function makeEditor(markdown: string, readOnly = false) {
  const root = document.createElement("div");
  document.body.append(root);
  const editor = await Editor.make().config((ctx) => {
    ctx.set(rootCtx, root);
    ctx.set(defaultValueCtx, markdown);
  }).use(commonmark).use(history).use(mermaidView)
    .use($prose(() => createLangHintPlugin()))
    .use($prose(() => createReadOnlyPlugin(() => readOnly))).create();
  return { editor, view: editor.action((ctx) => ctx.get(editorViewCtx)), root };
}

describe("code block deletion", () => {
  it("exits an empty language-completed code block on Backspace, with undo support", async () => {
    await import("lowlight");
    const { editor, view, root } = await makeEditor("");
    try {
      view.dispatch(view.state.tr.insertText("```py", 1));
      expect(langHintKey.getState(view.state)?.items[0]).toBe("python");
      view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      expect(view.state.selection.$from.parent.type.name).toBe("code_block");
      expect(view.state.selection.$from.parent.attrs.language).toBe("python");
      view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }));
      expect(view.state.selection.$from.parent.type.name).toBe("paragraph");
      expect(root.querySelector("pre")).toBeNull();
      editor.action(callCommand(undoCommand.key));
      expect(view.state.selection.$from.parent.type.name).toBe("code_block");
      expect(root.querySelector(".code-lang-label")?.getAttribute("contenteditable")).toBe("false");
    } finally { await editor.destroy(); root.remove(); }
  });

  it("leaves nonempty code and read-only documents intact", async () => {
    for (const [markdown, readOnly] of [["```python\nprint(1)\n```", false], ["```python\n```", true]] as const) {
      const { editor, view, root } = await makeEditor(markdown, readOnly);
      try {
        const before = view.state.doc.toJSON();
        view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }));
        expect(view.state.doc.toJSON()).toEqual(before);
      } finally { await editor.destroy(); root.remove(); }
    }
  });
});
