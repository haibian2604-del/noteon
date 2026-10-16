import { describe, expect, it } from "vitest";
import { Editor, defaultValueCtx, rootCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { $prose } from "@milkdown/kit/utils";
import { createHighlightPlugin } from "prosemirror-highlight";
import { createParser } from "prosemirror-highlight/lowlight";
import { createLowlight, all } from "lowlight";

const MD = "```rust\nfn main() { let x = 1; }\n```\n";

describe("highlight plugin", () => {
  it("为代码块生成 hljs decoration", async () => {
    const lowlight = createLowlight(all);
    const plugin = $prose(() =>
      createHighlightPlugin({ parser: createParser(lowlight) }),
    );
    const root = document.createElement("div");
    document.body.appendChild(root);
    const editor = await Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, MD);
      })
      .use(commonmark)
      .use(plugin)
      .create();
    await new Promise((r) => setTimeout(r, 300));
    console.log(
      "hljs spans:",
      root.querySelectorAll("[class*=hljs]").length,
      "keyword:",
      root.querySelectorAll(".hljs-keyword").length,
    );
    expect(root.querySelector(".hljs-keyword")).toBeTruthy();
    await editor.destroy();
  });
});
