import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { listen } from "@tauri-apps/api/event";
import {
  open as openFileDialog,
  save as saveFileDialog,
} from "@tauri-apps/plugin-dialog";
import { Editor, editorViewCtx } from "@milkdown/kit/core";
import { callCommand, getMarkdown } from "@milkdown/kit/utils";
import {
  createCodeBlockCommand,
  insertHrCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleLinkCommand,
  toggleStrongCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from "@milkdown/kit/preset/commonmark";
import {
  addColAfterCommand,
  addColBeforeCommand,
  addRowAfterCommand,
  addRowBeforeCommand,
  insertTableCommand,
  toggleStrikethroughCommand,
} from "@milkdown/kit/preset/gfm";
import MilkdownEditor from "./editor/MilkdownEditor";
import SourceEditor, { type SourceEditorHandle } from "./editor/SourceEditor";
import { decodeFrontmatter, encodeFrontmatter } from "./editor/frontmatter";
import { setMermaidTheme } from "./editor/mermaidView";
import Sidebar, { type OutlineItem, type SidebarTab } from "./ui/Sidebar";
import QuickOpen from "./ui/QuickOpen";
import SettingsModal, {
  FONT_FAMILY_CSS,
  loadSettings,
  type Settings,
  type ThemeName,
} from "./ui/Settings";
import {
  checkUpdate,
  installUpdate,
  invoke,
  pandocExport,
  readTextFile,
  takePendingOpen,
  walkMarkdownFiles,
  watchFile,
  writeTextFile,
} from "./bridge/ipc";
import "./App.css";

interface DocMeta {
  path: string | null;
  name: string;
}

interface Stats {
  words: number;
  chars: number;
}

const UNTITLED: DocMeta = { path: null, name: "Untitled" };

function computeStats(md: string): Stats {
  const cjk = (md.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) ?? []).length;
  const latin = (
    md.replace(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, " ").match(/[A-Za-z0-9_'-]+/g) ?? []
  ).length;
  return { words: cjk + latin, chars: md.length };
}

function App() {
  const [doc, setDoc] = useState<DocMeta>(UNTITLED);
  const [dirty, setDirty] = useState(false);
  const [content, setContent] = useState("");
  const [editorKey, setEditorKey] = useState(0);
  const [stats, setStats] = useState<Stats>({ words: 0, chars: 0 });
  const [showStats, setShowStats] = useState(false);
  const [sidebar, setSidebar] = useState<SidebarTab | null>(null);
  const [workspace, setWorkspace] = useState<string | null>(() =>
    localStorage.getItem("noteon.workspace"),
  );
  const [theme, setTheme] = useState<ThemeName>(
    () => (localStorage.getItem("noteon.theme") as ThemeName) ?? "github",
  );
  const [focusMode, setFocusMode] = useState(false);
  const [typewriterMode, setTypewriterMode] = useState(false);
  const [sourceMode, setSourceMode] = useState(false);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickFiles, setQuickFiles] = useState<string[]>([]);
  const [treeRefresh, setTreeRefresh] = useState(0);

  const markdownRef = useRef(""); // 编辑器最新序列化结果
  const savedRef = useRef<string | null>(""); // 与磁盘一致的版本（null = 等待编辑器建立基线）
  const diskRawRef = useRef(""); // 已知的磁盘原文（打开/保存时更新），外部变更去重用
  const frontmatterRef = useRef(false); // 当前文档带 YAML frontmatter（读入时已转成代码块）
  const watchTimer = useRef<number | undefined>(undefined);
  const pendingJumpRef = useRef<string | null>(null); // 搜索命中跳转：待编辑器就绪后滚动
  const editorRef = useRef<Editor | null>(null);
  const outlineElsRef = useRef<Element[]>([]);
  const outlineTimer = useRef<number | undefined>(undefined);
  const lastPanelRef = useRef<SidebarTab>("files");
  const sourceModeRef = useRef(false);
  const sourceHandleRef = useRef<SourceEditorHandle | null>(null);

  useEffect(() => {
    sourceModeRef.current = sourceMode;
  }, [sourceMode]);

  // 设置：持久化 + 应用字体变量（主题字号以 html 根字号为 rem 基准；CM 侧走变量）
  useEffect(() => {
    localStorage.setItem("noteon.settings", JSON.stringify(settings));
    document.documentElement.style.fontSize = `${settings.fontSize}px`;
    document.documentElement.style.setProperty(
      "--noteon-font-size",
      `${settings.fontSize}px`,
    );
    document.documentElement.style.setProperty(
      "--noteon-font-family",
      FONT_FAMILY_CSS[settings.fontFamily],
    );
  }, [settings]);

  useEffect(() => {
    if (sidebar) lastPanelRef.current = sidebar;
  }, [sidebar]);

  const toggleSidebar = useCallback(() => {
    setSidebar((s) => (s ? null : lastPanelRef.current));
  }, []);

  // 源码模式 ↔ 所见即所得：content 状态是两侧共用的文档真相
  const toggleSourceMode = useCallback(() => {
    if (sourceModeRef.current) {
      // 退出：转回代码块形态重建 Milkdown（baseline 未变，脏状态保留）
      const enc = encodeFrontmatter(markdownRef.current);
      frontmatterRef.current = enc.had;
      markdownRef.current = enc.text;
      setContent(enc.text);
      setEditorKey((k) => k + 1);
      setSourceMode(false);
    } else {
      editorRef.current = null; // Milkdown 卸载，段落/格式命令不再可用
      // 源码视图显示 --- 原文形态；退出时按内容重探 frontmatter
      const raw = frontmatterRef.current
        ? decodeFrontmatter(markdownRef.current)
        : markdownRef.current;
      frontmatterRef.current = encodeFrontmatter(raw).had;
      markdownRef.current = raw;
      setContent(raw);
      setSourceMode(true);
    }
  }, []);

  const syncTitle = useCallback((meta: DocMeta, isDirty: boolean) => {
    void getCurrentWindow().setTitle(
      `${isDirty ? "• " : ""}${meta.name} — noteon`,
    );
  }, []);

  useEffect(() => {
    syncTitle(doc, dirty);
  }, [doc, dirty, syncTitle]);

  // 主题热切换：<link> 指向 public/themes/<name>.css
  useEffect(() => {
    localStorage.setItem("noteon.theme", theme);
    document.documentElement.dataset.theme = theme;
    setMermaidTheme(theme);
    let link = document.getElementById("theme-css") as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = "theme-css";
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    link.href = `/themes/${theme}.css`;
  }, [theme]);

  const markSaved = useCallback((meta: DocMeta, md: string) => {
    savedRef.current = md;
    setDoc(meta);
    setDirty(false);
    setStats(computeStats(md));
  }, []);

  // 大纲：所见即所得模式从编辑器 DOM 收集标题；源码模式从 markdown 文本解析
  const refreshOutline = useCallback(() => {
    window.clearTimeout(outlineTimer.current);
    outlineTimer.current = window.setTimeout(() => {
      if (sourceModeRef.current) {
        const items: OutlineItem[] = [];
        markdownRef.current.split("\n").forEach((line, i) => {
          const m = /^(#{1,6})\s+(.*)/.exec(line);
          if (m) items.push({ level: m[1].length, text: m[2].trim(), line: i + 1 });
        });
        setOutline(items);
        return;
      }
      const ed = editorRef.current;
      if (!ed) return;
      const dom = ed.action((ctx) => ctx.get(editorViewCtx).dom);
      const heads = Array.from(dom.querySelectorAll("h1,h2,h3,h4,h5,h6"));
      outlineElsRef.current = heads;
      setOutline(
        heads.map((h) => ({
          level: Number(h.tagName[1]),
          text: h.textContent ?? "",
        })),
      );
    }, 250);
  }, []);

  const openPath = useCallback(
    async (path: string) => {
      try {
        // 打开文件时自动采纳其所在目录为工作区
        if (!workspace) {
          const dir = path.split("/").slice(0, -1).join("/");
          setWorkspace(dir);
          localStorage.setItem("noteon.workspace", dir);
        }
        const raw = await readTextFile(path);
        // frontmatter 转成无语言代码块渲染（Milkdown 不解析 --- 头），保存时转回
        const enc = encodeFrontmatter(raw);
        frontmatterRef.current = enc.had;
        const md = enc.text;
        // 大文件走源码模式（PLAN §4：>512KB 提示，不做所见即所得虚拟化）
        if (md.length > 512 * 1024 && !sourceModeRef.current) {
          if (
            window.confirm(
              "该文件较大（>512KB），用源码模式打开更流畅。使用源码模式？（取消则按所见即所得打开）",
            )
          ) {
            editorRef.current = null;
            setSourceMode(true);
          }
        }
        markdownRef.current = md;
        setContent(md);
        setOutline([]);
        setEditorKey((k) => k + 1); // 重建编辑器载入新文档
        // 基线在 onReady 里用首次序列化结果建立（序列化风格与磁盘原文
        // 可能不同，如 --- → -，不能拿原文当脏检查基准）
        savedRef.current = null;
        diskRawRef.current = raw;
        setDoc({ path, name: path.split("/").pop() ?? "Untitled" });
        setDirty(false);
        setStats(computeStats(md));
        void watchFile(path);
      } catch (err) {
        window.alert(`无法打开文件：${err}`);
      }
    },
    [markSaved, workspace],
  );

  const doSave = useCallback(
    async (saveAs: boolean) => {
      let path = doc.path;
      if (!path || saveAs) {
        const picked = await saveFileDialog({
          defaultPath: doc.name === "Untitled" ? "Untitled.md" : doc.name,
          filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
        });
        if (!picked) return;
        path = picked;
      }
      try {
        // frontmatterRef 文档写盘前把首块 ``` 转回 --- 围栏
        const out = frontmatterRef.current
          ? decodeFrontmatter(markdownRef.current)
          : markdownRef.current;
        await writeTextFile(path, out);
        diskRawRef.current = out;
        markSaved(
          { path, name: path.split("/").pop() ?? "Untitled" },
          markdownRef.current,
        );
        void watchFile(path);
      } catch (err) {
        window.alert(`保存失败：${err}`);
      }
    },
    [doc, markSaved],
  );

  const newDoc = useCallback(() => {
    markdownRef.current = "";
    frontmatterRef.current = false;
    setContent("");
    setOutline([]);
    setEditorKey((k) => k + 1);
    savedRef.current = "";
    setDoc(UNTITLED);
    setDirty(false);
    setStats({ words: 0, chars: 0 });
  }, []);

  const pickFolder = useCallback(async () => {
    const dir = await openFileDialog({ directory: true });
    if (typeof dir === "string") {
      setWorkspace(dir);
      localStorage.setItem("noteon.workspace", dir);
    }
  }, []);

  // 菜单动作 → 编辑器命令
  const runEditorCommand = useCallback((key: string) => {
    const ed = editorRef.current;
    if (!ed) return;
    const map: Record<string, [unknown, unknown?]> = {
      h1: [wrapInHeadingCommand.key, 1],
      h2: [wrapInHeadingCommand.key, 2],
      h3: [wrapInHeadingCommand.key, 3],
      h4: [wrapInHeadingCommand.key, 4],
      h5: [wrapInHeadingCommand.key, 5],
      h6: [wrapInHeadingCommand.key, 6],
      "bullet-list": [wrapInBulletListCommand.key],
      "ordered-list": [wrapInOrderedListCommand.key],
      quote: [wrapInBlockquoteCommand.key],
      "code-block": [createCodeBlockCommand.key],
      table: [insertTableCommand.key, { row: 3, col: 3 }],
      "table-row-before": [addRowBeforeCommand.key],
      "table-row-after": [addRowAfterCommand.key],
      "table-col-before": [addColBeforeCommand.key],
      "table-col-after": [addColAfterCommand.key],
      hr: [insertHrCommand.key],
      bold: [toggleStrongCommand.key],
      italic: [toggleEmphasisCommand.key],
      strike: [toggleStrikethroughCommand.key],
      "inline-code": [toggleInlineCodeCommand.key],
      link: [toggleLinkCommand.key],
    };
    const entry = map[key];
    if (!entry) return;
    const [cmdKey, payload] = entry;
    ed.action(
      callCommand(
        cmdKey as Parameters<typeof callCommand>[0],
        payload as never,
      ),
    );
  }, []);

  // 文件树操作：变更后同步活跃文档状态
  const refreshTree = useCallback(() => setTreeRefresh((v) => v + 1), []);

  const handleRenamed = useCallback((from: string, to: string) => {
    setDoc((d) =>
      d.path === from
        ? { path: to, name: to.split("/").pop() ?? "Untitled" }
        : d,
    );
  }, []);

  const handleDeleted = useCallback((path: string) => {
    setDoc((d) => {
      if (d.path !== path) return d;
      markdownRef.current = "";
      savedRef.current = "";
      setContent("");
      setOutline([]);
      setDirty(false);
      setStats({ words: 0, chars: 0 });
      return UNTITLED;
    });
  }, []);

  const handleOpenHit = useCallback(
    (path: string, lineText: string) => {
      pendingJumpRef.current = lineText;
      void openPath(path);
    },
    [openPath],
  );

  const openQuickOpen = useCallback(() => {
    const ws = localStorage.getItem("noteon.workspace");
    if (!ws) {
      window.alert("先打开文件夹（文件 → 打开文件夹…）才能快速打开");
      return;
    }
    void walkMarkdownFiles(ws).then((files) => {
      setQuickFiles(files);
      setQuickOpen(true);
    });
  }, []);

  const handleExport = useCallback(
    (format: "pdf" | "html" | "docx") => {
      if (format === "pdf") {
        // 系统打印对话框（可在其中选择"存储为 PDF"），分页由打印样式表控制
        void invoke("plugin:webview|print");
        return;
      }
      if (!doc.path) {
        window.alert("请先保存文档再导出");
        return;
      }
      void pandocExport(doc.path, format)
        .then((out) => window.alert(`已导出：${out}`))
        .catch((e) => window.alert(String(e)));
    },
    [doc.path],
  );

  // 两个编辑器共用的文档变更管道：markdownRef 是真相，
  // content 状态同步更新以驱动源码模式回显（回显时 CM 侧会比对去重，不产生回环）
  const onDocChanged = useCallback(
    (md: string) => {
      markdownRef.current = md;
      setContent(md);
      setDirty(md !== savedRef.current);
      setStats(computeStats(md));
      refreshOutline();
    },
    [refreshOutline],
  );

  async function pickAndOpen() {
    const picked = await openFileDialog({
      multiple: false,
      filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
    });
    if (typeof picked === "string") await openPath(picked);
  }

  // 原生菜单动作 → 前端执行
  useEffect(() => {
    const unlisten = listen<string>("noteon://menu", (event) => {
      const id = event.payload;
      const [ns, arg] = id.includes(":")
        ? [id.slice(0, id.indexOf(":")), id.slice(id.indexOf(":") + 1)]
        : [id, undefined];
      switch (ns) {
        case "new":
          newDoc();
          break;
        case "open":
          void pickAndOpen();
          break;
        case "open-folder":
          void pickFolder();
          break;
        case "quick-open":
          openQuickOpen();
          break;
        case "search":
          setSidebar((s) => (s === "search" ? null : "search"));
          break;
        case "export:pdf":
          handleExport("pdf");
          break;
        case "export:html":
          handleExport("html");
          break;
        case "export:docx":
          handleExport("docx");
          break;
        case "save":
          void doSave(false);
          break;
        case "save-as":
          void doSave(true);
          break;
        case "toggle-sidebar":
          toggleSidebar();
          break;
        case "source-mode":
          toggleSourceMode();
          break;
        case "settings":
          setSettingsOpen(true);
          break;
        case "focus-mode":
          setFocusMode((v) => !v);
          break;
        case "typewriter-mode":
          setTypewriterMode((v) => !v);
          break;
        case "theme":
          if (arg === "github" || arg === "night") setTheme(arg);
          break;
        case "para":
          if (arg) runEditorCommand(arg);
          break;
        case "fmt":
          if (arg) runEditorCommand(arg);
          break;
      }
    });
    return () => {
      void unlisten.then((off) => off());
    };
  }, [newDoc, doSave, openPath, pickFolder, runEditorCommand, openQuickOpen, handleExport, toggleSidebar, toggleSourceMode]);

  // 网页内快捷键兜底：可编辑元素持有焦点时 WKWebView 会吞掉原生菜单加速键，
  // ⌘/（源码模式）与 ⌘,（设置）在此补一份；CM 内部的 Mod-/ 会先 preventDefault，这里跳过避免双触发
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey || e.defaultPrevented) return;
      if (e.key === "/") {
        e.preventDefault();
        toggleSourceMode();
      } else if (e.key === ",") {
        e.preventDefault();
        setSettingsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSourceMode]);

  // 拖拽 .md 文件到窗口打开
  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "drop" && event.payload.paths.length > 0) {
        void openPath(event.payload.paths[0]);
      }
    });
    return () => {
      void unlisten.then((off) => off());
    };
  }, [openPath]);

  // 命令行参数指定的待打开文件（noteon file.md）
  useEffect(() => {
    void takePendingOpen().then((path) => {
      if (path) void openPath(path);
    });
  }, [openPath]);

  // 自动保存：有改动且已有关联文件时，2.5s 防抖落盘（设置里可关）
  useEffect(() => {
    if (!dirty || !doc.path || !settings.autosave) return;
    const t = window.setTimeout(() => void doSave(false), 2500);
    return () => window.clearTimeout(t);
  }, [dirty, doc.path, settings.autosave]);

  // 外部变更：非脏直接重载；有未保存修改则询问
  useEffect(() => {
    const unlisten = listen("noteon://file-changed", () => {
      window.clearTimeout(watchTimer.current);
      watchTimer.current = window.setTimeout(() => {
        const path = doc.path;
        if (!path) return;
        void (async () => {
          try {
            const raw = await readTextFile(path);
            if (raw === diskRawRef.current) return; // 自己的保存触发的事件
            diskRawRef.current = raw;
            if (!dirty || window.confirm("文件已被外部修改，重新加载将丢弃未保存的修改。重新加载？")) {
              await openPath(path);
            }
          } catch {
            /* 文件可能已被删除 */
          }
        })();
      }, 400);
    });
    return () => {
      void unlisten.then((off) => off());
    };
  }, [doc.path, dirty, openPath]);

  const jumpToHeading = useCallback(
    (index: number) => {
      if (sourceModeRef.current) {
        const line = outline[index]?.line;
        if (line) sourceHandleRef.current?.gotoLine(line);
        return;
      }
      outlineElsRef.current[index]?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    },
    [outline],
  );

  // 设置页“检查更新”：结果转成一句可读消息（发现新版时询问是否安装）
  const handleCheckUpdate = useCallback(async (endpoint: string): Promise<string> => {
    try {
      const info = await checkUpdate(endpoint);
      if (info.status === "not-configured") return "未配置更新源";
      if (info.status === "up-to-date") return "已是最新版本";
      const ok = window.confirm(
        `发现新版本 v${info.version}，下载并安装？（完成后应用将自动重启）\n\n${info.notes ?? ""}`,
      );
      if (!ok) return `新版本 v${info.version} 已跳过`;
      await installUpdate(); // 成功后 app.restart()，不会走到下面
      return "安装完成";
    } catch (e) {
      return `检查失败：${e}`;
    }
  }, []);

  return (
    <div className="app">
      <header className="titlebar" data-tauri-drag-region>
        <button
          className="tb-btn"
          title="切换侧栏 (⌘⇧L)"
          onClick={toggleSidebar}
        >
          ☰
        </button>
        <button
          className={`tb-btn${sourceMode ? " active" : ""}`}
          title="源码模式 (⌘/)"
          onClick={toggleSourceMode}
        >
          {"</>"}
        </button>
        <span className="doc-name">
          {doc.name}
          {dirty ? " — 已编辑" : ""}
          {sourceMode ? " · 源码" : ""}
        </span>
      </header>
      <div className="body">
        {sidebar && (
          <aside className="sidebar">
            <div className="sidebar-tabs">
              <button
                className={`sidebar-tab${sidebar === "files" ? " active" : ""}`}
                onClick={() => setSidebar("files")}
              >
                文件
              </button>
              <button
                className={`sidebar-tab${sidebar === "outline" ? " active" : ""}`}
                onClick={() => setSidebar("outline")}
              >
                大纲
              </button>
              <button
                className={`sidebar-tab${sidebar === "search" ? " active" : ""}`}
                onClick={() => setSidebar("search")}
              >
                搜索
              </button>
            </div>
            <Sidebar
              tab={sidebar}
              workspace={workspace}
              activePath={doc.path}
              outline={outline}
              refreshKey={treeRefresh}
              onOpenFile={(p) => void openPath(p)}
              onJump={jumpToHeading}
              onOpenHit={handleOpenHit}
              onMutate={refreshTree}
              onRenamed={handleRenamed}
              onDeleted={handleDeleted}
            />
          </aside>
        )}
        <QuickOpen
          open={quickOpen}
          files={quickFiles}
          onClose={() => setQuickOpen(false)}
          onPick={(p) => {
            setQuickOpen(false);
            void openPath(p);
          }}
        />
        <main
          className={`editor-scroll${focusMode ? " focus-mode" : ""}`}
        >
          {sourceMode ? (
            <SourceEditor
              key={theme}
              value={content}
              dark={theme === "night"}
              onChange={onDocChanged}
              onToggle={toggleSourceMode}
              onHandle={(h) => {
                sourceHandleRef.current = h;
              }}
            />
          ) : (
            <MilkdownEditor
              key={editorKey}
              defaultValue={content}
              focusMode={focusMode}
              typewriterMode={typewriterMode}
              getDocPath={() => doc.path}
              onChange={onDocChanged}
              onReady={(ed) => {
                editorRef.current = ed;
                // 建立脏检查基线：首次序列化结果 = "与磁盘一致"
                const baseline = ed.action(getMarkdown());
                markdownRef.current = baseline;
                if (savedRef.current === null) {
                  savedRef.current = baseline;
                  setDirty(false);
                }
                setStats(computeStats(baseline));
                refreshOutline();
                // 全文搜索命中跳转：滚动到包含命中行的块
                const jump = pendingJumpRef.current;
                if (jump) {
                  pendingJumpRef.current = null;
                  window.setTimeout(() => {
                    const pm = document.querySelector(".ProseMirror");
                    const target = Array.from(
                      pm?.querySelectorAll("p,h1,h2,h3,h4,h5,h6,li,pre") ?? [],
                    ).find((el) => (el.textContent ?? "").includes(jump));
                    target?.scrollIntoView({ block: "center" });
                  }, 60);
                }
              }}
            />
          )}
        </main>
      </div>
      <button className="wc-pill" onClick={() => setShowStats((v) => !v)}>
        {stats.words} 字
      </button>
      {showStats && (
        <div className="wc-pop">
          <span>字数：{stats.words}</span>
          <span>字符数：{stats.chars}</span>
        </div>
      )}
      <SettingsModal
        open={settingsOpen}
        settings={settings}
        theme={theme}
        onPatch={(patch) => setSettings((s) => ({ ...s, ...patch }))}
        onTheme={setTheme}
        onClose={() => setSettingsOpen(false)}
        onCheckUpdate={handleCheckUpdate}
      />
    </div>
  );
}

export default App;
