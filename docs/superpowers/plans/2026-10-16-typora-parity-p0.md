# Typora 1.14 功能对齐 · P0 批次 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐 Typora 1.14.10 相对 noteon 的五个 P0 差距:GitHub 警告框、编辑器格式工具栏、编辑区右键菜单、所见即所得查找替换、文件侧栏过滤 + 键盘导航。

**Architecture:** 全部复用现有基建:格式化命令经 Milkdown `callCommand`(现状 `App.tsx:316` 的 `runEditorCommand` map,抽成共享命令表);原生菜单动作沿 `noteon://menu` 事件流转;警告框用 ProseMirror decoration(不引入新节点,序列化天然保真);查找替换 = 纯函数匹配核心 + decoration 插件 + 浮层面板;侧栏过滤在前端对 `listDir` 结果过滤,不碰 Rust。

**Tech Stack:** Tauri 2 + React 19 + TypeScript + @milkdown/kit 7.22(ProseMirror)+ vitest/jsdom(已有真实 Milkdown 编辑器测试范式,见 `roundtrip.test.ts`)。

**Spec:** 2026-10-16 对话《Typora 1.14.10 差距分析》;官方依据 = Typora.dmg 内 `Docs/Change Log.md`(1.8 Alerts、1.14 工具栏/右键样式/侧栏过滤/键盘导航、1.3 查找替换正则+计数)。P1(数学分隔符、代码块默认语言、emoji 补全等)与 P2(图片工具链、导出增强)另立计划,不在本计划内。

## Global Constraints

- 不新增任何 npm 依赖。
- markdown round-trip 幂等不许回归:现有 `pnpm test`(vitest,3 组用例)必须全绿;每个碰文档模型的任务都跑 roundtrip 回归。
- 自动化门禁 = `pnpm test` + `pnpm build`(含 tsc);视觉/交互项最后由用户手动页面验收(现行约定,执行者不做 UI 自动化)。
- 仅 macOS;全部 UI 文案中文;`reference/` 目录已 gitignore,禁止提交。
- 菜单/命令键沿用 `ns:arg` 约定(首个 `:` 分隔,见 `App.tsx` `noteon://menu` handler)。
- 代码注释密度与现状一致:只在代码本身表达不了的约束处写注释。

## Review Focus

1. **警告框 marker 误判**:`[!NOTE]` 出现在段中间、blockquote 第二行、或普通段落首行时,必须不高亮、不隐藏——只有"blockquote 第一个段落的第一行整行匹配"才算。测试:`alerts.test.ts` 反例用例(Task 2)。
2. **查找替换失控**:正则 `.*`/空串导致全文档匹配、上万个匹配卡死 UI——`collectMatches` 上限 1000 并停止;全部替换必须单事务、一次 ⌘Z 可撤销。测试:`findReplace.test.ts` cap 与 count 用例(Task 6)。
3. **工具栏遮挡/残留**:无选区、失焦、源码模式、打开设置时工具栏必须消失;选区贴窗口顶边时弹出层不得越界。测试:纯配置单测 + 手动验收项(Task 4)。
4. **glob 过滤非法输入**:空 pattern、`[abc` 未闭合等必须回退到 default 行为,不得抛异常、不得把文件全隐藏。测试:`treeFilter.test.ts` 用例(Task 8)。
5. **Alerts round-trip 幂等**:`> [!NOTE]` 文档加载→序列化两次结果一致,且高亮不改变序列化输出(decoration 不改 doc)。测试:`alerts.test.ts` 幂等用例(Task 2)。

---

### Task 1: 抽出格式化命令表 `src/editor/commands.ts`

**Files:**
- Create: `src/editor/commands.ts`
- Modify: `src/App.tsx:316-340`(`runEditorCommand` 改为薄包装,import 命令键改自新模块)
- Test: `src/editor/commands.test.ts`

**Interfaces:**
- Consumes: `@milkdown/kit/core` `Editor`、`@milkdown/kit/utils` `callCommand`、commonmark/gfm 命令键(App.tsx 顶部现有 import 的完整清单)。
- Produces(Task 3/4/5 依赖):
  ```ts
  export interface CommandDef { label: string; run: (ed: Editor) => void }
  export const COMMANDS: Record<string, CommandDef>
  export function runEditorCommandKey(ed: Editor, key: string): boolean // 未知键返回 false 且不碰 ed
  export const TOOLBAR_ITEMS: { key: string; title: string }[]           // Task 4 填充
  ```
- `COMMANDS` 键必须与现 `runEditorCommand` map 完全一致(行为零变化):`h1`…`h6`、`bullet-list`、`ordered-list`、`quote`、`code-block`、`table`、`table-row-before`、`table-row-after`、`table-col-before`、`table-col-after`、`hr`、`bold`、`italic`、`strike`、`inline-code`、`link`;label 分别为 一级标题…六级标题、无序列表、有序列表、引用、代码块、表格(3×3)、上方插入行、下方插入行、左侧插入列、右侧插入列、分割线、加粗、斜体、删除线、行内代码、链接。

