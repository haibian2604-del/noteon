import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import App from "./App";

const native = vi.hoisted(() => ({
  handlers: new Map<string, (event: { payload: string }) => void>(),
  invoke: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: native.invoke }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (name, handler) => {
    native.handlers.set(name, handler);
    return () => { if (native.handlers.get(name) === handler) native.handlers.delete(name); };
  }),
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ setTitle: async () => {} }),
}));
vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({ onDragDropEvent: async () => () => {} }),
}));
vi.mock("./editor/MilkdownEditor", () => ({ default: () => null }));

it("replaces an old workspace when opening an external file, preserves subfolders and keeps it on read failure", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.setItem("noteon.workspace", "/old");
  const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
  let finishNewDirectory: (value: unknown) => void = () => {};
  native.invoke.mockImplementation(async (command, args) => {
    if (command === "take_pending_open") return null;
    if (command === "read_text_file") {
      if (args.path === "/missing/note.md") throw new Error("missing");
      return "# note";
    }
    if (command === "list_dir") {
      if (args.path === "/old-other") return new Promise(resolve => { finishNewDirectory = resolve; });
      return [{ name: "old.md", path: "/old/old.md", is_dir: false }];
    }
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const emit = async (name: string, payload: string) => {
    await act(async () => { native.handlers.get(name)!({ payload }); });
  };
  try {
    await act(async () => root.render(<App />));
    await emit("noteon://menu", "sidebar:files");
    expect(host.querySelector(".sidebar")?.textContent).toContain("old.md");
    await emit("noteon://open-file", "/old/sub/note.md");
    expect(localStorage.getItem("noteon.workspace")).toBe("/old");
    await emit("noteon://open-file", "/old-other/note.md");
    expect(localStorage.getItem("noteon.workspace")).toBe("/old-other");
    expect(host.querySelector(".sidebar")?.textContent).not.toContain("old.md");
    await act(async () => finishNewDirectory([{ name: "new.md", path: "/old-other/new.md", is_dir: false }]));
    expect(host.querySelector(".sidebar")?.textContent).toContain("new.md");
    await emit("noteon://open-file", "/missing/note.md");
    expect(alert).toHaveBeenCalled();
    expect(localStorage.getItem("noteon.workspace")).toBe("/old-other");
    expect(host.querySelector(".sidebar")?.textContent).toContain("new.md");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    localStorage.clear();
    native.handlers.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
