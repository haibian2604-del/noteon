import { Plugin, PluginKey, TextSelection, type EditorState } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

/** Typora 式语言提示：在段落里输入 ``` 前缀后弹出语言候选，↑↓ 选择、回车/点击确认 */

interface LangEntry {
  name: string;
  aliases: string[];
}

let allLangs: LangEntry[] = [];
let langsReady = false;

// 懒加载语言表（highlight.js 语言定义自带 aliases，如 py→python、js→javascript）
void import("lowlight").then(({ all }) => {
  allLangs = Object.entries(all).map(([name, lang]) => ({
    name,
    aliases: ((lang as unknown as { aliases?: string[] }).aliases ?? []) as string[],
  }));
  allLangs.sort((a, b) => a.name.localeCompare(b.name));
  langsReady = true;
});

export const langHintKey = new PluginKey<HintState | undefined>("lang-hint");

interface HintState {
  query: string;
  /** ```<query> 中 query 起始的文档位置 */
  from: number;
  items: string[];
  selected: number;
}

interface HintMeta {
  hide?: boolean;
  selected?: number;
}

const MAX_ITEMS = 8;

function filterLangs(query: string): string[] {
  const q = query.toLowerCase();
  const hit = (l: LangEntry) =>
    l.name.toLowerCase().startsWith(q) || l.aliases.some((a) => a.toLowerCase().startsWith(q));
  // 精确命中（别名或名称全等）排最前，其余按名称
  const scored = allLangs.filter(hit);
  scored.sort((a, b) => {
    const ea = a.aliases.some((x) => x.toLowerCase() === q) || a.name.toLowerCase() === q ? 0 : 1;
    const eb = b.aliases.some((x) => x.toLowerCase() === q) || b.name.toLowerCase() === q ? 0 : 1;
    return ea - eb;
  });
  return scored.slice(0, MAX_ITEMS).map((l) => l.name);
}

/** 光标前文本是否为完整的 ```<query>（行首），是则返回 query */
function queryAt(sel: EditorState["selection"]): string | null {
  const { $from, empty } = sel;
  if (!empty) return null;
  const node = $from.parent;
  if (node.type.name !== "paragraph") return null;
  if ($from.parentOffset < 4) return null;
  const before = node.textBetween(Math.max(0, $from.parentOffset - 32), $from.parentOffset);
  const m = /```([a-zA-Z0-9_-]+)$/.exec(before);
  return m ? m[1] : null;
}

export function createLangHintPlugin(): Plugin<HintState | undefined> {
  return new Plugin<HintState | undefined>({
    key: langHintKey,
  state: {
    init: () => undefined,
    apply(tr, value) {
      const meta = tr.getMeta(langHintKey) as HintMeta | undefined;
      if (meta) {
        if (meta.hide) return undefined;
        if (value && meta.selected !== undefined) return { ...value, selected: meta.selected };
        return value;
      }
      if (!tr.docChanged && !tr.selectionSet) return value;
      const q = queryAt(tr.selection);
      if (q === null || !langsReady) return undefined;
      if (value && q === value.query) return value;
      const items = filterLangs(q);
      if (items.length === 0) return undefined;
      const { $from } = tr.selection;
      return { query: q, from: $from.pos - q.length, items, selected: 0 };
    },
  },
  props: {
    handleKeyDown(view, event) {
      const hint = langHintKey.getState(view.state);
      if (!hint) return false;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const delta = event.key === "ArrowDown" ? 1 : -1;
        view.dispatch(
          view.state.tr.setMeta(langHintKey, {
            selected: (hint.selected + delta + hint.items.length) % hint.items.length,
          }),
        );
        return true;
      }
      if (event.key === "Escape") {
        view.dispatch(view.state.tr.setMeta(langHintKey, { hide: true }));
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        pickLang(view, hint.items[hint.selected]);
        return true;
      }
      return false;
    },
  },
  view() {
    const popup = document.createElement("div");
    popup.className = "lang-hint";
    popup.style.display = "none";
    document.body.appendChild(popup);

    const hide = () => {
      popup.style.display = "none";
      popup.innerHTML = "";
    };

    const render = (view: EditorView, hint: HintState) => {
      popup.innerHTML = "";
      hint.items.forEach((name, i) => {
        const row = document.createElement("div");
        row.className = `lang-hint-item${i === hint.selected ? " sel" : ""}`;
        row.textContent = name;
        row.onmousedown = (e) => {
          e.preventDefault(); // 抢在 blur 前完成选择
          pickLang(view, name);
        };
        popup.appendChild(row);
      });
      popup.style.display = "block";
      try {
        const { left, bottom } = view.coordsAtPos(hint.from);
        popup.style.left = `${left}px`;
        popup.style.top = `${bottom + 4}px`;
      } catch {
        /* 位置失效时下一轮事务会重算 */
      }
    };

    const onScroll = () => hide();
    document.addEventListener("scroll", onScroll, true);

    return {
      update(view) {
        const hint = langHintKey.getState(view.state);
        if (!hint) {
          hide();
          return;
        }
        render(view, hint);
      },
      destroy() {
        document.removeEventListener("scroll", onScroll, true);
        popup.remove();
      },
    };
  },
  });
}

/** 确认语言：程序化 insertText 不会触发输入规则，直接把段落转成 code_block */
function pickLang(view: EditorView, lang: string): void {
  const hint = langHintKey.getState(view.state);
  if (!hint || !lang) return;
  const { state } = view;
  const $from = state.selection.$from;
  if ($from.parent.type.name !== "paragraph") return;
  const type = state.schema.nodes.code_block;
  if (!type) return;
  const start = $from.start();
  // 连 ``` 围栏一起清掉（hint.from 是 query 起点）
  const tr = state.tr.delete(hint.from - 3, hint.from + hint.query.length);
  tr.setNodeMarkup(start - 1, type, { language: lang });
  tr.setSelection(
    TextSelection.near(tr.doc.resolve(tr.mapping.map(start)), 1),
  );
  view.dispatch(tr.scrollIntoView());
}