- [ ] **Step 1: 写失败测试 `src/editor/commands.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { COMMANDS, runEditorCommandKey, TOOLBAR_ITEMS } from "./commands";

const EXPECTED = ["h1","h2","h3","h4","h5","h6","bullet-list","ordered-list",
  "quote","code-block","table","table-row-before","table-row-after",
  "table-col-before","table-col-after","hr","bold","italic","strike",
  "inline-code","link"];

describe("commands registry", () => {
  it("包含全部既有命令键且 label 非空", () => {
    for (const key of EXPECTED) {
      expect(COMMANDS[key], key).toBeDefined();
      expect(COMMANDS[key].label.length).toBeGreaterThan(0);
    }
  });
  it("未知键返回 false", () => {
    // @ts-expect-error 故意传未知键
    expect(runEditorCommandKey(null, "no-such-key")).toBe(false);
  });
  it("TOOLBAR_ITEMS 的 key 都在 COMMANDS 中且 title 非空", () => {
    expect(TOOLBAR_ITEMS.length).toBeGreaterThan(0);
    for (const item of TOOLBAR_ITEMS) {
      expect(COMMANDS[item.key], item.key).toBeDefined();
      expect(item.title.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run src/editor/commands.test.ts`
Expected: FAIL(模块不存在)

- [ ] **Step 3: 实现 `src/editor/commands.ts`**

把 `App.tsx:316` `runEditorCommand` 内的 map 原样搬进 `COMMANDS`(每项 `{label, run}`;`run` 内部就是现在的 `ed.action(callCommand(...))`),`runEditorCommandKey` 查表执行并返回布尔;`TOOLBAR_ITEMS` 本任务先给最小集 `["bold","italic","strike","inline-code","link","h1","h2","h3","quote","bullet-list","ordered-list"]`(Task 4 再调)。App.tsx 的 `runEditorCommand` 改为查 `editorRef` + 调 `runEditorCommandKey`,原 import 的命令键移到 commands.ts。

- [ ] **Step 4: 跑测试 + 全量回归**

Run: `pnpm vitest run src/editor/commands.test.ts && pnpm test && pnpm build`
Expected: 全部 PASS(含既有 3 组用例,tsc 无错)

- [ ] **Step 5: Commit**

```bash
git add src/editor/commands.ts src/editor/commands.test.ts src/App.tsx
git commit -m "refactor: 抽出共享格式化命令表 commands.ts"
```

---

### Task 2: GitHub 警告框解析 + decoration 渲染 `src/editor/alerts.ts`

**Files:**
- Create: `src/editor/alerts.ts`
- Modify: `src/editor/MilkdownEditor.tsx:131-149`(`.use(alertPlugin)`)
- Modify: `src/App.css`(警告框五色样式 + marker 隐藏)
- Test: `src/editor/alerts.test.ts`

**Interfaces:**
- Consumes: `@milkdown/kit/utils` `$prose`、`@milkdown/kit/prose/model` `Node as PMNode`、`@milkdown/kit/prose/state` `Plugin`、`@milkdown/kit/prose/view` `Decoration, DecorationSet`(全部经 `@milkdown/kit` 的 prose 再导出,与现有 import 风格一致)。
- Produces(Task 3 依赖):
  ```ts
  export type AlertKind = "note" | "tip" | "important" | "warning" | "caution";
  export const ALERT_KINDS: AlertKind[];
  export const ALERT_LABELS: Record<AlertKind, string>; // 注意/建议/重要/警告/注意(危险)
  export function parseAlertLine(text: string): AlertKind | null;
  export interface AlertHit { quotePos: number; kind: AlertKind; markerFrom: number; markerTo: number }
  export function scanAlerts(doc: PMNode): AlertHit[];
  export const alertPlugin: ReturnType<typeof $prose>;  // decorations: node→md-alert md-alert-<kind>,marker 内联→alert-marker
  export function applyAlert(ed: Editor, kind: AlertKind): void; // Task 3
  ```
- 语义钉死:`parseAlertLine` 仅当**整行**匹配 `/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i`(大小写不敏感,返回规范小写 kind);`scanAlerts` 只认"blockquote 的第一个子节点的第一个文本块的第一行"。decoration 只加类、不改 doc,marker 靠 `.alert-marker { display: none }` 隐藏。

- [ ] **Step 1: 写失败测试 `src/editor/alerts.test.ts`**

复用 `roundtrip.test.ts:37` 的 `makeEditor` 模式(commonmark+gfm+math);测试文件自带取视图助手(Editor 实例统一经 `action(ctx => ctx.get(editorViewCtx))` 取状态,`editorViewCtx` 来自 `@milkdown/kit/core`):

