import { useEffect, useRef, useState, type ReactNode } from "react";

const MIN_WIDTH = 180;
const maxWidth = () => Math.max(MIN_WIDTH, Math.min(600, window.innerWidth - 320));
const clampWidth = (width: number) => Math.max(MIN_WIDTH, Math.min(maxWidth(), width));

export default function ResizableSidebar({ children }: { children: ReactNode }) {
  const [width, setWidth] = useState(() => clampWidth(260));
  const drag = useRef<{ id: number; x: number; width: number } | null>(null);

  useEffect(() => {
    const resize = () => setWidth((current) => clampWidth(current));
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  return (
    <aside className="sidebar" style={{ width }}>
      {children}
      <div
        className="sidebar-resizer"
        role="separator"
        aria-label="调整侧栏宽度"
        aria-orientation="vertical"
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={maxWidth()}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          drag.current = { id: event.pointerId, x: event.clientX, width };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (start?.id === event.pointerId) {
            setWidth(clampWidth(start.width + event.clientX - start.x));
          }
        }}
        onPointerUp={(event) => {
          if (drag.current?.id !== event.pointerId) return;
          drag.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => { drag.current = null; }}
        onLostPointerCapture={() => { drag.current = null; }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          setWidth((current) => clampWidth(current + (event.key === "ArrowLeft" ? -10 : 10)));
        }}
      />
    </aside>
  );
}
