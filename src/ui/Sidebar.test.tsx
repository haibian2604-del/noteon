import { act } from "react";
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
