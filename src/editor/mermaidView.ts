import { $view } from "@milkdown/kit/utils";
import { codeBlockSchema } from "@milkdown/kit/preset/commonmark";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import type { EditorView, NodeView } from "@milkdown/kit/prose/view";

type MermaidApi = (typeof import("mermaid"))["default"];
type MermaidThemeName = "default" | "dark";

let renderSeq = 0;
let mermaidPromise: Promise<MermaidApi> | null = null;
let mermaidTheme: MermaidThemeName = "default";
const themeListeners = new Set<() => void>();

function loadMermaid(): Promise<MermaidApi> {
  mermaidPromise ??= import("mermaid").then((m) => {
    m.default.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: mermaidTheme,
    });
    return m.default;
  });
  return mermaidPromise;
}

/** 主题切换时重建 mermaid 实例并重渲染所有图表 */
export function setMermaidTheme(theme: "github" | "night"): void {
  const next = theme === "night" ? "dark" : "default";
  if (next === mermaidTheme) return;
  mermaidTheme = next;
  mermaidPromise = null;
  themeListeners.forEach((fn) => fn());
}

/**
 * mermaid 代码块节点视图：默认渲染图表，光标进入节点时切回源码编辑
 * （Typora 行为）。非 mermaid 代码块返回 null，走默认 pre/code 渲染。
 */
class MermaidNodeView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private node: PMNode;
  private view: EditorView;
  private getPos: () => number | undefined;
  private editing = false;
  private renderDiv: HTMLElement;
  private pre: HTMLElement;
  private timer: number | undefined;
  private onTheme = (): void => {
    if (!this.editing) this.scheduleRender(true);
  };

  constructor(node: PMNode, view: EditorView, getPos: () => number | undefined) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;

    this.dom = document.createElement("div");
    this.dom.className = "mermaid-block";
    this.pre = document.createElement("pre");
    this.pre.className = "mermaid-src";
    this.contentDOM = document.createElement("code");
    this.pre.appendChild(this.contentDOM);
    this.renderDiv = document.createElement("div");
    this.renderDiv.className = "mermaid-render";
    this.dom.append(this.pre, this.renderDiv);
    themeListeners.add(this.onTheme);
    this.applyMode();
  }

  private selectionInside(): boolean {
    const pos = this.getPos();
    if (pos === undefined) return false;
    const { from, to } = this.view.state.selection;
    return from >= pos && to <= pos + this.node.nodeSize;
  }

  private applyMode(): void {
    this.dom.classList.toggle("editing", this.editing);
    if (!this.editing) this.scheduleRender(true);
  }

  update(node: PMNode): boolean {
    this.node = node;
    const inside = this.selectionInside();
    if (!this.editing && inside) {
      this.editing = true;
      this.applyMode();
    } else if (this.editing && !inside) {
      this.editing = false;
      this.applyMode();
    } else if (!this.editing) {
      this.scheduleRender(false);
    }
    return true;
  }

  private scheduleRender(immediate: boolean): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(
      () => void this.render(),
      immediate ? 0 : 600,
    );
  }

  private async render(): Promise<void> {
    if (this.editing) return;
    const code = this.node.textContent;
    try {
      const mermaid = await loadMermaid();
      const { svg } = await mermaid.render(`noteon-mmd-${renderSeq++}`, code);
      this.renderDiv.innerHTML = svg;
      this.renderDiv.classList.remove("error");
    } catch (e) {
      this.renderDiv.textContent = String(e);
      this.renderDiv.classList.add("error");
    }
  }

  // mermaid 往 renderDiv 写 SVG 的 DOM 变更与 PM 无关，全部忽略
  ignoreMutation(): boolean {
    return true;
  }

  destroy(): void {
    themeListeners.delete(this.onTheme);
    window.clearTimeout(this.timer);
  }
}

/**
 * 普通（非 mermaid）代码块的节点视图：默认 pre > code 结构 + 右下角语言标签
 * （Typora 行为）。语言为空时标签隐藏。
 */
class LabeledCodeBlockView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private label: HTMLElement;

  constructor(node: PMNode) {
    this.dom = document.createElement("pre");
    this.dom.className = "code-block";
    this.label = document.createElement("span");
    this.label.className = "code-lang-label";
    this.contentDOM = document.createElement("code");
    this.dom.append(this.contentDOM, this.label);
    this.update(node);
  }

  update(node: PMNode): boolean {
    if (node.type.name !== "code_block") return false;
    this.label.textContent = String(node.attrs.language ?? "");
    return true;
  }

  // 只有标签是自管 DOM；contentDOM 内的变更必须交给 PM 处理
  ignoreMutation(m: { target: Node }): boolean {
    return m.target !== this.contentDOM && !this.contentDOM.contains(m.target);
  }

  destroy(): void {
    this.label.remove();
  }
}

export const mermaidView = $view(codeBlockSchema.node, () => {
  return function (
    this: unknown,
    node: PMNode,
    view: EditorView,
    getPos: () => number | undefined,
  ): NodeView {
    if (node.attrs.language !== "mermaid") {
      return new LabeledCodeBlockView(node);
    }
    return new MermaidNodeView(node, view, getPos);
  };
});
