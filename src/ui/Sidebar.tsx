import { useCallback, useEffect, useRef, useState } from "react";
import {
  createPath,
  deletePath,
  listDir,
  renamePath,
  searchWorkspace,
  type DirEntry,
  type SearchHit,
} from "../bridge/ipc";
import {
  DEFAULT_FILE_FILTER,
  filterEntries,
  type FileFilter,
} from "./treeFilter";
import { moveCursor } from "./treeNav";

function loadFileFilter(): FileFilter {
  try {
    const raw = localStorage.getItem("noteon.fileFilter");
    if (!raw) return DEFAULT_FILE_FILTER;
    const p = JSON.parse(raw) as Partial<FileFilter>;
    if (p.mode === "default" || p.mode === "all" || p.mode === "glob") {
      return { mode: p.mode, pattern: typeof p.pattern === "string" ? p.pattern : "" };
    }
  } catch {
    // 损坏即回默认
  }
  return DEFAULT_FILE_FILTER;
}

export interface OutlineItem {
  level: number;
  text: string;
  /** 源码模式下的行号（1-based），用于大纲跳转 */
  line?: number;
}

export type SidebarTab = "files" | "outline" | "search";

type Entry = DirEntry;

interface SidebarProps {
  tab: SidebarTab;
  workspace: string | null;
  activePath: string | null;
  outline: OutlineItem[];
  /** 文件树变动后递增，驱动根目录重读 */
  refreshKey: number;
  onOpenFile: (path: string) => void;
  onJump: (index: number) => void;
  onOpenHit: (path: string, lineText: string) => void;
  /** 文件树变动后由 App 处理（活跃文档同步）并触发刷新 */
  onMutate: () => void;
  /** 通知 App：活跃文档被重命名 */
  onRenamed: (from: string, to: string) => void;
  /** 通知 App：活跃文档被删除 */
  onDeleted: (path: string) => void;
}

interface CtxMenu {
  x: number;
  y: number;
  entry: Entry | null; // null = 空白区域（工作区根目录）
}

function parentOf(path: string): string {
  return path.slice(0, path.lastIndexOf("/"));
}

