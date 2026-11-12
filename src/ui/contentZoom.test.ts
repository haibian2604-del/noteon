import { afterEach, describe, expect, it } from "vitest";
import { attachContentZoom } from "./contentZoom";

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  document.body.replaceChildren();
});

function setup() {
  const content = document.createElement("main");
  const editor = document.createElement("div");
  editor.contentEditable = "true";
  content.append(editor);
  document.body.append(content);
  dispose = attachContentZoom(content);
  return { content, editor, zoom: () => Number(content.style.getPropertyValue("--content-zoom")) };
}

function key(target: HTMLElement, value: string, options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", {
    key: value, metaKey: true, bubbles: true, cancelable: true, ...options,
  });
  target.dispatchEvent(event);
  return event;
}

function gesture(target: HTMLElement, type: string, scale = 1) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "scale", { value: scale });
  target.dispatchEvent(event);
  return event;
}

describe("content zoom", () => {
  it("handles Command +/=/- and reset before editor key handlers", () => {
    const { editor, zoom } = setup();
    let reachedEditor = false;
    editor.addEventListener("keydown", () => { reachedEditor = true; });
    expect(key(editor, "=").defaultPrevented).toBe(true);
    expect(zoom()).toBe(1.1);
    key(editor, "+", { shiftKey: true });
    expect(zoom()).toBe(1.2);
    key(editor, "-");
    expect(zoom()).toBe(1.1);
    key(editor, "0");
    expect(zoom()).toBe(1);
    expect(reachedEditor).toBe(false);
  });

  it("keeps ordinary typing and controls outside the content unchanged", () => {
    const { editor, zoom } = setup();
    expect(key(editor, "+", { metaKey: false }).defaultPrevented).toBe(false);
    expect(key(editor, "-", { altKey: true }).defaultPrevented).toBe(false);
    const input = document.createElement("input");
    document.body.append(input);
    expect(key(input, "+").defaultPrevented).toBe(false);
    expect(zoom()).toBe(1);
  });

  it("clamps repeated keyboard and pinch zoom to 50–200%", () => {
    const { content, editor, zoom } = setup();
    for (let i = 0; i < 30; i++) key(editor, "+");
    expect(zoom()).toBe(2);
    for (let i = 0; i < 30; i++) key(editor, "-");
    expect(zoom()).toBe(0.5);
    gesture(content, "gesturestart");
    gesture(content, "gesturechange", 10);
    expect(zoom()).toBe(2);
    gesture(content, "gesturechange", 0.1);
    expect(zoom()).toBe(0.5);
  });

  it("uses each pinch's starting zoom and preserves ordinary two-finger scrolling", () => {
    const { content, zoom } = setup();
    expect(gesture(content, "gesturestart").defaultPrevented).toBe(true);
    gesture(content, "gesturechange", 1.2);
    gesture(content, "gesturechange", 1.5);
    expect(zoom()).toBe(1.5);
    gesture(content, "gestureend");
    gesture(content, "gesturestart");
    gesture(content, "gesturechange", 0.8);
    expect(zoom()).toBe(1.2);
    gesture(content, "gestureend");
    const scroll = new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true });
    content.dispatchEvent(scroll);
    expect(scroll.defaultPrevented).toBe(false);
    expect(zoom()).toBe(1.2);
  });

  it("supports ctrl-wheel pinch without doubling WebKit gestures and removes listeners", () => {
    const { content, editor, zoom } = setup();
    const pinch = () => content.dispatchEvent(new WheelEvent("wheel", {
      ctrlKey: true, deltaY: -10, bubbles: true, cancelable: true,
    }));
    pinch();
    expect(zoom()).toBeGreaterThan(1);
    gesture(content, "gesturestart");
    gesture(content, "gesturechange", 1.2);
    const duringGesture = zoom();
    pinch();
    expect(zoom()).toBe(duringGesture);
    gesture(content, "gestureend");
    pinch();
    expect(zoom()).toBeGreaterThan(duringGesture);
    const beforeDispose = zoom();
    dispose?.();
    key(editor, "+");
    gesture(content, "gesturestart");
    gesture(content, "gesturechange", 2);
    pinch();
    expect(zoom()).toBe(beforeDispose);
  });
});
