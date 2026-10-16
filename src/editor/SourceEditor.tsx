import { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { keymap } from "@codemirror/view";
import { EditorState, Prec } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { oneDark } from "@codemirror/theme-one-dark";

export interface SourceEditorHandle {
  /** 大纲跳转：滚动到第 n 行（1-based）并置顶 */
  gotoLine(n: number): void;
}

interface Props {
  value: string;
  dark: boolean;
  onChange: (md: string) => void;
  onHandle?: (h: SourceEditorHandle | null) => void;
  /** ⌘/：CM 聚焦时原生菜单加速键不触发，需在编辑器内拦截转交父组件 */
  onToggle?: () => void;
}

export default function SourceEditor({
  value,
  dark,
  onChange,
  onHandle,
  onToggle,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onToggleRef = useRef(onToggle);
  onToggleRef.current = onToggle;

  useEffect(() => {
    const view = new EditorView({
      parent: hostRef.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          Prec.highest(
            keymap.of([
              {
                key: "Mod-/",
                run: () => {
                  onToggleRef.current?.();
                  return true;
                },
              },
            ]),
          ),
          basicSetup,
          EditorView.lineWrapping,
          markdown({ codeLanguages: languages, base: markdownLanguage }),
          dark ? oneDark : [],
          EditorView.theme({
            "&": { height: "100%", backgroundColor: "transparent" },
            ".cm-scroller": {
              fontFamily: "var(--noteon-font-family)",
              fontSize: "var(--noteon-font-size)",
              padding: "2rem 0 40vh",
            },
            ".cm-content": { maxWidth: "800px", margin: "0 auto", caretColor: "currentColor" },
            ".cm-gutters": { display: "none" },
            ".cm-activeLine": { backgroundColor: "transparent" },
            "&.cm-focused": { outline: "none" },
          }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString());
          }),
        ],
      }),
    });
    viewRef.current = view;
    onHandle?.({
      gotoLine: (n) => {
        const v = viewRef.current;
        if (!v) return;
        const line = v.state.doc.line(Math.min(Math.max(n, 1), v.state.doc.lines));
        v.dispatch({
          effects: EditorView.scrollIntoView(line.from, { y: "start" }),
          selection: { anchor: line.from },
        });
        v.focus();
      },
    });
    return () => {
      onHandle?.(null);
      view.destroy();
      viewRef.current = null;
    };
    // 仅挂载时创建一次；外部 value 变化走下面的同步 effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 打开新文档等外部替换内容时同步进 CM（避免与用户输入回环）
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  return <div className={`source-editor${dark ? " dark" : ""}`} ref={hostRef} />;
}
