/** 可见行序上的光标移动；null=无光标。up 在 0 处退出光标，down 在末尾停住 */
export function moveCursor(
  current: number | null,
  count: number,
  key: "up" | "down",
): number | null {
  if (count <= 0) return null;
  if (key === "down") {
    if (current === null) return 0;
    return Math.min(current + 1, count - 1);
  }
  if (current === null || current === 0) return null;
  return current - 1;
}
