import { afterEach, expect, it, vi } from "vitest";
import { Editor, defaultValueCtx, editorViewCtx, rootCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { TextSelection } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";
import { createCodeBlockCaretPlugin } from "./codeBlockCaret";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("refreshes only the latest browser selection after a burst of newlines", async () => {
  const frames = new Map<number, FrameRequestCallback>();
  let id = 0;
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => { frames.set(++id, fn); return id; });
  vi.stubGlobal("cancelAnimationFrame", (key: number) => frames.delete(key));
  const host = document.createElement("div"); document.body.append(host);
  const editor = await Editor.make().config(ctx => {
    ctx.set(rootCtx, host); ctx.set(defaultValueCtx, "```python\n```");
  }).use(commonmark).use($prose(() => createCodeBlockCaretPlugin())).create();
  const view = editor.action(ctx => ctx.get(editorViewCtx));
  // jsdom 没有文本布局；这里只验证选区同步，布局在 WKWebView 中另测。
  vi.spyOn(view, "coordsAtPos").mockReturnValue({ left: 0, right: 0, top: 0, bottom: 0 });
  view.focus();
  const selection = document.getSelection()!;
  const remove = vi.spyOn(selection, "removeAllRanges");
  const add = vi.spyOn(selection, "addRange");
  const enter = () => view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(0)); };
  try {
    for (let i = 0; i < 30; i++) enter();
    expect(view.state.doc.firstChild?.textContent).toBe("\n".repeat(30));
    const head = view.state.selection.head;
    remove.mockClear(); add.mockClear();
    flush();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledTimes(1);
    expect(view.posAtDOM(selection.focusNode!, selection.focusOffset)).toBe(head);
    expect(view.state.selection.head).toBe(31);

    enter();
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
    remove.mockClear(); flush();
    expect(remove).not.toHaveBeenCalled();

    enter();
    view.dom.blur();
    remove.mockClear(); flush();
    expect(remove).not.toHaveBeenCalled();
    view.focus(); enter();
    await editor.destroy();
    remove.mockClear(); flush();
    expect(remove).not.toHaveBeenCalled();
  } finally {
    if (!view.isDestroyed) await editor.destroy();
    remove.mockRestore(); add.mockRestore(); host.remove();
  }
});
