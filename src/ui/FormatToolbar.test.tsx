import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { Editor, defaultValueCtx, editorViewCtx, rootCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { TextSelection } from "@milkdown/kit/prose/state";
import { runEditorCommandKey } from "../editor/commands";
import FormatToolbar from "./FormatToolbar";

it.each([
  ["加粗", "strong"], ["斜体", "em"], ["删除线", "del"],
  ["行内代码", "code"], ["链接", "a"],
  ["标题1", "h1"], ["标题2", "h2"], ["标题3", "h3"],
  ["引用", "blockquote"], ["无序列表", "ul"], ["有序列表", "ol"],
  ["代码块", "pre"], ["表格", "table"], ["分割线", "hr"],
])("applies %s through the floating toolbar", async (title, selector) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(window, "scrollBy").mockImplementation(() => {});
  const originalShowModal = HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  const host = document.createElement("div");
  const toolbar = document.createElement("div");
  document.body.append(host, toolbar);
  const root = createRoot(toolbar);
  const editor = await Editor.make().config(ctx => {
    ctx.set(rootCtx, host);
    ctx.set(defaultValueCtx, title === "斜体" ? "# 状态文件（反复使用的关键）" : "状态文件（反复使用的关键）");
  }).use(commonmark).use(gfm).create();
  const originalRects = Range.prototype.getClientRects;
  const originalRect = Range.prototype.getBoundingClientRect;
  Range.prototype.getClientRects = () => [new DOMRect(100, 100, 400, 40)] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect(100, 100, 400, 40);
  try {
    const view = editor.action(ctx => ctx.get(editorViewCtx));
    await act(async () => root.render(<FormatToolbar enabled onCommand={key => { runEditorCommandKey(editor, key); }} />));
    view.focus();
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, view.state.doc.content.size - 1)));
    await act(async () => { document.dispatchEvent(new Event("selectionchange")); });
    const button = toolbar.querySelector<HTMLButtonElement>(`[title="${title}"]`)!;
    expect(button).not.toBeNull();
    await act(async () => {
      button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      button.click();
    });
    if (title === "链接") {
      const dialog = document.querySelector("dialog")!;
      dialog.querySelector("input")!.value = "https://example.com";
      dialog.returnValue = "confirm";
      dialog.dispatchEvent(new Event("close"));
      expect(host.querySelector("a")?.getAttribute("href")).toBe("https://example.com");
      const before = view.state.doc;
      button.click();
      const cancelled = document.querySelector("dialog")!;
      cancelled.returnValue = "cancel";
      cancelled.dispatchEvent(new Event("close"));
      expect(view.state.doc.eq(before)).toBe(true);
      expect(document.querySelector("dialog")).toBeNull();
    }
    expect(host.querySelector(selector)).not.toBeNull();
    if (["加粗", "斜体", "删除线", "行内代码", "链接"].includes(title)) {
      expect(host.querySelector(selector)?.textContent).toBe("状态文件（反复使用的关键）");
      expect(view.state.selection.empty).toBe(false);
    }
  } finally {
    await act(async () => root.unmount());
    await editor.destroy();
    host.remove(); toolbar.remove();
    Range.prototype.getClientRects = originalRects;
    Range.prototype.getBoundingClientRect = originalRect;
    HTMLDialogElement.prototype.showModal = originalShowModal;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