/* ── 点击代码块右下角语言标签弹出语言选择面板 ── */

let picker: {
  root: HTMLDivElement;
  input: HTMLInputElement;
  list: HTMLDivElement;
  items: string[];
  selected: number;
  onPick: (lang: string) => void;
  close: () => void;
} | null = null;

/** 在 anchor（标签位置）附近打开语言选择面板；onPick 收到选中的语言名 */
export function openLangPicker(
  anchor: DOMRect,
  current: string,
  onPick: (lang: string) => void,
): void {
  picker?.close();
  const root = document.createElement("div");
  root.className = "lang-hint lang-picker";
  const input = document.createElement("input");
  input.className = "lang-picker-input";
  input.value = current;
  const list = document.createElement("div");
  list.className = "lang-picker-list";
  root.append(input, list);
  document.body.appendChild(root);

  const close = () => {
    if (!picker) return;
    document.removeEventListener("mousedown", onOutside, true);
    root.remove();
    picker = null;
  };
  const pick = (lang: string) => {
    close();
    if (lang) onPick(lang);
  };
  const render = () => {
    if (!picker) return;
    const q = input.value.trim().toLowerCase();
    picker.items = q
      ? filterLangs(input.value.trim())
      : allLangs.slice(0, MAX_ITEMS).map((l) => l.name);
    picker.selected = 0;
    list.innerHTML = "";
    picker.items.forEach((name, i) => {
      const row = document.createElement("div");
      row.className = `lang-hint-item${i === picker!.selected ? " sel" : ""}`;
      row.textContent = name;
      row.onmousedown = (e) => {
        e.preventDefault();
        pick(name);
      };
      list.appendChild(row);
    });
    if (picker.items.length === 0) {
      list.textContent = "无匹配语言";
    }
  };
  const onOutside = (e: MouseEvent) => {
    if (!root.contains(e.target as Node)) close();
  };
  input.oninput = render;
  input.onkeydown = (e) => {
    if (!picker) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const delta = e.key === "ArrowDown" ? 1 : -1;
      picker.selected =
        (picker.selected + delta + picker.items.length) % picker.items.length;
      Array.from(list.children).forEach((el, i) =>
        el.classList.toggle("sel", i === picker!.selected),
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(picker.items[picker.selected] ?? input.value.trim());
    } else if (e.key === "Escape") {
      close();
    }
  };
  document.addEventListener("mousedown", onOutside, true);

  picker = { root, input, list, items: [], selected: 0, onPick, close };
  render();
  root.style.left = `${anchor.right - 180}px`;
  root.style.top = `${anchor.top - root.offsetHeight - 6}px`;
  input.focus();
  input.select();
}
