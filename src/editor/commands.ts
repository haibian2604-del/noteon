import { Editor } from "@milkdown/kit/core";
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

/** 无参命令与带参命令的 callCommand 重载不同，分开调 */
function cmd(label: string, key: CommandKey, payload?: unknown): CommandDef {
  return {
    label,
    run: (ed) =>
      ed.action(
        payload === undefined
          ? callCommand(key)
          : callCommand(key, payload as never),
      ),
  };
}

/** 共享格式化命令表：原生菜单 / 工具栏 / 右键菜单统一从这里取 */
export const COMMANDS: Record<string, CommandDef> = {
  h1: cmd("一级标题", wrapInHeadingCommand.key, 1),
  h2: cmd("二级标题", wrapInHeadingCommand.key, 2),
  h3: cmd("三级标题", wrapInHeadingCommand.key, 3),
  h4: cmd("四级标题", wrapInHeadingCommand.key, 4),
  h5: cmd("五级标题", wrapInHeadingCommand.key, 5),
  h6: cmd("六级标题", wrapInHeadingCommand.key, 6),
  "bullet-list": cmd("无序列表", wrapInBulletListCommand.key),
  "ordered-list": cmd("有序列表", wrapInOrderedListCommand.key),
  quote: cmd("引用", wrapInBlockquoteCommand.key),
  "code-block": cmd("代码块", createCodeBlockCommand.key),
  table: cmd("表格（3×3）", insertTableCommand.key, { row: 3, col: 3 }),
  "table-row-before": cmd("上方插入行", addRowBeforeCommand.key),
  "table-row-after": cmd("下方插入行", addRowAfterCommand.key),
  "table-col-before": cmd("左侧插入列", addColBeforeCommand.key),
  "table-col-after": cmd("右侧插入列", addColAfterCommand.key),
  hr: cmd("分割线", insertHrCommand.key),
  bold: cmd("加粗", toggleStrongCommand.key),
  italic: cmd("斜体", toggleEmphasisCommand.key),
  strike: cmd("删除线", toggleStrikethroughCommand.key),
  "inline-code": cmd("行内代码", toggleInlineCodeCommand.key),
  link: cmd("链接", toggleLinkCommand.key),
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
  def.run(ed);
  return true;
}

/** 工具栏展示项（Task 4 定稿完整列表） */
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
];
