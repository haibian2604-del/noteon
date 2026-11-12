import { act } from "react";
import { createRoot } from "react-dom/client";
import { EditorView } from "@codemirror/view";
import { expect, it, vi } from "vitest";
import SourceEditor from "./SourceEditor";

it("keeps source mode read-only across reloads and restores keyboard editing on exit", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // jsdom 没有文本布局 API；此处只验证编辑权限，不测量光标位置。
  Object.defineProperties(Range.prototype, {
    getClientRects: { configurable: true, value: () => [] },
    getBoundingClientRect: { configurable: true, value: () => new DOMRect() },
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onChange = vi.fn();
  const render = async (readOnly: boolean, value = "abc") => {
    await act(async () => {
      root.render(<SourceEditor value={value} dark={false} readOnly={readOnly} onChange={onChange} />);
    });
  };
  try {
    await render(true);
    const view = EditorView.findFromDOM(host.querySelector(".cm-editor")!)!;
    expect(view.contentDOM.getAttribute("autocapitalize")).toBe("off");
    expect(view.contentDOM.getAttribute("autocorrect")).toBe("off");
    expect(view.contentDOM.getAttribute("spellcheck")).toBe("false");
    const backspace = () => {
      view.dispatch({ selection: { anchor: view.state.doc.length } });
      view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Backspace", code: "Backspace", bubbles: true, cancelable: true,
      }));
    };
    expect(view.contentDOM.getAttribute("contenteditable")).toBe("false");
    backspace();
    expect(view.state.doc.toString()).toBe("abc");
    expect(onChange).not.toHaveBeenCalled();
    await render(true, "external");
    expect(view.state.doc.toString()).toBe("external");
    backspace();
    expect(view.state.doc.toString()).toBe("external");
    await render(false, "external");
    expect(view.contentDOM.getAttribute("contenteditable")).toBe("true");
    backspace();
    expect(view.state.doc.toString()).toBe("externa");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    Reflect.deleteProperty(Range.prototype, "getClientRects");
    Reflect.deleteProperty(Range.prototype, "getBoundingClientRect");
    vi.unstubAllGlobals();
  }
});
