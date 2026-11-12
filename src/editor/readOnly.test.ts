import { describe, expect, it } from "vitest";
import { Editor, defaultValueCtx, editorViewCtx, rootCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { history, undoCommand } from "@milkdown/kit/plugin/history";
import { $prose, callCommand, getMarkdown } from "@milkdown/kit/utils";
import { createReadOnlyPlugin } from "./readOnly";
import { runEditorCommandKey } from "./commands";
import { replaceAllMatches } from "./findReplace";

describe("focus mode read-only", () => {
  it("blocks edits, formatting, replacement and undo, then restores editing without losing history", async () => {
    let readOnly = false;
    const root = document.createElement("div");
    document.body.append(root);
    const editor = await Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, "hello");
      })
      .use(commonmark).use(history)
      .use($prose(() => createReadOnlyPlugin(() => readOnly)))
      .create();
    try {
      const view = editor.action((ctx) => ctx.get(editorViewCtx));
      view.dispatch(view.state.tr.insertText(" world", 6));
      const before = editor.action(getMarkdown());
      readOnly = true;
      view.updateState(view.state);
      expect(view.dom.getAttribute("contenteditable")).toBe("false");
      view.dispatch(view.state.tr.insertText("blocked", 1));
      expect(runEditorCommandKey(editor, "h1")).toBe(false);
      expect(replaceAllMatches(view, "hello", "changed", { regex: false, caseSensitive: false })).toBe(0);
      editor.action(callCommand(undoCommand.key));
      expect(editor.action(getMarkdown())).toBe(before);

      readOnly = false;
      view.updateState(view.state);
      expect(view.dom.getAttribute("contenteditable")).toBe("true");
      editor.action(callCommand(undoCommand.key));
      expect(editor.action(getMarkdown())).toBe("hello\n");
      view.dispatch(view.state.tr.insertText("!", 6));
      expect(editor.action(getMarkdown())).toBe("hello!\n");
    } finally {
      await editor.destroy();
      root.remove();
    }
  });
});
