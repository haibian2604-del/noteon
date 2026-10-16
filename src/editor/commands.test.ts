import { describe, expect, it } from "vitest";
import { COMMANDS, runEditorCommandKey, TOOLBAR_ITEMS } from "./commands";

const EXPECTED = ["h1","h2","h3","h4","h5","h6","bullet-list","ordered-list",
  "quote","code-block","table","table-row-before","table-row-after",
  "table-col-before","table-col-after","hr","bold","italic","strike",
  "inline-code","link"];

describe("commands registry", () => {
  it("包含全部既有命令键且 label 非空", () => {
    for (const key of EXPECTED) {
      expect(COMMANDS[key], key).toBeDefined();
      expect(COMMANDS[key].label.length).toBeGreaterThan(0);
    }
  });
  it("未知键返回 false", () => {
    // @ts-expect-error 故意传未知键
    expect(runEditorCommandKey(null, "no-such-key")).toBe(false);
  });
  it("TOOLBAR_ITEMS 的 key 都在 COMMANDS 中且 title 非空", () => {
    expect(TOOLBAR_ITEMS.length).toBeGreaterThan(0);
    for (const item of TOOLBAR_ITEMS) {
      expect(COMMANDS[item.key], item.key).toBeDefined();
      expect(item.title.length).toBeGreaterThan(0);
    }
  });
  it("TOOLBAR_ITEMS 定稿 14 项且含 code-block/table/hr", () => {
    expect(TOOLBAR_ITEMS.map((i) => i.key)).toEqual(
      ["bold","italic","strike","inline-code","link","h1","h2","h3",
       "quote","bullet-list","ordered-list","code-block","table","hr"],
    );
  });
});