function FileTreeRow({
  entry,
  depth,
  activePath,
  cursorPath,
  renaming,
  setRenaming,
  filter,
  onOpenFile,
  onContextMenu,
  onRename,
}: {
  entry: Entry;
  depth: number;
  activePath: string | null;
  cursorPath: string | null;
  renaming: { path: string; value: string } | null;
  setRenaming: (v: { path: string; value: string } | null) => void;
  filter: FileFilter;
  onOpenFile: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, entry: Entry) => void;
  onRename: (from: string, to: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<Entry[] | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (renaming?.path === entry.path) inputRef.current?.select();
  }, [renaming, entry.path]);

  const toggle = useCallback(async () => {
    if (renaming?.path === entry.path) return;
    if (!entry.is_dir) {
      onOpenFile(entry.path);
      return;
    }
    if (!expanded && children === null) {
      try {
        setChildren(await listDir(entry.path));
      } catch {
        setChildren([]);
      }
    }
    setExpanded((v) => !v);
  }, [entry, expanded, children, onOpenFile, renaming]);

  const commitRename = useCallback(() => {
    if (!renaming) return;
    const name = renaming.value.trim();
    setRenaming(null);
    if (!name || name === entry.name) return;
    onRename(entry.path, `${parentOf(entry.path)}/${name}`);
  }, [renaming, entry, onRename]);

  const isRenaming = renaming?.path === entry.path;

  return (
    <>
      <div
        className={`tree-row${entry.path === activePath ? " active" : ""}${
          entry.path === cursorPath ? " cursor" : ""
        }`}
        style={{ paddingLeft: 6 + depth * 14 }}
        data-path={entry.path}
        data-kind={entry.is_dir ? "dir" : "file"}
        onClick={() => void toggle()}
        onContextMenu={(e) => onContextMenu(e, entry)}
        title={entry.path}
      >
        {entry.is_dir ? (
          <span className={`tree-caret${expanded ? " open" : ""}`}>▶</span>
        ) : (
          <span className="tree-caret" />
        )}
        {isRenaming ? (
          <input
            ref={inputRef}
            className="rename-input"
            value={renaming.value}
            onChange={(e) =>
              setRenaming({ path: entry.path, value: e.target.value })
            }
            onClick={(e) => e.stopPropagation()}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setRenaming(null);
            }}
          />
        ) : (
          <span className="tree-name">{entry.name}</span>
        )}
      </div>
      {entry.is_dir && expanded && filterEntries(children ?? [], filter).map((c) => (
        <FileTreeRow
          key={c.path}
          entry={c}
          depth={depth + 1}
          activePath={activePath}
          cursorPath={cursorPath}
          renaming={renaming}
          setRenaming={setRenaming}
          filter={filter}
          onOpenFile={onOpenFile}
          onContextMenu={onContextMenu}
          onRename={onRename}
        />
      ))}
    </>
  );
}
function SearchPanel({
  workspace,
  onOpenHit,
}: {
  workspace: string | null;
  onOpenHit: (path: string, lineText: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async () => {
    if (!workspace || !query.trim()) return;
    setLoading(true);
    try {
      setHits(await searchWorkspace(workspace, query));
    } catch (e) {
      console.error(e);
      setHits([]);
    } finally {
      setLoading(false);
    }
  }, [workspace, query]);

  if (!workspace) {
    return <div className="sidebar-hint">先打开文件夹（文件 → 打开文件夹…）才能全文搜索</div>;
  }
  return (
    <div className="sidebar-search">
      <div className="search-bar">
        <input
          className="search-input"
          placeholder="搜索工作区… 回车执行"
          value={query}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void run();
          }}
        />
        <button className="search-btn" onClick={() => void run()}>
          搜索
        </button>
      </div>
      <div className="sidebar-content">
        {loading && <div className="sidebar-hint">搜索中…</div>}
        {!loading && hits !== null && hits.length === 0 && (
          <div className="sidebar-hint">无结果</div>
        )}
        {hits?.map((hit, i) => {
          const base = hit.path.split("/").pop() ?? hit.path;
          return (
            <div
              key={i}
              className="search-hit"
              onClick={() => onOpenHit(hit.path, hit.text.trim().slice(0, 30))}
              title={`${hit.path}:${hit.line}`}
            >
              <span className="line-text">{hit.text}</span>
              <span className="hit-path">
                {base} : {hit.line}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Sidebar({
  tab,
  workspace,
  activePath,
  outline,
  refreshKey,
  onOpenFile,
  onJump,
  onOpenHit,
  onMutate,
  onRenamed,
  onDeleted,
}: SidebarProps) {
  const [roots, setRoots] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [renaming, setRenaming] = useState<{ path: string; value: string } | null>(
    null,
  );
  const [filter, setFilter] = useState<FileFilter>(loadFileFilter);
  const [cursorPath, setCursorPath] = useState<string | null>(null);
  const filesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    localStorage.setItem("noteon.fileFilter", JSON.stringify(filter));
    setCursorPath(null); // 行集变了，光标可能悬空
  }, [filter]);

  useEffect(() => {
    if (!workspace || tab !== "files") {
      return;
    }
    let cancelled = false;
    listDir(workspace)
      .then((entries) => {
        if (!cancelled) {
          setRoots(entries);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [workspace, tab, refreshKey]);

  // 点击任意处关闭右键菜单
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [ctxMenu]);

  const handleRename = useCallback(
    (from: string, to: string) => {
      void renamePath(from, to)
        .then(() => {
          if (activePath === from) onRenamed(from, to);
          onMutate();
        })
        .catch((e) => window.alert(`重命名失败：${e}`));
    },
    [activePath, onMutate, onRenamed],
  );

  const handleCreate = useCallback(
    (parentDir: string, isDir: boolean) => {
      void createPath(`${parentDir}/${isDir ? "新建文件夹" : "未命名.md"}`, isDir)
        .then((finalPath) => {
          onMutate();
          if (!isDir) onOpenFile(finalPath); // 新建即打开编辑
        })
        .catch((e) => window.alert(`创建失败：${e}`));
    },
    [onMutate, onOpenFile],
  );

  const handleDelete = useCallback(
    (path: string) => {
      void deletePath(path)
        .then(() => {
          if (activePath === path) onDeleted(path);
          onMutate();
        })
        .catch((e) => window.alert(`删除失败：${e}`));
    },
    [activePath, onMutate, onDeleted],
  );

  const ctxItems = (menu: CtxMenu): { label: string; action: () => void }[] => {
    const dir = menu.entry
      ? menu.entry.is_dir
        ? menu.entry.path
        : parentOf(menu.entry.path)
      : (workspace ?? "");
    const items: { label: string; action: () => void }[] = [
      {
        label: "新建文件",
        action: () => handleCreate(dir, false),
      },
      {
        label: "新建文件夹",
        action: () => handleCreate(dir, true),
      },
    ];
    if (menu.entry) {
      items.push({
        label: "重命名",
        action: () =>
          setRenaming({ path: menu.entry!.path, value: menu.entry!.name }),
      });
      items.push({
        label: "删除（移到废纸篓）",
        action: () => handleDelete(menu.entry!.path),
      });
    }
    return items;
  };

  const onTreeKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // 重命名输入框里不抢按键
      if (e.target instanceof HTMLInputElement) return;
      const container = filesRef.current;
      if (!container) return;
      const rows = Array.from(
        container.querySelectorAll<HTMLElement>(".tree-row"),
      );
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const cur = rows.findIndex((r) => r.dataset.path === cursorPath);
        const next = moveCursor(
          cur < 0 ? null : cur,
          rows.length,
          e.key === "ArrowDown" ? "down" : "up",
        );
        setCursorPath(next === null ? null : (rows[next].dataset.path ?? null));
        if (next !== null) rows[next]?.scrollIntoView({ block: "nearest" });
        return;
      }
      if (e.key === "Enter" || e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const el = rows.find((r) => r.dataset.path === cursorPath);
        if (!el) return;
        e.preventDefault();
        if (el.dataset.kind === "dir") {
          el.click(); // 展开/收起都是同一次点击
          return;
        }
        if (e.key !== "ArrowLeft" && cursorPath) onOpenFile(cursorPath);
      }
    },
    [cursorPath, onOpenFile],
  );

  if (tab === "outline") {
    if (outline.length === 0) {
      return <div className="sidebar-hint">暂无大纲（文档为空或无标题）</div>;
    }
    return (
      <div className="sidebar-content">
        {outline.map((item, i) => (
          <div
            key={i}
            className={`outline-item outline-h${item.level}`}
            onClick={() => onJump(i)}
            title={item.text}
          >
            {item.text || "（空标题）"}
          </div>
        ))}
      </div>
    );
  }

  if (tab === "search") {
    return <SearchPanel workspace={workspace} onOpenHit={onOpenHit} />;
  }

  let body: React.ReactNode;
  if (!workspace) {
    body = (
      <div className="sidebar-hint">
        未打开文件夹
        <br />
        （菜单：文件 → 打开文件夹… ⌘⇧O）
      </div>
    );
  } else if (error) {
    body = <div className="sidebar-hint">无法读取文件夹：{error}</div>;
  } else if (roots === null) {
    body = <div className="sidebar-hint">加载中…</div>;
  } else {
    body = (
      <div
        ref={filesRef}
        className="sidebar-content"
        tabIndex={0}
        onKeyDown={onTreeKeyDown}
        onContextMenu={(e) => {
          if ((e.target as HTMLElement).closest(".tree-row")) return;
          e.preventDefault();
          setCtxMenu({ x: e.clientX, y: e.clientY, entry: null });
        }}
      >
        {filterEntries(roots, filter).map((e) => (
          <FileTreeRow
            key={e.path}
            entry={e}
            depth={0}
            activePath={activePath}
            cursorPath={cursorPath}
            renaming={renaming}
            setRenaming={setRenaming}
            filter={filter}
            onOpenFile={onOpenFile}
            onContextMenu={(e, entry) => {
              e.preventDefault();
              setCtxMenu({ x: e.clientX, y: e.clientY, entry });
            }}
            onRename={handleRename}
          />
        ))}
      </div>
    );
  }

  return (
    <>
      {tab === "files" && workspace && (
        <div className="tree-filter">
          <select
            value={filter.mode}
            onChange={(e) =>
              setFilter((f) => ({
                ...f,
                mode: e.target.value as FileFilter["mode"],
              }))
            }
          >
            <option value="default">隐藏点开头</option>
            <option value="all">全部</option>
            <option value="glob">匹配模式</option>
          </select>
          {filter.mode === "glob" && (
            <input
              className="tree-filter-input"
              placeholder="如 *.md 或笔记*"
              value={filter.pattern}
              onChange={(e) =>
                setFilter((f) => ({ ...f, pattern: e.target.value }))
              }
            />
          )}
        </div>
      )}
      {body}
      {ctxMenu && (
        <div
          className="ctx-menu"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {ctxItems(ctxMenu).map((it) => (
            <button key={it.label} className="ctx-item" onClick={it.action}>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
