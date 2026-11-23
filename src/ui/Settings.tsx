import { useState } from "react";
import FileFilterMenu from "./FileFilterMenu";
import type { FileFilter } from "./treeFilter";

export type ThemeName = "github" | "night";

export interface Settings {
  fontSize: number; // px
  fontFamily: "default" | "serif" | "mono";
  autosave: boolean;
  updateEndpoint: string;
}

const DEFAULT_SETTINGS: Settings = {
  fontSize: 16,
  fontFamily: "default",
  autosave: true,
  updateEndpoint: "",
};

export const FONT_FAMILY_CSS: Record<Settings["fontFamily"], string> = {
  default: "inherit",
  serif: 'Georgia, "Songti SC", "Times New Roman", serif',
  mono: '"SF Mono", Menlo, Consolas, "Courier New", monospace',
};

export function loadSettings(): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem("noteon.settings") ?? "{}") };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

interface Props {
  open: boolean;
  settings: Settings;
  fileFilter: FileFilter;
  onFileFilter: (filter: FileFilter) => void;
  theme: ThemeName;
  onPatch: (patch: Partial<Settings>) => void;
  onTheme: (t: ThemeName) => void;
  onClose: () => void;
  onCheckUpdate: (endpoint: string) => Promise<string>;
}

export default function SettingsModal({
  open,
  settings,
  fileFilter,
  onFileFilter,
  theme,
  onPatch,
  onTheme,
  onClose,
  onCheckUpdate,
}: Props) {
  const [updateMsg, setUpdateMsg] = useState("");
  const [checking, setChecking] = useState(false);
  if (!open) return null;

  const check = async () => {
    setChecking(true);
    setUpdateMsg("正在检查更新…");
    try {
      setUpdateMsg(await onCheckUpdate(settings.updateEndpoint.trim()));
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="settings-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="settings-panel">
        <div className="settings-title">设置</div>

        <section>
          <h3>外观</h3>
          <div className="settings-row">
            <label>主题</label>
            <div className="settings-seg">
              <button
                className={theme === "github" ? "active" : ""}
                onClick={() => onTheme("github")}
              >
                Github
              </button>
              <button className={theme === "night" ? "active" : ""} onClick={() => onTheme("night")}>
                Night
              </button>
            </div>
          </div>
          <div className="settings-row">
            <label>字号</label>
            <input
              type="range"
              min={13}
              max={24}
              step={1}
              value={settings.fontSize}
              onChange={(e) => onPatch({ fontSize: Number(e.target.value) })}
            />
            <span className="settings-value">{settings.fontSize}px</span>
          </div>
          <div className="settings-row">
            <label>正文字体</label>
            <select
              value={settings.fontFamily}
              onChange={(e) => onPatch({ fontFamily: e.target.value as Settings["fontFamily"] })}
            >
              <option value="default">系统默认</option>
              <option value="serif">衬线</option>
              <option value="mono">等宽</option>
            </select>
          </div>
        </section>

        <section>
          <h3>文件列表</h3>
          <div className="settings-row">
            <span className="settings-label">文件筛选</span>
            <FileFilterMenu
              value={fileFilter.mode}
              onChange={(mode) => onFileFilter({ ...fileFilter, mode })}
            />
          </div>
          {fileFilter.mode === "glob" && (
            <div className="settings-row">
              <label htmlFor="file-filter-pattern">匹配规则</label>
              <input
                id="file-filter-pattern"
                className="settings-input"
                placeholder="如 *.md 或笔记*"
                value={fileFilter.pattern}
                onChange={(e) => onFileFilter({ ...fileFilter, pattern: e.target.value })}
              />
            </div>
          )}
        </section>

        <section>
          <h3>编辑器</h3>
          <div className="settings-row">
            <label>自动保存</label>
            <input
              type="checkbox"
              checked={settings.autosave}
              onChange={(e) => onPatch({ autosave: e.target.checked })}
            />
            <span className="settings-hint">改动后 2.5 秒自动落盘（⌘S 始终可用）</span>
          </div>
        </section>

        <section>
          <h3>更新</h3>
          <div className="settings-row">
            <label>更新源</label>
            <input
              className="settings-input"
              type="text"
              placeholder="https://example.com/noteon/latest.json"
              value={settings.updateEndpoint}
              onChange={(e) => onPatch({ updateEndpoint: e.target.value })}
            />
          </div>
          <div className="settings-row">
            <label />
            <button className="settings-btn" disabled={checking} onClick={() => void check()}>
              {checking ? "检查中…" : "检查更新"}
            </button>
            {updateMsg && <span className="settings-hint">{updateMsg}</span>}
          </div>
        </section>

        <div className="settings-footer">
          <button className="settings-btn primary" onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
