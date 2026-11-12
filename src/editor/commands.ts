import { Editor, editorViewCtx } from "@milkdown/kit/core";
import { callCommand } from "@milkdown/kit/utils";
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
import { ALERT_KINDS, ALERT_LABELS, applyAlert } from "./alerts";

export interface CommandDef {
  label: string;
  run: (ed: Editor) => void;
}

type CommandKey = Parameters<typeof callCommand>[0];

/** 命令键在编辑器初始化时才赋值，必须在执行时读取。 */
function cmd(label: string, command: { key: CommandKey }, payload?: unknown): CommandDef {
  return {
    label,
    run: (ed) =>
      ed.action(
        payload === undefined
          ? callCommand(command.key)
          : callCommand(command.key, payload as never),
      ),
  };
}

/** 共享格式化命令表：原生菜单 / 工具栏 / 右键菜单统一从这里取 */
export const COMMANDS: Record<string, CommandDef> = {
  h1: cmd("一级标题", wrapInHeadingCommand, 1),
  h2: cmd("二级标题", wrapInHeadingCommand, 2),
  h3: cmd("三级标题", wrapInHeadingCommand, 3),
  h4: cmd("四级标题", wrapInHeadingCommand, 4),
  h5: cmd("五级标题", wrapInHeadingCommand, 5),
  h6: cmd("六级标题", wrapInHeadingCommand, 6),
  "bullet-list": cmd("无序列表", wrapInBulletListCommand),
  "ordered-list": cmd("有序列表", wrapInOrderedListCommand),
  quote: cmd("引用", wrapInBlockquoteCommand),
  "code-block": cmd("代码块", createCodeBlockCommand),
  table: cmd("表格（3×3）", insertTableCommand, { row: 3, col: 3 }),
  "table-row-before": cmd("上方插入行", addRowBeforeCommand),
  "table-row-after": cmd("下方插入行", addRowAfterCommand),
  "table-col-before": cmd("左侧插入列", addColBeforeCommand),
  "table-col-after": cmd("右侧插入列", addColAfterCommand),
  hr: cmd("分割线", insertHrCommand),
  bold: cmd("加粗", toggleStrongCommand),
  italic: cmd("斜体", toggleEmphasisCommand),
  strike: cmd("删除线", toggleStrikethroughCommand),
  "inline-code": cmd("行内代码", toggleInlineCodeCommand),
  link: {
    label: "链接",
    run: (ed) => {
      const view = ed.action((ctx) => ctx.get(editorViewCtx));
      const dialog = document.createElement("dialog");
      dialog.className = "link-dialog";
      dialog.setAttribute("aria-label", "插入链接");
      dialog.innerHTML = '<form method="dialog"><label>链接地址<input name="href" type="url" required placeholder="https://example.com" class="settings-input" /></label><div><button value="cancel" formnovalidate>取消</button><button value="confirm">确定</button></div></form>';
      dialog.addEventListener("close", () => {
        const href = dialog.querySelector("input")!.value.trim();
        dialog.remove();
        if (view.isDestroyed) return;
        if (dialog.returnValue === "confirm" && href && view.editable) {
          ed.action(callCommand(toggleLinkCommand.key, { href }));
        }
        view.focus();
      }, { once: true });
      document.body.append(dialog);
      dialog.showModal();
    },
  },
};

// 警告框命令（GitHub Alerts，选区一键转换）
for (const k of ALERT_KINDS) {
  COMMANDS["alert:" + k] = {
    label: ALERT_LABELS[k],
    run: (ed) => applyAlert(ed, k),
  };
}

/** 未知键返回 false 且不碰 ed */
export function runEditorCommandKey(ed: Editor, key: string): boolean {
  const def = COMMANDS[key];
  if (!def) return false;
  if (!ed.action((ctx) => ctx.get(editorViewCtx)).editable) return false;
  def.run(ed);
  return true;
}

export interface MenuItemDef {
  key: string;
  label: string;
}

export interface MenuGroup {
  title: string;
  items: MenuItemDef[];
}

const menuItems = (keys: string[]): MenuItemDef[] =>
  keys.map((k) => ({ key: k, label: COMMANDS[k].label }));

/** 编辑区右键菜单分组；表格/代码块上下文按需追加 */
export function buildEditorMenu(ctx: {
  inTable: boolean;
  inCodeBlock: boolean;
}): MenuGroup[] {
  const groups: MenuGroup[] = [
    {
      title: "段落",
      items: menuItems([
        "h1",
        "h2",
        "h3",
        "quote",
        "bullet-list",
        "ordered-list",
        "code-block",
        "hr",
      ]),
    },
    {
      title: "格式",
      items: menuItems(["bold", "italic", "strike", "inline-code", "link"]),
    },
  ];
  if (ctx.inTable) {
    groups.push({
      title: "表格",
      items: menuItems([
        "table-row-before",
        "table-row-after",
        "table-col-before",
        "table-col-after",
      ]),
    });
  }
  if (ctx.inCodeBlock) {
    // copy-code 由组件特判（直取 code 正文写剪贴板），不经 COMMANDS
    groups.push({
      title: "代码",
      items: [{ key: "copy-code", label: "复制代码块内容" }],
    });
  }
  return groups;
}

/** 工具栏展示项（顺序即展示序） */
export const TOOLBAR_ITEMS: { key: string; title: string }[] = [
  { key: "bold", title: "加粗" },
  { key: "italic", title: "斜体" },
  { key: "strike", title: "删除线" },
  { key: "inline-code", title: "行内代码" },
  { key: "link", title: "链接" },
  { key: "h1", title: "标题1" },
  { key: "h2", title: "标题2" },
  { key: "h3", title: "标题3" },
  { key: "quote", title: "引用" },
  { key: "bullet-list", title: "无序列表" },
  { key: "ordered-list", title: "有序列表" },
  { key: "code-block", title: "代码块" },
  { key: "table", title: "表格" },
  { key: "hr", title: "分割线" },
];
