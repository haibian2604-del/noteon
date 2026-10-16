import { describe, expect, it } from "vitest";
import { moveCursor } from "./treeNav";

describe("tree keyboard nav", () => {
  it("moveCursor:边界与循环语义", () => {
    expect(moveCursor(null, 3, "down")).toBe(0);
    expect(moveCursor(0, 3, "down")).toBe(1);
    expect(moveCursor(2, 3, "down")).toBe(2); // 末尾停住
    expect(moveCursor(null, 3, "up")).toBeNull();
    expect(moveCursor(0, 3, "up")).toBeNull(); // 顶部退出光标
    expect(moveCursor(1, 3, "up")).toBe(0);
    expect(moveCursor(0, 0, "down")).toBeNull();
  });
});
