import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import FileFilterMenu from "./FileFilterMenu";
import type { FileFilterMode } from "./treeFilter";

it("selects filter modes and supports keyboard navigation, Escape and outside dismissal", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const change = vi.fn();
  function Fixture() {
    const [value, setValue] = useState<FileFilterMode>("default");
    return <FileFilterMenu value={value} onChange={(next) => { change(next); setValue(next); }} />;
  }
  const host = document.createElement("div");
  const outside = document.createElement("button");
  document.body.append(host, outside);
  const root = createRoot(host);
  const key = async (element: Element, value: string) => {
    await act(async () => element.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true })));
  };
  try {
    await act(async () => root.render(<Fixture />));
    const trigger = host.querySelector<HTMLButtonElement>(".file-filter-trigger")!;
    expect(trigger.textContent).toBe("隐藏点开头");
    await act(async () => trigger.click());
    const items = Array.from(host.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));
    expect(items).toHaveLength(3);
    expect(items[0].getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(items[0]);
    await key(items[0], "ArrowUp");
    expect(document.activeElement).toBe(items[2]);
    await key(items[2], "Home");
    expect(document.activeElement).toBe(items[0]);
    await key(items[0], "ArrowDown");
    expect(document.activeElement).toBe(items[1]);
    await act(async () => items[1].click());
    expect(change).toHaveBeenLastCalledWith("all");
    expect(trigger.textContent).toBe("全部");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
    await key(trigger, "ArrowDown");
    expect(host.querySelector('[aria-checked="true"]')?.textContent).toContain("全部");
    await key(document.activeElement!, "End");
    await act(async () => (document.activeElement as HTMLButtonElement).click());
    expect(change).toHaveBeenLastCalledWith("glob");
    expect(trigger.textContent).toBe("匹配模式");
    await act(async () => trigger.click());
    await key(document.activeElement!, "Escape");
    expect(host.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    await act(async () => trigger.click());
    await act(async () => outside.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(host.querySelector('[role="menu"]')).toBeNull();
    await act(async () => trigger.click());
    await act(async () => outside.focus());
    expect(host.querySelector('[role="menu"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove(); outside.remove();
    vi.unstubAllGlobals();
  }
});
