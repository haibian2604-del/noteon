import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILE_FILTER,
  filterEntries,
  globToRegExp,
} from "./treeFilter";

const ENTRIES = [
  { name: ".hidden.md", is_dir: false },
  { name: "note.md", is_dir: false },
  { name: "readme.txt", is_dir: false },
  { name: ".git", is_dir: true },
  { name: "assets", is_dir: true },
];

describe("tree filter", () => {
  it("default 隐藏点开头文件,目录不隐藏", () => {
    expect(
      filterEntries(ENTRIES, { mode: "default", pattern: "" }).map(
        (e) => e.name,
      ),
    ).toEqual(["note.md", "readme.txt", ".git", "assets"]);
  });

  it("all 全显", () => {
    expect(filterEntries(ENTRIES, { mode: "all", pattern: "" })).toHaveLength(5);
  });

  it("glob 只留匹配文件,目录恒显;空/非法 pattern 回退 default", () => {
    // glob 是用户显式点名,`*` 按 [^/]* 匹配,点开头文件同样参与匹配
    expect(
      filterEntries(ENTRIES, { mode: "glob", pattern: "*.md" }).map(
        (e) => e.name,
      ),
    ).toEqual([".hidden.md", "note.md", ".git", "assets"]);
    expect(
      filterEntries(ENTRIES, { mode: "glob", pattern: "note?md" }).map(
        (e) => e.name,
      ),
    ).toEqual(["note.md", ".git", "assets"]);
    expect(
      filterEntries(ENTRIES, { mode: "glob", pattern: "[abc" }).map(
        (e) => e.name,
      ),
    ).toEqual(["note.md", "readme.txt", ".git", "assets"]); // 非法 → default
  });

  it("globToRegExp:空 → null;未配对方括号 → null;星号问号生效", () => {
    expect(globToRegExp("")).toBeNull();
    expect(globToRegExp("[abc")).toBeNull();
    expect(globToRegExp("*.md")?.test("note.md")).toBe(true);
    expect(globToRegExp("*.md")?.test("notes/md")).toBe(false);
    expect(globToRegExp("note?md")?.test("note.md")).toBe(true);
    expect(DEFAULT_FILE_FILTER.mode).toBe("default");
  });
});
