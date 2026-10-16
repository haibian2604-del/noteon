import { useEffect, useMemo, useState } from "react";

interface Props {
  open: boolean;
  files: string[];
  onClose: () => void;
  onPick: (path: string) => void;
}

/** 简单模糊匹配：按文件名子序列打分，null = 不匹配 */
function score(base: string, q: string): number | null {
  const s = q.toLowerCase().replace(/\s/g, "");
  if (!s) return 0;
  let bi = 0;
  let streak = 0;
  let total = 0;
  for (const ch of s) {
    const i = base.indexOf(ch, bi);
    if (i < 0) return null;
    total += i === bi ? 2 + streak : 1;
    streak = i === bi ? streak + 1 : 0;
    bi = i + 1;
  }
  return total;
}

export default function QuickOpen({ open, files, onClose, onPick }: Props) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);

  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
    }
  }, [open]);

  const results = useMemo(() => {
    if (!q.trim()) return files.slice(0, 12);
    return files
      .map((path) => {
        const base = path.split("/").pop() ?? path;
        const s = score(base, q) ?? (score(path, q) !== null ? 0.5 : null);
        return { path, s };
      })
      .filter((r) => r.s !== null)
      .sort((a, b) => (b.s ?? 0) - (a.s ?? 0))
      .slice(0, 12)
      .map((r) => r.path);
  }, [q, files]);

  if (!open) return null;

  return (
    <>
      <div className="quickopen-backdrop" onClick={onClose} />
      <div className="quickopen-panel">
        <input
          className="quickopen-input"
          autoFocus
          placeholder="输入文件名模糊搜索，↑↓ 选择，回车打开"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            else if (e.key === "ArrowDown") {
              e.preventDefault();
              setSel((s) => Math.min(s + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSel((s) => Math.max(s - 1, 0));
            } else if (e.key === "Enter" && results[sel]) {
              onPick(results[sel]);
            }
          }}
        />
        <div className="quickopen-list">
          {results.length === 0 && (
            <div className="quickopen-item">无匹配文件</div>
          )}
          {results.map((path, i) => {
            const base = path.split("/").pop() ?? path;
            const dir = path.slice(0, path.length - base.length);
            return (
              <div
                key={path}
                className={`quickopen-item${i === sel ? " sel" : ""}`}
                onClick={() => onPick(path)}
                onMouseEnter={() => setSel(i)}
              >
                <span>{base}</span>
                <span className="dir">{dir}</span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
