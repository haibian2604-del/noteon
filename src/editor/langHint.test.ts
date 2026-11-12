import { expect, it, vi } from "vitest";
import { Editor, editorViewCtx, rootCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { $prose } from "@milkdown/kit/utils";
import { createLangHintPlugin, openLangPicker } from "./langHint";

it("adds available icons without changing language selection or inventing missing icons", async () => {
  await import("lowlight");
  const root = document.createElement("div"); document.body.append(root);
  const editor = await Editor.make().config(ctx => ctx.set(rootCtx, root))
    .use(commonmark).use($prose(() => createLangHintPlugin())).create();
  try {
    const view = editor.action(ctx => ctx.get(editorViewCtx));
    view.dispatch(view.state.tr.insertText("```p", 1));
    const rows = [...document.querySelectorAll<HTMLElement>(".lang-hint-item")];
    const php = rows.find(row => row.textContent === "php")!;
    const missing = rows.find(row => row.textContent === "parser3")!;
    expect(php.querySelector("img")?.getAttribute("src")).toBe("/language-icons/php.svg");
    expect(php.querySelector("img")?.getAttribute("alt")).toBe("");
    expect(missing.querySelector("img")).toBeNull();
    php.querySelector("img")!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(view.state.selection.$from.parent.attrs.language).toBe("php");
  } finally { await editor.destroy(); root.remove(); }
});

it("uses the same icons in the language picker and falls back to text on load errors", async () => {
  await import("lowlight");
  const onPick = vi.fn();
  openLangPicker(new DOMRect(100, 100, 20, 20), "py", onPick);
  const row = document.querySelector<HTMLElement>(".lang-picker .lang-hint-item")!;
  const icon = row.querySelector("img")!;
  expect(row.textContent).toBe("python");
  expect(icon.getAttribute("src")).toBe("/language-icons/python.svg");
  icon.dispatchEvent(new Event("error"));
  expect(row.querySelector("img")).toBeNull();
  row.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  expect(onPick).toHaveBeenCalledWith("python");
  expect(document.querySelector(".lang-picker")).toBeNull();
});
