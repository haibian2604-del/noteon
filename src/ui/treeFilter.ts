export type FileFilterMode = "default" | "all" | "glob";

export interface FileFilter {
  mode: FileFilterMode;
  pattern: string;
}

export const DEFAULT_FILE_FILTER: FileFilter = { mode: "default", pattern: "" };

/** 仅支持 * 与 ?；空、或方括号不配对 → null（调用方回退 default 行为） */
export function globToRegExp(pattern: string): RegExp | null {
  if (pattern === "") return null;
  let opens = 0;
  for (const ch of pattern) {
    if (ch === "[") opens += 1;
    else if (ch === "]") opens -= 1;
  }
  if (opens !== 0) return null;
  let out = "";
  for (const ch of pattern) {
    if (ch === "*") out += "[^/]*";
    else if (ch === "?") out += "[^/]";
    else out += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  try {
    return new RegExp(`^${out}$`, "i");
  } catch {
    return null;
  }
}

/** default 隐藏点开头；all 全显；glob 只留匹配的文件、目录恒显；空/非法 glob 回退 default */
export function filterEntries<T extends { name: string; is_dir: boolean }>(
  entries: T[],
  filter: FileFilter,
): T[] {
  if (filter.mode === "all") return entries;
  if (filter.mode === "glob") {
    const re = globToRegExp(filter.pattern);
    if (!re) return filterEntries(entries, DEFAULT_FILE_FILTER);
    return entries.filter((e) => e.is_dir || re.test(e.name));
  }
  return entries.filter((e) => e.is_dir || !e.name.startsWith("."));
}