```ts
function getDoc(ed: Editor): PMNode {
  return ed.action((ctx) => ctx.get(editorViewCtx).state.doc);
}

const NOTE_DOC = "> [!NOTE]\n> 正文第一行\n> 正文第二行\n";

it("parseAlertLine:整行才算,段中/带后缀不算", () => {
  expect(parseAlertLine("[!NOTE]")).toBe("note");
  expect(parseAlertLine("[!warning] ")).toBe("warning");
  expect(parseAlertLine("前缀 [!NOTE]")).toBeNull();
  expect(parseAlertLine("[!NOTE] 后缀")).toBeNull();
  expect(parseAlertLine("[!UNKNOWN]")).toBeNull();
});

it("scanAlerts:找到 NOTE 及 marker 位置;第二行 marker 不算", async () => {
  const ed = await makeEditor(NOTE_DOC);
  const doc = getDoc(ed);
  const hits = scanAlerts(doc);
  expect(hits).toHaveLength(1);
  expect(hits[0].kind).toBe("note");
  expect(doc.textBetween(hits[0].markerFrom, hits[0].markerTo, "\n")).toBe("[!NOTE]");
  const ed2 = await makeEditor("> 正文\n> [!NOTE]\n");
  expect(scanAlerts(getDoc(ed2))).toHaveLength(0);
  await Promise.all([ed.destroy(), ed2.destroy()]);
});

it("round-trip:加载→序列化幂等,marker 原样保留", async () => {
  const ed = await makeEditor(NOTE_DOC);
  const first = editor.action(getMarkdown());
  const second = await makeEditor(first).then(e => { const md = getMd(e); void e.destroy(); return md; });
  expect(second).toBe(first);
  expect(first).toContain("> [!NOTE]");
  await ed.destroy();
});
```

