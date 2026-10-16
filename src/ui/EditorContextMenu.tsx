import { useEffect, useState } from "react";
import { buildEditorMenu, COMMANDS } from "../editor/commands";

const MARGIN = 8;

interface MenuState {
  x: number;
  y: number;
  inTable: boolean;
  inCodeBlock: boolean;
}

/** 编辑区右键上下文菜单：document 级监听，命中 .ProseMirror 内才接管 */
export default function EditorContextMenu({
  onCommand,
  enabled,
}: {
  onCommand: (key: string) => void;
  enabled: boolean;
}) {
  const [menu, setMenu] = useState<MenuState | null>(null);

  useEffect(() => {
    if (!enabled) {
      setMenu(null);
      return;
    }
    const onCtx = (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target || !target.closest(".ProseMirror")) return;
      e.preventDefault();
      setMenu({
        x: e.clientX,
        y: e.clientY,
        inTable: !!target.closest("table"),
        inCodeBlock: !!target.closest("pre"),
      });
    };
    const onClose = () => setMenu(null);
    document.addEventListener("contextmenu", onCtx);
    document.addEventListener("mousedown", onClose);
    window.addEventListener("blur", onClose);
    return () => {
      document.removeEventListener("contextmenu", onCtx);
      document.removeEventListener("mousedown", onClose);
      window.removeEventListener("blur", onClose);
    };
  }, [enabled]);

  useEffect(() => {
    if (!menu) return;
    // 渲染后按实际尺寸夹取，防止贴边越界
    const el = document.querySelector(".editor-ctx-menu");
    if (!(el instanceof HTMLElement)) return;
    const left = Math.min(
      Math.max(MARGIN, menu.x),
      window.innerWidth - el.offsetWidth - MARGIN,
    );
    const top = Math.min(
      Math.max(MARGIN, menu.y),
      window.innerHeight - el.offsetHeight - MARGIN,
    );
    if (left !== menu.x || top !== menu.y) setMenu({ ...menu, x: left, y: top });
  }, [menu]);

  if (!menu) return null;
  const run = (key: string) => {
    setMenu(null);
    if (key === "copy-code") {
      const el = document.elementFromPoint(menu.x, menu.y);
      const pre = el instanceof Element ? el.closest("pre") : null;
      void navigator.clipboard.writeText(pre?.textContent ?? "");
      return;
    }
    if (COMMANDS[key]) onCommand(key);
  };

  return (
    <div
      className="ctx-menu editor-ctx-menu"
      style={{ left: menu.x, top: menu.y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {buildEditorMenu({
        inTable: menu.inTable,
        inCodeBlock: menu.inCodeBlock,
      }).map((group) => (
        <div key={group.title}>
          <div className="ctx-title">{group.title}</div>
          {group.items.map((item) => (
            <button
              key={item.key}
              className="ctx-item"
              onClick={() => run(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
