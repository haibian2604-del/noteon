/** 只缩放编辑内容，保持应用控件尺寸及 Markdown 内容不变。 */
export function attachContentZoom(content: HTMLElement): () => void {
  let zoom = 1;
  let gestureStartZoom = 1;
  let pinching = false;
  const apply = (value: number) => {
    if (!Number.isFinite(value)) return;
    zoom = Math.round(Math.min(2, Math.max(0.5, value)) * 1000) / 1000;
    content.style.setProperty("--content-zoom", String(zoom));
    // 浮动工具栏及 CodeMirror 需要在缩放后重新测量位置。
    window.dispatchEvent(new Event("resize"));
  };
  const onKey = (event: KeyboardEvent) => {
    if (!event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target;
    if (target instanceof Element && !content.contains(target) &&
        target.closest("input, textarea, select, [contenteditable]")) return;
    if (!["+", "=", "-", "0"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    apply(event.key === "0" ? 1 : zoom + (event.key === "-" ? -0.1 : 0.1));
  };
  const onGestureStart = (event: Event) => {
    event.preventDefault();
    pinching = true;
    gestureStartZoom = zoom;
  };
  const onGestureChange = (event: Event) => {
    event.preventDefault();
    if (pinching) apply(gestureStartZoom * (event as Event & { scale: number }).scale);
  };
  const onGestureEnd = (event: Event) => {
    event.preventDefault();
    pinching = false;
  };
  const onWheel = (event: WheelEvent) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    // WebKit 手势期间忽略兼容 wheel 事件，避免一次捏合缩放两次。
    if (!pinching) apply(zoom * Math.exp(-event.deltaY * 0.01));
  };
  content.style.setProperty("--content-zoom", "1");
  window.addEventListener("keydown", onKey, true);
  content.addEventListener("gesturestart", onGestureStart, { passive: false });
  content.addEventListener("gesturechange", onGestureChange, { passive: false });
  content.addEventListener("gestureend", onGestureEnd, { passive: false });
  content.addEventListener("wheel", onWheel, { passive: false });
  return () => {
    window.removeEventListener("keydown", onKey, true);
    content.removeEventListener("gesturestart", onGestureStart);
    content.removeEventListener("gesturechange", onGestureChange);
    content.removeEventListener("gestureend", onGestureEnd);
    content.removeEventListener("wheel", onWheel);
  };
}
