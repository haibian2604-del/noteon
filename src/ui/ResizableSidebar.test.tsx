import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import ResizableSidebar from "./ResizableSidebar";

it("resizes by dragging or keyboard, clamps width and stops on release or cancellation", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("innerWidth", 1000);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<ResizableSidebar>files</ResizableSidebar>));
    const sidebar = host.querySelector<HTMLElement>(".sidebar")!;
    const handle = host.querySelector<HTMLElement>('[role="separator"]')!;
    handle.setPointerCapture = vi.fn();
    handle.releasePointerCapture = vi.fn();
    const pointer = async (type: string, x: number, id = 1, button = 0) => {
      await act(async () => handle.dispatchEvent(Object.assign(
        new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, button }),
        { pointerId: id },
      )));
    };
    expect(sidebar.style.width).toBe("260px");
    await pointer("pointermove", 400);
    expect(sidebar.style.width).toBe("260px");
    await pointer("pointerdown", 260);
    expect(handle.setPointerCapture).toHaveBeenCalledWith(1);
    await pointer("pointermove", 400, 2);
    expect(sidebar.style.width).toBe("260px");
    await pointer("pointermove", 400);
    expect(sidebar.style.width).toBe("400px");
    expect(handle.getAttribute("aria-valuenow")).toBe("400");
    await pointer("pointermove", 2000);
    expect(sidebar.style.width).toBe("600px");
    await pointer("pointermove", -100);
    expect(sidebar.style.width).toBe("180px");
    await pointer("pointerup", 180);
    expect(handle.releasePointerCapture).toHaveBeenCalledWith(1);
    await pointer("pointermove", 400);
    expect(sidebar.style.width).toBe("180px");
    await act(async () => handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(sidebar.style.width).toBe("190px");
    await pointer("pointerdown", 190);
    await pointer("pointercancel", 190);
    await pointer("pointermove", 400);
    expect(sidebar.style.width).toBe("190px");
    await pointer("pointerdown", 190);
    await pointer("pointermove", 500);
    vi.stubGlobal("innerWidth", 640);
    await act(async () => window.dispatchEvent(new Event("resize")));
    expect(sidebar.style.width).toBe("320px");
    expect(handle.getAttribute("aria-valuemax")).toBe("320");
    await pointer("lostpointercapture", 500);
    await pointer("pointermove", 200);
    expect(sidebar.style.width).toBe("320px");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