(测试文件顶部按 `roundtrip.test.ts` 同款 import `Editor/defaultValueCtx/rootCtx/commonmark/gfm/getMarkdown` 并自带 `makeEditor`;`getMd` 即 `e.action(getMarkdown())`。)

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run src/editor/alerts.test.ts`
Expected: FAIL(模块不存在)

- [ ] **Step 3: 实现纯函数 + alertPlugin**

`parseAlertLine` 正则如上;`scanAlerts` 遍历顶层子节点找 `blockquote`,取其第一个 child 的第一个 textblock,取该块首行文本(到首个 `\n` 或块尾)喂给 `parseAlertLine`,marker 区间 = 段落起点到首行尾。`alertPlugin = $prose(() => new Plugin({ props: { decorations(state) } }))`:每次对 doc 做缓存化的 `scanAlerts`(简单实现:每次直接扫,文档规模 ≤512KB 可接受),对命中 blockquote `Decoration.node(quotePos, quotePos + node.nodeSize, { class: "md-alert md-alert-" + kind })`,对 marker `Decoration.inline(markerFrom, markerTo, { class: "alert-marker" })`。

- [ ] **Step 4: 跑测试确认通过 + roundtrip 回归**

Run: `pnpm vitest run src/editor/alerts.test.ts && pnpm vitest run src/editor/roundtrip.test.ts`
Expected: PASS

- [ ] **Step 5: 接入编辑器 + CSS**

`MilkdownEditor.tsx` 依赖数组不变(懒加载区外直接 `import { alertPlugin } from "./alerts"`,轻量无需懒加载),`.use(alertPlugin)`。App.css:

```css
div.ProseMirror blockquote.md-alert { border-left-width: 4px; }
div.ProseMirror .alert-marker { display: none; }
div.ProseMirror blockquote.md-alert-note { border-left-color: #0969da; }
div.ProseMirror blockquote.md-alert-tip { border-left-color: #1a7f37; }
div.ProseMirror blockquote.md-alert-important { border-left-color: #8250df; }
div.ProseMirror blockquote.md-alert-warning { border-left-color: #9a6700; }
div.ProseMirror blockquote.md-alert-caution { border-left-color: #cf222e; }
```

(暗色变量沿用主题既有机制,如 App.css 已有 `.dark` 前缀约定则各加一条暗色;实现者按现有暗色写法对齐。)

- [ ] **Step 6: 全量门禁 + Commit**

Run: `pnpm test && pnpm build`
Expected: PASS

```bash
git add src/editor/alerts.ts src/editor/alerts.test.ts src/editor/MilkdownEditor.tsx src/App.css
git commit -m "feat: GitHub 警告框渲染([!NOTE] 等五种,decoration 实现)"
```

---

### Task 3: 警告框应用命令 + 原生菜单「段落 → 警告框」

**Files:**
- Modify: `src/editor/alerts.ts`(加 `applyAlert`)
- Modify: `src/editor/commands.ts`(注册 `alert:note`…`alert:caution` 五个键)
- Modify: `src-tauri/src/menu.rs`(段落子菜单加「警告框」五项,id `alert:note` 等)
- Modify: `src/App.tsx`(`noteon://menu` switch 加 `case "alert"`)
- Test: `src/editor/alerts.test.ts`(追加 applyAlert 用例)

**Interfaces:**
- Consumes: Task 1 `COMMANDS`/`runEditorCommandKey`;Task 2 `AlertKind`/`parseAlertLine`;`@milkdown/kit/core` `editorViewCtx`;commonmark `wrapInBlockquoteCommand`。
- Produces: 菜单事件 `alert:<kind>` → 等价于对当前选区执行"包进 blockquote + 首行写 `[!KIND]`"。

- [ ] **Step 1: 追加失败测试**

```ts
it("applyAlert:普通段落 → 警告框引用", async () => {
  const ed = await makeEditor("一段文字"); // create() 后选区默认落在首段
  applyAlert(ed, "tip");
  expect(getMd(ed)).toBe("> [!TIP]\n> 一段文字\n");
  await ed.destroy();
});

it("applyAlert:已有 plain 引用 → 加 marker;已有 marker → 换 kind", async () => {
  const ed = await makeEditor("> 引用内容\n");
  applyAlert(ed, "warning");
  expect(getMd(ed)).toBe("> [!WARNING]\n> 引用内容\n");
  applyAlert(ed, "caution");
  expect(getMd(ed)).toBe("> [!CAUTION]\n> 引用内容\n");
  await ed.destroy();
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run src/editor/alerts.test.ts`
Expected: FAIL(`applyAlert` 未导出)

- [ ] **Step 3: 实现 `applyAlert(ed, kind)`**

单个 `ed.action(ctx => …)`:取 `editorViewCtx`;若选区顶层块不在 blockquote 内,先在同一 action 里执行 `callCommand(wrapInBlockquoteCommand.key)(ctx)`;然后定位所在 blockquote 首个段落,首行文本经 `parseAlertLine` 判定:已有 marker → 用一个 `tr.replaceWith(markerFrom, markerTo, schema.text("[!" + KIND + "]"))` 替换(大小写统一为大写形式 `[!NOTE]` 等);无 marker → `tr.insertText("[!KIND]\n", 段落起点)`。一次撤销。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run src/editor/alerts.test.ts`
Expected: PASS

- [ ] **Step 5: 注册命令键 + 菜单 + 事件接线**

- `commands.ts`:`ALERT_KINDS.forEach(k => COMMANDS["alert:" + k] = { label: ALERT_LABELS[k], run: ed => applyAlert(ed, k) })`。
- `menu.rs`:照现有 `MenuItem::with_id(app, "para:h2", …)` 写法,在 `para_menu` 追加五项(可先平铺,accel 传 `None`):`alert:note` 注意、`alert:tip` 建议、`alert:important` 重要、`alert:warning` 警告、`alert:caution` 危险。菜单项文字带 `[!NOTE]` 后缀帮助辨认,如「注意 [!NOTE]」。
- `App.tsx` switch:`case "alert": if (arg === "note" || …) runEditorCommand("alert:" + arg);`(或直接 `if (arg) runEditorCommand(\`alert:${arg}\`)`,键不存在时 `runEditorCommandKey` 返回 false 自然兜底)。

- [ ] **Step 6: 门禁 + cargo check + Commit**

Run: `pnpm test && pnpm build && (cd src-tauri && cargo check)`
Expected: 全部通过;菜单出现(用户手动验收)

```bash
git add src/editor/alerts.ts src/editor/commands.ts src-tauri/src/menu.rs src/App.tsx src/editor/alerts.test.ts
git commit -m "feat: 段落菜单新增警告框(五种),选区一键转换"
```

---

### Task 4: 编辑器格式工具栏 `src/ui/FormatToolbar.tsx`

**Files:**
- Create: `src/ui/FormatToolbar.tsx`
- Modify: `src/editor/commands.ts`(`TOOLBAR_ITEMS` 定稿)
- Modify: `src/App.tsx`(渲染,传 `runEditorCommand`;仅 WYSIWYG 模式挂载)
- Modify: `src/App.css`(`.format-toolbar`)
- Test: `src/editor/commands.test.ts`(TOOLBAR_ITEMS 完整性,Task 1 已有用例,此处扩充定稿断言)

**Interfaces:**
- Consumes: Task 1 `COMMANDS`/`TOOLBAR_ITEMS`;App 的 `runEditorCommand`。
- Produces:
  ```tsx
  export default function FormatToolbar(
    { onCommand, enabled }: { onCommand: (key: string) => void; enabled: boolean },
  ): ReactElement | null
  ```
- 定稿 `TOOLBAR_ITEMS`(顺序即展示序):`bold 加粗`、`italic 斜体`、`strike 删除线`、`inline-code 行内代码`、`link 链接`、`h1 标题1`、`h2 标题2`、`h3 标题3`、`quote 引用`、`bullet-list 无序列表`、`ordered-list 有序列表`、`code-block 代码块`、`table 表格`、`hr 分割线`。

- [ ] **Step 1: 扩充失败测试**(commands.test.ts)

```ts
it("TOOLBAR_ITEMS 定稿 14 项且含 code-block/table/hr", () => {
  expect(TOOLBAR_ITEMS.map(i => i.key)).toEqual(
    ["bold","italic","strike","inline-code","link","h1","h2","h3",
     "quote","bullet-list","ordered-list","code-block","table","hr"]);
});
```

Run: `pnpm vitest run src/editor/commands.test.ts` → FAIL

- [ ] **Step 2: 实现 `TOOLBAR_ITEMS` 定稿 + 组件**

组件行为钉死:`document.addEventListener("selectionchange")`;每次取 `window.getSelection()`,条件 = `enabled && 选区非折叠 && 焦点在 .ProseMirror 内`,否则 `return null` 不渲染;可见时定位 `position: fixed`,坐标 = 选区首矩形上方 8px、水平居中于选区,`left`/`top` 各 clamp 到 `[8, innerWidth/innerHeight - 宽/高 - 8]`;按钮 `onMouseDown={e => e.preventDefault()}`(保选区),`onClick={() => onCommand(item.key)}`;按钮显示 title 的首字/短形(B、I、S、<>、🔗、H1…)由 `TOOLBAR_ITEMS` 顺序推导,不新增配置字段。

- [ ] **Step 3: 门禁 + 手动验收项**

Run: `pnpm test && pnpm build`
Expected: PASS
手动验收(用户):选中文字浮出工具栏、点按钮生效、无选区/失焦/源码模式消失、贴顶不越界。

- [ ] **Step 4: Commit**

```bash
git add src/ui/FormatToolbar.tsx src/editor/commands.ts src/editor/commands.test.ts src/App.tsx src/App.css
git commit -m "feat: 选区浮动格式工具栏"
```

---

### Task 5: 编辑区右键菜单 `src/ui/EditorContextMenu.tsx`

**Files:**
- Create: `src/ui/EditorContextMenu.tsx`
- Modify: `src/editor/commands.ts`(加 `buildEditorMenu` 纯函数)
- Modify: `src/App.tsx`(在 WYSIWYG 容器挂载)
- Modify: `src/App.css`(复用现有 `.ctx-menu`/`.ctx-item`,仅加分组标题样式)
- Test: `src/editor/commands.test.ts`

**Interfaces:**
- Consumes: Task 1 `COMMANDS`;现有 `.ctx-menu` 样式(Sidebar.tsx:408 同款)。
- Produces:
  ```ts
  export interface MenuItemDef { key: string; label: string }
  export function buildEditorMenu(
    ctx: { inTable: boolean; inCodeBlock: boolean },
  ): { title: string; items: MenuItemDef[] }[]
  ```
- 语义钉死:组1「段落」= h1,h2,h3,quote,bullet-list,ordered-list,code-block,hr;组2「格式」= bold,italic,strike,inline-code,link;`inTable` 时追加组3「表格」= table-row-before,table-row-after,table-col-before,table-col-after;`inCodeBlock` 时追加组4「代码」= 单项 `{ key: "copy-code", label: "复制代码块内容" }`(由组件特判直取 `closest("pre")` 文本写剪贴板,不经 COMMANDS)。

- [ ] **Step 1: 写失败测试**(commands.test.ts)

```ts
it("buildEditorMenu:基础两组;表格/代码块按需追加", () => {
  const base = buildEditorMenu({ inTable: false, inCodeBlock: false });
  expect(base.map(g => g.title)).toEqual(["段落", "格式"]);
  const tbl = buildEditorMenu({ inTable: true, inCodeBlock: false });
  expect(tbl[2].title).toBe("表格");
  expect(tbl[2].items).toHaveLength(4);
  const code = buildEditorMenu({ inTable: false, inCodeBlock: true });
  expect(code[2].items[0].key).toBe("copy-code");
});
```

Run: `pnpm vitest run src/editor/commands.test.ts` → FAIL

- [ ] **Step 2: 实现纯函数 + 组件**

组件:挂在 WYSIWYG 根容器的 `onContextMenu`;`e.preventDefault()` 后用 `(e.target as HTMLElement).closest("table")` / `.closest("pre")` 算 ctx;弹层复用 `.ctx-menu` 定位(x/y + document mousedown 关闭,照 Sidebar.tsx:265 现有模式);`copy-code` 特判:`navigator.clipboard.writeText(pre.textContent ?? "")`,其余 `onCommand(item.key)`;`COMMANDS[key]` 不存在则跳过该键(兜底)。

- [ ] **Step 3: 门禁 + 手动验收项**

Run: `pnpm test && pnpm build`
Expected: PASS
手动验收(用户):正文/表格/代码块/图片上分别右键,菜单分组正确、动作生效。

- [ ] **Step 4: Commit**

```bash
git add src/ui/EditorContextMenu.tsx src/editor/commands.ts src/editor/commands.test.ts src/App.tsx src/App.css
git commit -m "feat: 编辑区右键上下文菜单(段落/格式/表格/代码)"
```

---

### Task 6: 查找替换核心 `src/editor/findReplace.ts`

**Files:**
- Create: `src/editor/findReplace.ts`
- Test: `src/editor/findReplace.test.ts`

**Interfaces:**
- Consumes: `@milkdown/kit/prose/model` `PMNode`、`@milkdown/kit/prose/state` `Plugin, PluginKey`、`@milkdown/kit/prose/view` `Decoration, DecorationSet, EditorView`。
- Produces(Task 7 依赖):
  ```ts
  export interface FindOptions { regex: boolean; caseSensitive: boolean }
  export interface TextMatch { start: number; end: number }       // 纯文本偏移
  export interface DocMatch { from: number; to: number }          // PM 文档位置
  export function buildTextFinder(text: string, query: string, opts: FindOptions):
    { error: string | null; findAll: () => TextMatch[] };
  export function collectMatches(doc: PMNode, query: string, opts: FindOptions, cap?: number): DocMatch[]; // cap 默认 1000
  export function replaceAllMatches(view: EditorView, query: string, replacement: string, opts: FindOptions): number; // 单事务,返回替换数
  export const findPlugin: Plugin;   // setMeta(findKey, {query, opts, matches, active}) 驱动装饰
  export function pushFindState(view: EditorView, s: FindState | null): void;
  export function stepActive(view: EditorView, delta: 1 | -1): void;   // 循环移动 active
  export interface FindState { query: string; opts: FindOptions; matches: DocMatch[]; active: number }
  ```
- 语义钉死:空 query → matches 恒为 `[]`;`regex:true` 时 `new RegExp(query, caseSensitive ? "g" : "gi")`,构造抛错 → `error` 字符串返回(不 throw);纯文本路径大小写折叠;`collectMatches` 达 cap 即停(不继续扫);`replaceAllMatches` 按位置降序在一个 `tr` 内 `tr.insertText(replacement, from, to)`,一次撤销。

- [ ] **Step 1: 写失败测试 `src/editor/findReplace.test.ts`**

工厂同前(commonmark+gfm+math,**追加 `.use(history)`**);取视图/文档走助手,撤销走 milkdown 历史命令:

```ts
function getView(ed: Editor): EditorView {
  return ed.action((ctx) => ctx.get(editorViewCtx));
}

it("buildTextFinder:普通/大小写/正则/非法正则", () => {
  const t = "aBc abc ABC";
  expect(buildTextFinder(t, "abc", { regex: false, caseSensitive: false }).findAll())
    .toEqual([{ start: 0, end: 3 }, { start: 4, end: 7 }, { start: 8, end: 11 }]);
  expect(buildTextFinder(t, "abc", { regex: false, caseSensitive: true }).findAll())
    .toEqual([{ start: 4, end: 7 }]);
  const re = buildTextFinder(t, "a[bc]c", { regex: true, caseSensitive: false });
  expect(re.error).toBeNull();
  expect(re.findAll().length).toBe(3);
  expect(buildTextFinder(t, "a[bc", { regex: true, caseSensitive: false }).error).not.toBeNull();
  expect(buildTextFinder(t, "", { regex: false, caseSensitive: false }).findAll()).toEqual([]);
});

it("collectMatches:跨块收集 + cap 截断", async () => {
  const ed = await makeEditor(Array(600).fill("hello world").join("\n\n")); // 600 个 hello
  const doc = getView(ed).state.doc;
  expect(collectMatches(doc, "hello", { regex: false, caseSensitive: false })).toHaveLength(600);
  expect(collectMatches(doc, "hello", { regex: false, caseSensitive: false }, 100)).toHaveLength(100);
  await ed.destroy();
});

it("replaceAllMatches:单事务全替换,undo 一次还原", async () => {
  const ed = await makeEditor("foo bar foo\n\nfoo");
  const n = replaceAllMatches(getView(ed), "foo", "baz", { regex: false, caseSensitive: false });
  expect(n).toBe(3);
  expect(ed.action(getMarkdown())).toContain("baz bar baz");
  ed.action(callCommand(undoCommand.key)); // @milkdown/kit/plugin/history
  expect(ed.action(getMarkdown())).not.toContain("baz");
  await ed.destroy();
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run src/editor/findReplace.test.ts`
Expected: FAIL(模块不存在)

- [ ] **Step 3: 实现纯核心 + 插件**

`buildTextFinder` 如语义;`collectMatches`:`doc.descendants` 收集 textblock,逐块 `block.textBetween(...)` 用 finder 的偏移换算成文档位置(注意 textblock 内部偏移起点与块起点的关系);`findPlugin` 用 `PluginKey` + `DecorationSet`:`matches` 全量加 `find-hit`,`matches[active]` 加 `find-current`;`pushFindState`/`stepActive` 都是 `tr.setMeta` + dispatch 的薄封装。测试工厂需 `.use(history)`(@milkdown/kit/plugin/history,`undoCommand` 用于撤销断言)。

- [ ] **Step 4: 跑测试确认通过 + 全量回归**

Run: `pnpm vitest run src/editor/findReplace.test.ts && pnpm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/editor/findReplace.ts src/editor/findReplace.test.ts
git commit -m "feat: 查找替换核心(纯匹配引擎 + decoration 插件)"
```

---

### Task 7: 查找替换面板 `src/ui/FindReplace.tsx` + App 接线

**Files:**
- Create: `src/ui/FindReplace.tsx`
- Modify: `src/App.tsx`(state `findOpen`;⌘F 打开、Esc 关闭;仅 WYSIWYG 挂载)
- Modify: `src/App.css`(`.find-bar`)
- Test: 无新单测(逻辑在 Task 6);门禁 + 手动验收

**Interfaces:**
- Consumes: Task 6 全部导出;App 现有 `editorRef`。
- Produces:
  ```tsx
  export default function FindReplace(
    { open, onClose, getView }:
    { open: boolean; onClose: () => void; getView: () => EditorView | null },
  ): ReactElement | null
  ```
- 行为钉死:输入即搜(≥1 字符时 `pushFindState`,清空时 `pushFindState(view, null)`);计数显示 `active+1/total`;Enter=下一个、Shift+Enter=上一个;按钮:上一个、下一个、替换当前(以替换文本 replace 当前 match 区间后重算)、全部替换(`replaceAllMatches`,完成后气泡/文本提示替换数);`.*` 与 `Aa` 两个切换钮(aria-pressed);Esc → `onClose` 且清 decorations;`onClose` 后再次打开保留上次 query/opts。

- [ ] **Step 1: 实现组件 + App 接线**

App:`const [findOpen, setFindOpen] = useState(false)`;现有 ⌘ 兜底 keydown(`App.tsx:512` 一带)加 `e.key === "f"` 分支(`!sourceMode` 才置 true);`<FindReplace open={findOpen} onClose={…} getView={() => editorRef.current?.action(ctx => ctx.get(editorViewCtx)) ?? null} />`。面板定位:编辑区右上角 `position: absolute`(宿主容器 relative)。

- [ ] **Step 2: 门禁 + 手动验收项**

Run: `pnpm test && pnpm build`
Expected: PASS
手动验收(用户):⌘F 呼出、正则/大小写切换、Enter/Shift+Enter 循环、全部替换一次 ⌘Z 还原、Esc 关闭后高亮消失。

- [ ] **Step 3: Commit**

```bash
git add src/ui/FindReplace.tsx src/App.tsx src/App.css
git commit -m "feat: 所见即所得查找替换面板(⌘F)"
```

---

### Task 8: 文件侧栏过滤 `src/ui/treeFilter.ts`

**Files:**
- Create: `src/ui/treeFilter.ts`
- Modify: `src/ui/Sidebar.tsx`(files tab 顶部过滤条;根与子目录都套 `filterEntries`)
- Modify: `src/App.css`(`.tree-filter`)
- Test: `src/ui/treeFilter.test.ts`

**Interfaces:**
- Consumes: `DirEntry`(ipc.ts:5,本模块用结构化类型,不 import,便于测试)。
- Produces:
  ```ts
  export type FileFilterMode = "default" | "all" | "glob";
  export interface FileFilter { mode: FileFilterMode; pattern: string }
  export const DEFAULT_FILE_FILTER: FileFilter;
  export function globToRegExp(pattern: string): RegExp | null; // 仅支持 * 与 ?,非法/空 → null
  export function filterEntries<T extends { name: string; is_dir: boolean }>(entries: T[], filter: FileFilter): T[];
  ```
- 语义钉死:`default` 隐藏 `.` 开头;`all` 全显;`glob` 仅保留文件名匹配 pattern 的**文件**,目录始终显示;pattern 为空或 `globToRegExp` 返回 null → 按 `default` 处理。

- [ ] **Step 1: 写失败测试 `src/ui/treeFilter.test.ts`**

```ts
const ENTRIES = [
  { name: ".hidden.md", is_dir: false },
  { name: "note.md", is_dir: false },
  { name: "readme.txt", is_dir: false },
  { name: ".git", is_dir: true },
  { name: "assets", is_dir: true },
];

it("default 隐藏点开头文件,目录不隐藏", () => {
  expect(filterEntries(ENTRIES, { mode: "default", pattern: "" }).map(e => e.name))
    .toEqual(["note.md", "readme.txt", ".git", "assets"]);
});
it("all 全显", () => {
  expect(filterEntries(ENTRIES, { mode: "all", pattern: "" })).toHaveLength(5);
});
it("glob 只留匹配文件,目录恒显;空/非法 pattern 回退 default", () => {
  // glob 是用户显式点名,`*` 按 [^/]* 匹配,点开头文件同样参与匹配
  expect(filterEntries(ENTRIES, { mode: "glob", pattern: "*.md" }).map(e => e.name))
    .toEqual([".hidden.md", "note.md", ".git", "assets"]);
  expect(filterEntries(ENTRIES, { mode: "glob", pattern: "note?md" }).map(e => e.name))
    .toEqual(["note.md", ".git", "assets"]);
  expect(filterEntries(ENTRIES, { mode: "glob", pattern: "[abc" }).map(e => e.name))
    .toEqual(["note.md", "readme.txt", ".git", "assets"]); // 非法 → default
});
```

Run: `pnpm vitest run src/ui/treeFilter.test.ts` → FAIL

- [ ] **Step 2: 实现 `treeFilter.ts` + Sidebar 接线**

`globToRegExp`:`*` → `[^/]*`、`?` → `[^/]`、其余字符转义,`^…$` 锚定,构造 try/catch 返回 null。Sidebar:files tab 顶部一行三态(`隐藏隐藏文件/全部/匹配模式` 下拉 select + glob 时右侧输入框),选择持久化 `localStorage["noteon.fileFilter"]`(JSON,读入时校验 mode 合法);`listDir` 结果(根目录与 `FileTreeRow` 展开的 children)都过 `filterEntries`,filter 通过 prop 下传。

- [ ] **Step 3: 门禁 + 手动验收项**

Run: `pnpm test && pnpm build`
Expected: PASS
手动验收(用户):三态切换生效、非法 glob 不炸、重启后记住选择。

- [ ] **Step 4: Commit**

```bash
git add src/ui/treeFilter.ts src/ui/treeFilter.test.ts src/ui/Sidebar.tsx src/App.css
git commit -m "feat: 文件树过滤(隐藏/全部/glob)带记忆"
```

---

### Task 9: 文件树键盘导航

**Files:**
- Create: `src/ui/treeNav.ts`
- Modify: `src/ui/Sidebar.tsx`(files tab 容器 `tabIndex={0}` + onKeyDown + 焦点样式)
- Modify: `src/App.css`(`.tree-row.cursor` 高亮)
- Test: `src/ui/treeNav.test.ts`

**Interfaces:**
- Consumes: Task 8 之后的 files tab DOM(`.tree-row` 顺序即可见序)。
- Produces:
  ```ts
  export function moveCursor(current: number | null, count: number, key: "up" | "down"): number | null;
  // null=无光标;up:0→null,down:null→0、末尾不再前进;空列表恒 null
  ```
- 交互钉死:容器可聚焦(`tabIndex={0}`);`↑/↓` 在当前可见 `.tree-row` DOM 序上移动 `cursorPath`;`Enter`/`→` 对目录行为点击(展开/收起,`rowEl.click()`),对文件 `onOpenFile`;`←` 对目录再点一次(收起),对文件无动作;过滤(Task 8)改变行集后 `cursorPath` 若不在列表中则清空。

- [ ] **Step 1: 写失败测试 `src/ui/treeNav.test.ts`**

```ts
it("moveCursor:边界与循环语义", () => {
  expect(moveCursor(null, 3, "down")).toBe(0);
  expect(moveCursor(0, 3, "down")).toBe(1);
  expect(moveCursor(2, 3, "down")).toBe(2);   // 末尾停住
  expect(moveCursor(null, 3, "up")).toBeNull();
  expect(moveCursor(0, 3, "up")).toBeNull();  // 顶部退出光标
  expect(moveCursor(1, 3, "up")).toBe(0);
  expect(moveCursor(0, 0, "down")).toBeNull();
});
```

Run: `pnpm vitest run src/ui/treeNav.test.ts` → FAIL

- [ ] **Step 2: 实现 + Sidebar 接线**

`moveCursor` 一行逻辑;Sidebar files tab:容器 `ref` + `cursorPath` state + onKeyDown 映射(↑↓ 调 `moveCursor` 后 `querySelectorAll(".tree-row")[i]?.scrollIntoView({ block: "nearest" })` 并设高亮类;Enter/←/→ 按上面语义对 `cursorPath` 对应行执行 `.click()` 或 `onOpenFile`);行渲染加 `cursorPath === entry.path ? " cursor" : ""`。

- [ ] **Step 3: 门禁 + 手动验收项**

Run: `pnpm test && pnpm build`
Expected: PASS
手动验收(用户):点进侧栏后 ↑↓ 移动、Enter 打开文件、←→ 收展目录、过滤后光标不悬空。

- [ ] **Step 4: Commit**

```bash
git add src/ui/treeNav.ts src/ui/treeNav.test.ts src/ui/Sidebar.tsx src/App.css
git commit -m "feat: 文件树键盘导航(↑↓←→/Enter)"
```

---

## 完成定义(整批验收)

1. `pnpm test` 全绿(新增 5 个测试文件 + 既有 roundtrip/highlight/frontmatter 回归)、`pnpm build` 通过、`cargo check` 通过。
2. 用户手动验收清单:警告框五色渲染与菜单转换、工具栏随选区浮出、右键菜单分组正确、⌘F 查找替换(正则/计数/一次撤销)、侧栏三态过滤 + 键盘导航。
3. 每个任务一个独立 commit,消息见各任务 Step。
