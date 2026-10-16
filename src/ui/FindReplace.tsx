import { useEffect, useState } from "react";
import type { EditorView } from "@milkdown/kit/prose/view";
import {
  findKey,
  pushFindState,
  replaceAllMatches,
  stepActive,
  type FindOptions,
} from "../editor/findReplace";

/** 编辑区右上角查找替换面板；状态保存在本组件，关闭再开不丢 query/opts */
export default function FindReplace({
  open,
  onClose,
  getView,
}: {
  open: boolean;
  onClose: () => void;
  getView: () => EditorView | null;
}) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [opts, setOpts] = useState<FindOptions>({
    regex: false,
    caseSensitive: false,
  });
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const view = getView();
    if (!view) return;
    if (!open || query === "") {
      pushFindState(view, null);
      return;
    }
    pushFindState(view, { query, opts, matches: [], active: 0 });
    requestAnimationFrame(() => {
      document
        .querySelector(".find-current")
        ?.scrollIntoView({ block: "center" });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, opts.regex, opts.caseSensitive]);

  // 替换/输入会改变文档，插件状态随之重算；父组件因 content 变化重渲染时顺带刷新计数
  const view = open ? getView() : null;
  const st = view ? findKey.getState(view.state) : null;
  const total = st?.matches.length ?? 0;
  const current = total > 0 ? (st?.active ?? 0) + 1 : 0;

  const jump = (delta: 1 | -1) => {
    const view = getView();
    if (!view) return;
    stepActive(view, delta);
    requestAnimationFrame(() => {
      document
        .querySelector(".find-current")
        ?.scrollIntoView({ block: "center" });
    });
  };

  const replaceCurrent = () => {
    const view = getView();
    const s = view && findKey.getState(view.state);
    if (!view || !s || s.matches.length === 0) return;
    const m = s.matches[Math.min(s.active, s.matches.length - 1)];
    view.dispatch(view.state.tr.insertText(replacement, m.from, m.to));
  };

  const replaceAll = () => {
    const view = getView();
    if (!view || query === "") return;
    const n = replaceAllMatches(view, query, replacement, opts);
    setNotice(n > 0 ? `已替换 ${n} 处` : "无匹配");
    window.setTimeout(() => setNotice(null), 2000);
  };

  if (!open) return null;
  return (
    <div className="find-bar">
      <input
        className="find-input"
        placeholder="查找…（Enter 下一个）"
        value={query}
        autoFocus
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Enter") {
            e.preventDefault();
            jump(e.shiftKey ? -1 : 1);
          }
        }}
      />
      <button
        className={`find-toggle${opts.regex ? " on" : ""}`}
        title="正则模式"
        aria-pressed={opts.regex}
        onClick={() => setOpts((o) => ({ ...o, regex: !o.regex }))}
      >
        .*
      </button>
      <button
        className={`find-toggle${opts.caseSensitive ? " on" : ""}`}
        title="区分大小写"
        aria-pressed={opts.caseSensitive}
        onClick={() => setOpts((o) => ({ ...o, caseSensitive: !o.caseSensitive }))}
      >
        Aa
      </button>
      <span className="find-count">
        {total > 0 ? `${current}/${total}` : query === "" ? "" : "0/0"}
      </span>
      <button className="find-btn" title="上一个" onClick={() => jump(-1)}>
        ↑
      </button>
      <button className="find-btn" title="下一个" onClick={() => jump(1)}>
        ↓
      </button>
      <input
        className="find-input find-replace"
        placeholder="替换为…"
        value={replacement}
        onChange={(e) => setReplacement(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      />
      <button className="find-btn" onClick={replaceCurrent}>
        替换
      </button>
      <button className="find-btn" onClick={replaceAll}>
        全部替换
      </button>
      {notice && <span className="find-notice">{notice}</span>}
    </div>
  );
}
