import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";

export interface FindOptions {
  regex: boolean;
  caseSensitive: boolean;
}

export interface TextMatch {
  start: number;
  end: number;
}

export interface DocMatch {
  from: number;
  to: number;
}

/** 单个文本串内的全部匹配；零宽匹配自动前进防死循环 */
function scanAll(text: string, re: RegExp, cap: number): TextMatch[] {
  const out: TextMatch[] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ start: m.index, end: m.index + m[0].length });
    if (out.length >= cap) break;
    if (m[0].length === 0) re.lastIndex += 1;
  }
  return out;
}

const SCAN_CAP = 10000;

export function buildTextFinder(
  text: string,
  query: string,
  opts: FindOptions,
): { error: string | null; findAll: () => TextMatch[] } {
  if (query === "") return { error: null, findAll: () => [] };
  if (!opts.regex) {
    // 大小写折叠可能改变长度（少数 Unicode 字符），仅影响含这类字符的极端情况
    const hay = opts.caseSensitive ? text : text.toLowerCase();
    const needle = opts.caseSensitive ? query : query.toLowerCase();
    return {
      error: null,
      findAll: () => {
        const out: TextMatch[] = [];
        let i = 0;
        while (i <= hay.length) {
          const found = hay.indexOf(needle, i);
          if (found < 0) break;
          out.push({ start: found, end: found + needle.length });
          i = found + Math.max(needle.length, 1);
          if (out.length >= SCAN_CAP) break;
        }
        return out;
      },
    };
  }
  let re: RegExp;
  try {
    re = new RegExp(query, opts.caseSensitive ? "g" : "gi");
  } catch (e) {
    return { error: String(e), findAll: () => [] };
  }
  return { error: null, findAll: () => scanAll(text, re, SCAN_CAP) };
}

/** 收集全文档匹配（跨块）；达 cap 即停。内联叶子节点（图片/硬换行）经 forEach 偏移自然跳过 */
export function collectMatches(
  doc: PMNode,
  query: string,
  opts: FindOptions,
  cap = 1000,
): DocMatch[] {
  const out: DocMatch[] = [];
  if (query === "") return out;
  doc.descendants((node, pos) => {
    if (out.length >= cap) return false;
    if (!node.isTextblock) return true;
    node.forEach((child, offset) => {
      if (out.length >= cap || !child.isText || !child.text) return;
      const { error, findAll } = buildTextFinder(child.text, query, opts);
      if (error) return;
      for (const m of findAll()) {
        out.push({ from: pos + 1 + offset + m.start, to: pos + 1 + offset + m.end });
        if (out.length >= cap) return;
      }
    });
    return false;
  });
  return out;
}

/** 单事务全替换（位置降序），一次 ⌘Z 还原；返回替换数 */
export function replaceAllMatches(
  view: EditorView,
  query: string,
  replacement: string,
  opts: FindOptions,
): number {
  const matches = collectMatches(view.state.doc, query, opts, SCAN_CAP);
  if (matches.length === 0) return 0;
  const tr = view.state.tr;
  for (let i = matches.length - 1; i >= 0; i--) {
    tr.insertText(replacement, matches[i].from, matches[i].to);
  }
  view.dispatch(tr);
  return matches.length;
}

export interface FindState {
  query: string;
  opts: FindOptions;
  matches: DocMatch[];
  active: number;
}

export const findKey = new PluginKey<FindState | null>("noteon-find");

export const findPlugin = new Plugin({
  key: findKey,
  state: {
    init: () => null as FindState | null,
    apply(tr, prev) {
      const meta = tr.getMeta(findKey);
      if (meta !== undefined) return meta as FindState | null;
      if (prev && tr.docChanged) {
        // 文档变了：按原 query/opts 重算，active 夹回有效范围
        const matches = collectMatches(tr.doc, prev.query, prev.opts);
        const active = Math.min(prev.active, Math.max(matches.length - 1, 0));
        return { ...prev, matches, active };
      }
      return prev;
    },
  },
  props: {
    decorations(state) {
      const s = findKey.getState(state);
      if (!s || s.matches.length === 0) return DecorationSet.empty;
      const decos = s.matches.map((m, i) =>
        Decoration.inline(m.from, m.to, {
          class: i === s.active ? "find-hit find-current" : "find-hit",
        }),
      );
      return DecorationSet.create(state.doc, decos);
    },
  },
});

/** 设置查找状态（matches 以当前文档实算）；传 null 清除 */
export function pushFindState(view: EditorView, s: FindState | null): void {
  const next =
    s && s.query !== ""
      ? { ...s, matches: collectMatches(view.state.doc, s.query, s.opts) }
      : null;
  view.dispatch(view.state.tr.setMeta(findKey, next));
}

/** 循环移动当前命中；无命中时静默 */
export function stepActive(view: EditorView, delta: 1 | -1): void {
  const s = findKey.getState(view.state);
  if (!s || s.matches.length === 0) return;
  const n = s.matches.length;
  const active = (((s.active + delta) % n) + n) % n;
  view.dispatch(view.state.tr.setMeta(findKey, { ...s, active }));
}
