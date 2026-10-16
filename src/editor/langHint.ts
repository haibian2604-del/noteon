import { Plugin, PluginKey, type EditorState } from "@milkdown/kit/prose/state";
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

/** 确认语言：替换 ``` 前缀里的 query，补一个空格触发 code_block 输入规则 */
function pickLang(view: EditorView, lang: string): void {
  const hint = langHintKey.getState(view.state);
  if (!hint || !lang) return;
  const { from } = hint;
  const to = from + hint.query.length;
  view.dispatch(view.state.tr.insertText(`${lang} `, from, to));
}
