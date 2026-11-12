import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import MilkdownEditor from "./MilkdownEditor";

it("disables automatic capitalization and correction on the actual editing surface", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const ready = vi.fn();
  try {
    await act(async () => {
      root.render(<MilkdownEditor defaultValue="hello" onChange={() => {}} onReady={ready} getDocPath={() => null} />);
    });
    await vi.waitFor(() => expect(ready).toHaveBeenCalled(), { timeout: 10000 });
    const surface = host.querySelector(".ProseMirror")!;
    expect(surface.getAttribute("autocapitalize")).toBe("off");
    expect(surface.getAttribute("autocorrect")).toBe("off");
    expect(surface.getAttribute("spellcheck")).toBe("false");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
