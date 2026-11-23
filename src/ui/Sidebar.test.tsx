import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import Sidebar from "./Sidebar";
import { listDir } from "../bridge/ipc";

vi.mock("../bridge/ipc", () => ({ listDir: vi.fn() }));

it("renders distinct folder and document icons and preserves expanding and opening files", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(listDir).mockImplementation(async (path) => path === "/notes" ? [
    { name: "architecture", path: "/notes/architecture", is_dir: true },
  ] : [{ name: "overview.md", path: "/notes/architecture/overview.md", is_dir: false }]);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const open = vi.fn();
  try {
    await act(async () => root.render(<Sidebar tab="files" workspace="/notes"
      activePath="/notes/architecture/overview.md" outline={[]} refreshKey={0}
      onOpenFile={open} onJump={() => {}} onOpenHit={() => {}}
      onMutate={() => {}} onRenamed={() => {}} onDeleted={() => {}} />));
    const folder = host.querySelector<HTMLElement>('[data-kind="dir"]')!;
    expect(folder.querySelector(".folder-icon")).not.toBeNull();
    const closedPath = folder.querySelector(".folder-icon path")?.getAttribute("d");
    await act(async () => folder.click());
    expect(folder.querySelector(".tree-caret.open")).not.toBeNull();
    expect(folder.querySelector(".folder-icon path")?.getAttribute("d")).not.toBe(closedPath);
    const file = host.querySelector<HTMLElement>('[data-kind="file"]')!;
    expect(file.querySelector(".document-icon")).not.toBeNull();
    expect(file.classList.contains("active")).toBe(true);
    expect(file.style.paddingLeft).toBe("26px");
    await act(async () => file.click());
    expect(open).toHaveBeenCalledWith("/notes/architecture/overview.md");
    await act(async () => folder.click());
    expect(host.querySelector('[data-kind="file"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    localStorage.clear();
    vi.unstubAllGlobals();
  }
});


it("refreshes external changes at the root and in expanded subfolders while preserving selection", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let updated = false;
  let failSubfolder = false;
  vi.mocked(listDir).mockImplementation(async (path) => {
    if (path === "/notes") return [
      { name: "folder", path: "/notes/folder", is_dir: true },
      ...(updated ? [{ name: "new.md", path: "/notes/new.md", is_dir: false }] : []),
    ];
    if (path === "/notes/folder" && failSubfolder) throw new Error("permission denied");
    if (path === "/notes/folder") return [
      { name: "nested", path: "/notes/folder/nested", is_dir: true },
      { name: "selected.md", path: "/notes/folder/selected.md", is_dir: false },
      { name: updated ? "added.md" : "removed.md", path: `/notes/folder/${updated ? "added" : "removed"}.md`, is_dir: false },
    ];
    return [{ name: updated ? "new-nested.md" : "old-nested.md", path: `/notes/folder/nested/${updated ? "new" : "old"}-nested.md`, is_dir: false }];
  });
  function Harness() {
    const [refreshKey, setRefreshKey] = useState(0);
    return <Sidebar tab="files" workspace="/notes" activePath="/notes/folder/selected.md"
      outline={[]} refreshKey={refreshKey} onOpenFile={() => {}} onJump={() => {}}
      onOpenHit={() => {}} onMutate={() => setRefreshKey(v => v + 1)}
      onRenamed={() => {}} onDeleted={() => {}} />;
  }
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => host.querySelector<HTMLElement>('[data-path="/notes/folder"]')!.click());
    await act(async () => host.querySelector<HTMLElement>('[data-path="/notes/folder/nested"]')!.click());
    expect(host.textContent).toContain("removed.md");
    expect(host.textContent).toContain("old-nested.md");
    updated = true;
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="刷新文件列表"]')!.click());
    expect(host.textContent).toContain("new.md");
    expect(host.textContent).toContain("added.md");
    expect(host.textContent).toContain("new-nested.md");
    expect(host.textContent).not.toContain("removed.md");
    expect(host.textContent).not.toContain("old-nested.md");
    expect(host.querySelector(".tree-row.active")?.getAttribute("data-path")).toBe("/notes/folder/selected.md");
    expect(host.querySelectorAll(".tree-caret.open")).toHaveLength(2);
    failSubfolder = true;
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="刷新文件列表"]')!.click());
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("permission denied");
    expect(host.textContent).toContain("selected.md");
    failSubfolder = false;
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="刷新文件列表"]')!.click());
    expect(host.querySelector('[role="alert"]')).toBeNull();
  } finally {
    await act(async () => root.unmount()); host.remove(); localStorage.clear(); vi.unstubAllGlobals();
  }
});
