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
import { callCommand } from "@milkdown/kit/utils";
import { history, undoCommand } from "@milkdown/kit/plugin/history";
import type { EditorView } from "@milkdown/kit/prose/view";
import {
  buildTextFinder,
  collectMatches,
  replaceAllMatches,
} from "./findReplace";

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
    .use(history)
    .create();
}

function getView(ed: Editor): EditorView {
  return ed.action((ctx) => ctx.get(editorViewCtx));
}

describe("find/replace core", () => {
  it("buildTextFinder:普通/大小写/正则/非法正则/空 query", () => {
    const t = "aBc abc ABC";
    expect(
      buildTextFinder(t, "abc", { regex: false, caseSensitive: false }).findAll(),
    ).toEqual([{ start: 0, end: 3 }, { start: 4, end: 7 }, { start: 8, end: 11 }]);
    expect(
      buildTextFinder(t, "abc", { regex: false, caseSensitive: true }).findAll(),
    ).toEqual([{ start: 4, end: 7 }]);
    const re = buildTextFinder(t, "a[bc]c", { regex: true, caseSensitive: false });
    expect(re.error).toBeNull();
    expect(re.findAll().length).toBe(3);
    expect(
      buildTextFinder(t, "a[bc", { regex: true, caseSensitive: false }).error,
    ).not.toBeNull();
    expect(
      buildTextFinder(t, "", { regex: false, caseSensitive: false }).findAll(),
    ).toEqual([]);
  });

  it("collectMatches:跨块收集 + cap 截断", async () => {
    const ed = await makeEditor(
      Array(600).fill("hello world").join("\n\n"),
    ); // 600 个 hello
    const doc = getView(ed).state.doc;
    expect(
      collectMatches(doc, "hello", { regex: false, caseSensitive: false }),
    ).toHaveLength(600);
    expect(
      collectMatches(doc, "hello", { regex: false, caseSensitive: false }, 100),
    ).toHaveLength(100);
    await ed.destroy();
  });

  it("replaceAllMatches:单事务全替换,undo 一次还原", async () => {
    const ed = await makeEditor("foo bar foo\n\nfoo");
    const n = replaceAllMatches(
      getView(ed),
      "foo",
      "baz",
      { regex: false, caseSensitive: false },
    );
    expect(n).toBe(3);
    expect(ed.action(getMarkdown())).toContain("baz bar baz");
    ed.action(callCommand(undoCommand.key));
    expect(ed.action(getMarkdown())).not.toContain("baz");
    await ed.destroy();
  });
});
