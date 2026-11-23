import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import App from "./App";

const native = vi.hoisted(() => ({
  handlers: new Map<string, (event: { payload: string }) => void>(),
  invoke: vi.fn(),
  changeDocument: (_markdown: string) => {},
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
vi.mock("./editor/MilkdownEditor", () => ({ default: ({ defaultValue, readOnly, typewriterMode, onChange }: { defaultValue: string; readOnly: boolean; typewriterMode: boolean; onChange: (markdown: string) => void }) => {
    native.changeDocument = onChange;
    return <div className="ProseMirror" data-readonly={String(readOnly)} data-typewriter={String(typewriterMode)}>{defaultValue}<a href="../specs/产品%20需求.md">PRD</a><a href="#目标">Anchor</a><h2 id="目标">目标</h2></div>;
  } }));

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

it("shows only the sidebar panel selected in the View menu and synchronizes its checkmark", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.setItem("noteon.workspace", "/notes");
  native.invoke.mockImplementation(async (command) => command === "list_dir" ? [] : null);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const select = async (panel: string) => {
    await act(async () => native.handlers.get("noteon://menu")!({ payload: `sidebar:${panel}` }));
  };
  try {
    await act(async () => root.render(<App />));
    for (const panel of ["files", "outline", "search"]) {
      await select(panel);
      expect(host.querySelector(".sidebar")).not.toBeNull();
      expect(host.querySelector(".sidebar-heading")).toBeNull();
      expect(host.querySelectorAll(".sidebar-tab")).toHaveLength(0);
      expect(Boolean(host.querySelector(".tree-filter"))).toBe(panel === "files");
      expect(Boolean(host.querySelector(".sidebar-search"))).toBe(panel === "search");
      expect(host.querySelector(".file-filter-menu")).toBeNull();
      const calls = native.invoke.mock.calls.filter(([command]) => command === "set_view_menu_checked");
      expect(calls[calls.length - 1]?.[1].checked).toMatchObject({
        "sidebar:files": panel === "files",
        "sidebar:outline": panel === "outline",
        "sidebar:search": panel === "search",
      });
    }
    await select("search");
    expect(host.querySelector(".sidebar")).toBeNull();
    const calls = native.invoke.mock.calls.filter(([command]) => command === "set_view_menu_checked");
    expect(calls[calls.length - 1]?.[1].checked).toMatchObject({
      "sidebar:files": false, "sidebar:outline": false, "sidebar:search": false,
    });
  } finally {
    await act(async () => root.unmount());
    host.remove();
    localStorage.clear();
    native.handlers.clear();
    vi.unstubAllGlobals();
  }
});


it("restores View selections and native checkmarks after remount", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  native.invoke.mockImplementation(async () => null);
  const host = document.createElement("div");
  document.body.append(host);
  let root = createRoot(host);
  try {
    await act(async () => root.render(<App />));
    for (const payload of ["sidebar:outline", "focus-mode", "typewriter-mode", "source-mode", "theme:night"]) {
      await act(async () => native.handlers.get("noteon://menu")!({ payload }));
    }
    await act(async () => root.unmount());
    root = createRoot(host);
    await act(async () => root.render(<App />));
    const calls = native.invoke.mock.calls.filter(([command]) => command === "set_view_menu_checked");
    expect(calls[calls.length - 1]?.[1].checked).toMatchObject({
      "sidebar:outline": true, "source-mode": true, "focus-mode": true,
      "typewriter-mode": true, "theme:night": true,
    });
    await act(async () => native.handlers.get("noteon://menu")!({ payload: "source-mode" }));
    expect(host.querySelector(".ProseMirror")?.getAttribute("data-readonly")).toBe("true");
    expect(host.querySelector(".ProseMirror")?.getAttribute("data-typewriter")).toBe("true");
  } finally {
    await act(async () => root.unmount()); host.remove(); localStorage.clear();
    native.handlers.clear(); vi.unstubAllGlobals();
  }
});

it("opens relative document links using the current document directory", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  native.invoke.mockImplementation(async (command) => command === "read_text_file" ? "# linked" : null);
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<App />));
    await act(async () => native.handlers.get("noteon://open-file")!({ payload: "/notes/docs/index.md" }));
    native.invoke.mockClear();
    await act(async () => host.querySelector<HTMLAnchorElement>(".ProseMirror a")!.click());
    expect(native.invoke).toHaveBeenCalledWith("read_text_file", { path: "/notes/specs/产品 需求.md" });
  } finally {
    await act(async () => root.unmount()); host.remove(); localStorage.clear();
    native.handlers.clear(); vi.unstubAllGlobals();
  }
});


