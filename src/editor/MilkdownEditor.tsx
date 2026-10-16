import { useEffect, useRef } from "react";
import { Editor, defaultValueCtx, rootCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { history } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { upload, uploadConfig, type Uploader } from "@milkdown/kit/plugin/upload";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { $prose } from "@milkdown/kit/utils";
import { convertFileSrc } from "@tauri-apps/api/core";
import { saveImage } from "../bridge/ipc";
import { mermaidView } from "./mermaidView";
import { createLangHintPlugin } from "./langHint";
import { alertPlugin } from "./alerts";
import { applyRawBracketText } from "./serialize";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github.css";

interface Props {
  defaultValue: string;
  onChange: (markdown: string) => void;
  onReady?: (editor: Editor) => void;
  focusMode?: boolean;
  typewriterMode?: boolean;
  /** 当前文档绝对路径；null 表示未保存的新文档（图片走 data URL） */
  getDocPath: () => string | null;
}

/** 选区所在的最顶层块（专注模式用它圈定活动段落）。 */
function topLevelChild(pm: Element): Element | null {
  const sel = window.getSelection();
  let n = sel?.focusNode ?? null;
  if (!n || !pm.contains(n)) return null;
  while (n && n.parentElement !== pm) n = n.parentElement;
  return n instanceof Element ? n : null;
}

/** 读图为 data URL；stripPrefix=true 时只返回纯 base64（saveImage 入参约定） */
function fileToDataUrl(file: File, stripPrefix: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = String(reader.result);
      resolve(stripPrefix ? r.split(",")[1] ?? "" : r);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Milkdown 实例封装：随父组件 key 变化整体重建（切换文档），不做局部更新。 */
export default function MilkdownEditor({
  defaultValue,
  onChange,
  onReady,
  focusMode = false,
  typewriterMode = false,
  getDocPath,
}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onReadyRef = useRef<((editor: Editor) => void) | null>(null);
  onReadyRef.current = onReady ?? null;
  const getDocPathRef = useRef(getDocPath);
  getDocPathRef.current = getDocPath;
  const modesRef = useRef({ focusMode, typewriterMode });
  modesRef.current = { focusMode, typewriterMode };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let disposed = false;
    let instance: Editor | undefined;

    void (async () => {
      // 重依赖全部懒加载，不拖慢首屏
      const [mathMod, hl, lowlightMod, lowlightPkg] = await Promise.all([
        import("@milkdown/plugin-math"),
        import("prosemirror-highlight"),
        import("prosemirror-highlight/lowlight"),
        import("lowlight"),
      ]);
      if (disposed) return;

      const lowlight = lowlightPkg.createLowlight(lowlightPkg.all);
      const lowParser = lowlightMod.createParser(lowlight);
      // 未注册的语言（如 mermaid）抛异常会中断整个高亮循环，降级为无装饰
      const parser = (
        opts: Parameters<typeof lowParser>[0],
      ): ReturnType<typeof lowParser> => {
        // 无语言块纯文本不高亮（Typora 同款，也省掉 highlightAuto 开销）
        if (!opts.language) return [];
        try {
          return lowParser(opts);
        } catch {
          return [];
        }
      };
      // 默认即针对 code_block 节点、读取 attrs.language
      const highlightPlugin = $prose(() =>
        hl.createHighlightPlugin({ parser }),
      );

      // 图片粘贴/拖拽：保存到文档同目录 assets/，未保存文档走 data URL
      const uploader: Uploader = async (files, schema) => {
        const nodes: PMNode[] = [];
        for (const file of Array.from(files)) {
          if (!file.type.startsWith("image/")) continue;
          try {
            const docPath = getDocPathRef.current();
            let src: string;
            if (!docPath) {
              src = await fileToDataUrl(file, false);
            } else {
              const dir = docPath.split("/").slice(0, -1).join("/");
              const data = await fileToDataUrl(file, true);
              const name = await saveImage(dir, file.name, data);
              src = convertFileSrc(`${dir}/assets/${name}`);
            }
            const node = schema.nodes.image.createAndFill({
              src,
              alt: file.name,
            });
            if (node) nodes.push(node);
          } catch (err) {
            console.error("图片保存失败", err);
          }
        }
        return nodes;
      };

      const editor = Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, root);
          ctx.set(defaultValueCtx, defaultValue);
          ctx.get(listenerCtx).markdownUpdated((_, markdown, _prev) => {
            onChangeRef.current(markdown);
          });
          ctx.update(uploadConfig.key, (prev) => ({ ...prev, uploader }));
          applyRawBracketText(ctx);
        })
        .use(commonmark)
        .use(gfm)
        .use(history)
        .use(listener)
        .use(mathMod.math)
        .use(upload)
        .use(mermaidView)
        .use(highlightPlugin)
        .use(alertPlugin)
        .use($prose(() => createLangHintPlugin()));

      if (disposed) {
        void editor.destroy();
        return;
      }
      try {
        instance = await editor.create();
      } catch (err) {
        root.textContent = `[编辑器初始化失败] ${String(err)}`;
        console.error(err);
        return;
      }
      onReadyRef.current?.(instance);
    })();

    return () => {
      disposed = true;
      if (instance) void instance.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 专注模式 + 打字机模式：监听 selectionchange（输入/移动光标都会触发）
  useEffect(() => {
    const handler = () => {
      const root = rootRef.current;
      const pm = root?.querySelector(".ProseMirror");
      if (!root || !pm) return;
      const { focusMode: focus, typewriterMode: typewriter } = modesRef.current;
      if (!focus && !typewriter) return;

      const child = topLevelChild(pm);
      if (focus) {
        pm.querySelectorAll(":scope > [data-active]").forEach((el) => {
          el.removeAttribute("data-active");
        });
        child?.setAttribute("data-active", "");
      }
      if (typewriter) {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || !pm.contains(sel.anchorNode)) return;
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        if (rect.top === 0 && rect.bottom === 0) return;
        const scroller = root.closest(".editor-scroll");
        if (!scroller) return;
        const box = scroller.getBoundingClientRect();
        scroller.scrollTop += rect.top + rect.height / 2 - (box.top + box.height / 2);
      }
    };
    document.addEventListener("selectionchange", handler);
    return () => document.removeEventListener("selectionchange", handler);
  }, []);

  return <div className="milkdown-host" ref={rootRef} />;
}
