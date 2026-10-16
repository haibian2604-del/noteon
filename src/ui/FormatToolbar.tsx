import { useEffect, useState } from "react";
import { TOOLBAR_ITEMS } from "../editor/commands";

/** 展示短形：由 key 推导，不进配置 */
const GLYPHS: Record<string, string> = {
  bold: "B",
  italic: "I",
  strike: "S",
  "inline-code": "<>",
  link: "🔗",
  h1: "H1",
  h2: "H2",
  h3: "H3",
  quote: "❝",
  "bullet-list": "•≡",
  "ordered-list": "1≡",
  "code-block": "{ }",
  table: "▦",
  hr: "—",
};

const MARGIN = 8;

interface Pos {
  left: number;
  top: number;
}

/** 选区首矩形；折叠/无矩形返回 null */
function selectionRect(): DOMRect | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const anchor = sel.anchorNode;
  const el =
    anchor instanceof Element
      ? anchor
      : (anchor?.parentElement ?? null);
  if (!el || !el.closest(".ProseMirror")) return null;
  const range = sel.getRangeAt(0);
  const rects = range.getClientRects();
  const rect =
    (rects.length > 0 ? rects[0] : null) ?? range.getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0)) return null;
  return rect;
}

export default function FormatToolbar({
  onCommand,
  enabled,
}: {
  onCommand: (key: string) => void;
  enabled: boolean;
}) {
  const [pos, setPos] = useState<Pos | null>(null);

  useEffect(() => {
    const update = () => {
      if (!enabled) {
        setPos(null);
        return;
      }
      const rect = selectionRect();
      if (!rect) {
        setPos(null);
        return;
      }
      // 预估尺寸先行，渲染后按实际尺寸校正（见下方 effect）
      const w = 480;
      const h = 36;
      const left = Math.min(
        Math.max(MARGIN, rect.left + rect.width / 2 - w / 2),
        window.innerWidth - w - MARGIN,
      );
      const top = Math.min(
        Math.max(MARGIN, rect.top - h - MARGIN),
        window.innerHeight - h - MARGIN,
      );
      setPos({ left, top });
    };
    document.addEventListener("selectionchange", update);
    window.addEventListener("resize", update);
    return () => {
      document.removeEventListener("selectionchange", update);
      window.removeEventListener("resize", update);
    };
  }, [enabled]);

  // 渲染后按实际尺寸再夹取一次，防止贴边越界
  useEffect(() => {
    if (!pos) return;
    const el = document.querySelector(".format-toolbar");
    if (!(el instanceof HTMLElement)) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.min(Math.max(MARGIN, pos.left), window.innerWidth - w - MARGIN);
    const top = Math.min(Math.max(MARGIN, pos.top), window.innerHeight - h - MARGIN);
    if (left !== pos.left || top !== pos.top) setPos({ left, top });
  }, [pos]);

  if (!pos) return null;
  return (
    <div className="format-toolbar" style={{ left: pos.left, top: pos.top }}>
      {TOOLBAR_ITEMS.map((item) => (
        <button
          key={item.key}
          className="ft-btn"
          title={item.title}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onCommand(item.key)}
        >
          {GLYPHS[item.key] ?? item.title}
        </button>
      ))}
    </div>
  );
}