it("scrolls in-document anchors and preserves unsaved content when navigation is cancelled", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  native.invoke.mockImplementation(async (command) => command === "read_text_file" ? "# linked" : null);
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<App />));
    const heading = host.querySelector<HTMLElement>("h2")!;
    heading.scrollIntoView = vi.fn();
    await act(async () => host.querySelector<HTMLAnchorElement>('a[href^="#"]')!.click());
    expect(heading.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    await act(async () => native.handlers.get("noteon://open-file")!({ payload: "/notes/docs/index.md" }));
    await act(async () => native.changeDocument("unsaved text"));
    native.invoke.mockClear();
    await act(async () => host.querySelector<HTMLAnchorElement>("a")!.click());
    expect(confirm).toHaveBeenCalled();
    expect(native.invoke.mock.calls.some(([command]) => command === "read_text_file")).toBe(false);
    expect(host.textContent).toContain("unsaved text");
  } finally {
    await act(async () => root.unmount()); host.remove(); localStorage.clear();
    native.handlers.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  }
});

it("loads raw frontmatter when restarting in source mode", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.setItem("noteon.sourceMode", "true");
  const markdown = "---\ntitle: Test\n---\n\n# note";
  native.invoke.mockImplementation(async (command) => command === "read_text_file" ? markdown : null);
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<App />));
    await act(async () => native.handlers.get("noteon://open-file")!({ payload: "/notes/index.md" }));
    expect(host.querySelector(".cm-content")?.textContent).toContain("---title: Test---");
    expect(host.querySelector(".cm-content")?.textContent).not.toContain("```");
  } finally {
    await act(async () => root.unmount()); host.remove(); localStorage.clear();
    native.handlers.clear(); vi.unstubAllGlobals();
  }
});


it("edits file filters in Settings, applies them immediately, and restores the saved pattern", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.setItem("noteon.workspace", "/notes");
  localStorage.setItem("noteon.sidebar", "files");
  localStorage.setItem("noteon.fileFilter", JSON.stringify({ mode: "glob", pattern: "*.md" }));
  native.invoke.mockImplementation(async (command) => command === "list_dir" ? [
    { name: "note.md", path: "/notes/note.md", is_dir: false },
    { name: "readme.txt", path: "/notes/readme.txt", is_dir: false },
  ] : null);
  const host = document.createElement("div"); document.body.append(host);
  let root = createRoot(host);
  const openSettings = async () => {
    await act(async () => native.handlers.get("noteon://menu")!({ payload: "settings" }));
  };
  const selectFilter = async (index: number) => {
    await act(async () => host.querySelector<HTMLButtonElement>('.settings-panel .file-filter-trigger')!.click());
    await act(async () => host.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')[index].click());
  };
  try {
    await act(async () => root.render(<App />));
    expect(host.querySelector(".sidebar .file-filter-menu")).toBeNull();
    expect(host.querySelector('.sidebar [aria-label="刷新文件列表"]')).not.toBeNull();
    expect(host.querySelector(".sidebar")?.textContent).not.toContain("readme.txt");
    await openSettings();
    expect(host.querySelector<HTMLInputElement>("#file-filter-pattern")?.value).toBe("*.md");
    await selectFilter(1);
    expect(host.querySelector(".sidebar")?.textContent).toContain("readme.txt");
    expect(host.querySelector("#file-filter-pattern")).toBeNull();
    await selectFilter(0);
    expect(JSON.parse(localStorage.getItem("noteon.fileFilter")!).mode).toBe("default");
    await selectFilter(2);
    const input = host.querySelector<HTMLInputElement>("#file-filter-pattern")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "*.txt");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(host.querySelector(".sidebar")?.textContent).not.toContain("note.md");
    expect(host.querySelector(".sidebar")?.textContent).toContain("readme.txt");
    expect(JSON.parse(localStorage.getItem("noteon.fileFilter")!)).toEqual({ mode: "glob", pattern: "*.txt" });
    await act(async () => root.unmount()); root = createRoot(host);
    await act(async () => root.render(<App />));
    await openSettings();
    expect(host.querySelector<HTMLInputElement>("#file-filter-pattern")?.value).toBe("*.txt");
    expect(host.querySelector(".sidebar")?.textContent).not.toContain("note.md");
    await act(async () => host.querySelector<HTMLButtonElement>(".settings-footer button")!.click());
    expect(host.querySelector(".settings-panel")).toBeNull();
  } finally {
    await act(async () => root.unmount()); host.remove(); localStorage.clear();
    native.handlers.clear(); vi.unstubAllGlobals();
  }
});
