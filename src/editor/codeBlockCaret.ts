import { Plugin } from "@milkdown/kit/prose/state";

export function createCodeBlockCaretPlugin(): Plugin {
  return new Plugin({
    view: () => {
      let frame: number | undefined;
      const cancel = () => {
        if (frame !== undefined) cancelAnimationFrame(frame);
        frame = undefined;
      };
      return {
        update(view, previous) {
          const { state } = view;
          if (previous.doc.eq(state.doc) && previous.selection.eq(state.selection)) return;
          cancel();
          const { $head, empty } = state.selection;
          if (previous.doc.eq(state.doc) || !empty || $head.parent.type.name !== "code_block" ||
              $head.parent.textContent[$head.parentOffset - 1] !== "\n") return;
          frame = requestAnimationFrame(() => {
            frame = undefined;
            if (view.isDestroyed || !view.editable || !view.hasFocus() || view.composing) return;
            const selection = view.dom.ownerDocument.getSelection();
            if (!selection?.isCollapsed || !selection.rangeCount ||
                !view.dom.contains(selection.focusNode)) return;
            // WebKit 换行后可能保留旧光标画面；重置当前范围，不能重放旧位置（PM #1092）。
            const range = selection.getRangeAt(0).cloneRange();
            selection.removeAllRanges();
            selection.addRange(range);
          });
        },
        destroy: cancel,
      };
    },
  });
}
