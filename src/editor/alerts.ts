import { $prose } from "@milkdown/kit/utils";
import type { Editor } from "@milkdown/kit/core";
import { editorViewCtx } from "@milkdown/kit/core";
import { callCommand } from "@milkdown/kit/utils";
import { wrapInBlockquoteCommand } from "@milkdown/kit/preset/commonmark";
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

interface QuoteHead {
  /** 第一个文本块的内容起点（文档绝对位置） */
  textStart: number;
  /** 首行整行文本 */
  line: string;
  /** 首行匹配到的警告框类型；null = 非警告框 */
  kind: AlertKind | null;
}

/** 找段落（或嵌套结构里第一个文本块）的首行，供扫描与 applyAlert 复用 */
function scanQuoteHead(
  doc: PMNode,
  quotePos: number,
  quote: PMNode,
): QuoteHead | null {
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
  return { textStart, line, kind: parseAlertLine(line) };
}

/** 只认"blockquote 第一个子节点的第一个文本块的第一行" */
export function scanAlerts(doc: PMNode): AlertHit[] {
  const hits: AlertHit[] = [];
  doc.forEach((node, offset) => {
    if (node.type.name !== "blockquote") return;
    const head = scanQuoteHead(doc, offset, node);
    if (head?.kind) {
      hits.push({
        quotePos: offset,
        kind: head.kind,
        markerFrom: head.textStart,
        markerTo: head.textStart + head.line.length,
      });
    }
  });
  return hits;
}

/**
 * 对当前选区应用警告框：不在引用内先包一层，然后在引用头部插入
 * 独占一行的 [!KIND] 段落（已有 marker 则原位替换并统一为大写）。
 * 包引用与写 marker 相邻同刻提交，历史合并为一步撤销。
 */
export function applyAlert(ed: Editor, kind: AlertKind): void {
  ed.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const MARKER = "[!" + kind.toUpperCase() + "]";
    if (view.state.selection.$from.node(1).type.name !== "blockquote") {
      callCommand(wrapInBlockquoteCommand.key)(ctx);
    }
    const $from = view.state.selection.$from;
    if ($from.depth < 1 || $from.node(1).type.name !== "blockquote") return;
    const quotePos = $from.before(1);
    const doc = view.state.doc;
    const quote = doc.nodeAt(quotePos);
    if (!quote) return;
    const head = scanQuoteHead(doc, quotePos, quote);
    if (!head) return;
    const schema = doc.type.schema;
    const tr = view.state.tr;
    if (head.kind) {
      // 原位替换 marker（首行整段就是 marker 时的常规路径）
      const markerEnd = head.textStart + head.line.length;
      tr.replaceWith(head.textStart, markerEnd, schema.text(MARKER));
    } else {
      // marker 独立成段，插在引用最前（硬换行会序列化成 \，GitHub 不认）
      const par = schema.nodes.paragraph.create(null, schema.text(MARKER));
      tr.insert(quotePos + 1, par);
    }
    view.dispatch(tr);
  });
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
