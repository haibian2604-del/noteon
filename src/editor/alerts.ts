import { $prose } from "@milkdown/kit/utils";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorState } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";

export type AlertKind = "note" | "tip" | "important" | "warning" | "caution";

export const ALERT_KINDS: AlertKind[] = [
  "note",
  "tip",
  "important",
  "warning",
  "caution",
];

export const ALERT_LABELS: Record<AlertKind, string> = {
  note: "注意",
  tip: "建议",
  important: "重要",
  warning: "警告",
  caution: "危险",
};

// GitHub Flavored Alerts:首行必须是 [!KIND] 整行（允许尾随空白）
const ALERT_RE = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i;

export function parseAlertLine(text: string): AlertKind | null {
  const m = ALERT_RE.exec(text);
  if (!m) return null;
  return m[1].toLowerCase() as AlertKind;
}

export interface AlertHit {
  /** blockquote 在文档中的位置 */
  quotePos: number;
  kind: AlertKind;
  /** [!KIND] 标记的文档区间（供 decoration 隐藏） */
  markerFrom: number;
  markerTo: number;
}

/** 段落首个内联文本节点序列（遇到硬换行即截断） */
function firstLineText(par: PMNode): string {
  let out = "";
  let stopped = false;
  par.content.forEach((child) => {
    if (stopped) return;
    if (child.type.name === "hardbreak") {
      stopped = true;
      return;
    }
    if (child.isText) out += child.text ?? "";
  });
  return out;
}

/** 找段落（或嵌套结构里第一个文本块）的首行，整行匹配才算警告框 */
function scanQuote(doc: PMNode, quotePos: number, quote: PMNode): AlertHit | null {
  let textBlock: PMNode | null = null;
  let textStart = -1;
  // nodesBetween 给绝对位置；文本块内容从节点位置 +1 开始
  doc.nodesBetween(quotePos + 1, quotePos + quote.nodeSize, (child, pos) => {
    if (!textBlock && child.isTextblock) {
      textBlock = child;
      textStart = pos + 1;
      return false;
    }
    return !textBlock;
  });
  if (!textBlock) return null;
  const line = firstLineText(textBlock);
  const kind = parseAlertLine(line);
  if (!kind) return null;
  return {
    quotePos,
    kind,
    markerFrom: textStart,
    markerTo: textStart + line.length,
  };
}

/** 只认"blockquote 第一个子节点的第一个文本块的第一行" */
export function scanAlerts(doc: PMNode): AlertHit[] {
  const hits: AlertHit[] = [];
  doc.forEach((node, offset) => {
    if (node.type.name !== "blockquote") return;
    const hit = scanQuote(doc, offset, node);
    if (hit) hits.push(hit);
  });
  return hits;
}

function buildDecorations(state: EditorState): DecorationSet {
  const hits = scanAlerts(state.doc);
  if (hits.length === 0) return DecorationSet.empty;
  const decos: Decoration[] = [];
  for (const hit of hits) {
    const quote = state.doc.nodeAt(hit.quotePos);
    if (!quote) continue;
    decos.push(
      Decoration.node(hit.quotePos, hit.quotePos + quote.nodeSize, {
        class: `md-alert md-alert-${hit.kind}`,
      }),
      Decoration.inline(hit.markerFrom, hit.markerTo, {
        class: "alert-marker",
      }),
    );
  }
  return DecorationSet.create(state.doc, decos);
}

// decoration 只加类不改 doc：序列化输出不变，marker 靠 CSS 隐藏
export const alertPlugin = $prose(
  () =>
    new Plugin({
      key: new PluginKey("noteon-alerts"),
      props: {
        decorations(state: EditorState): DecorationSet {
          return buildDecorations(state);
        },
      },
    }),
);
