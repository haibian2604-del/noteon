# noteon

macOS 专属的 Typora 风格 Markdown 编辑器——所见即所得、无预览分栏、主题协议兼容。

架构：**Tauri 2（Rust 原生壳）+ 系统 WKWebView + Web 编辑内核**（React 19 + TypeScript + Milkdown/ProseMirror），仅针对 macOS。

## 功能

**编辑**
- 所得即所见：标题/列表/表格/引用/代码块/图片即时渲染，无左右分栏
- 源码模式（⌘/，CodeMirror 6，与所见即所得双向同步）
- 专注模式、打字机模式
- 选区浮动格式工具栏、编辑区右键菜单（段落/格式/表格/代码）
- GitHub 警告框：`> [!NOTE]` 等五种即时渲染，「段落」菜单一键转换，写盘保持裸 `[!NOTE]`（GitHub/Typora 互通）
- 代码块：``` 语言自动补全、点击右下角语言标签改语言、语法高亮
- 公式（KaTeX）、mermaid 图表（v12）、行内代码高亮（highlight.js）
- YAML frontmatter 识别与渲染（存盘还原 `---` 形式）
- ⌘F 查找替换：正则、区分大小写、计数、全部替换一次撤销

**文件**
- 文件夹工作区：文件树（新建/重命名/删除到废纸篓、隐藏/全部/glob 三态过滤带记忆、↑↓←→ 键盘导航）
- 大纲面板、全文搜索（Rust `ignore`/`grep-searcher`，十万行级 0.06s）
- ⌘P 快速打开
- 自动保存（2.5s 防抖）+ 外部修改检测（非脏自动重载）
- 粘贴/拖拽图片自动拷入文档同目录 `assets/`
- 可声明为系统默认 md 打开方式（Finder 双击直达）

**其他**
- 主题：Github（亮/暗）协议兼容 Typora 主题 CSS；设置页（⌘,）调主题/字号/字体
- 导出：PDF（系统打印）、HTML/docx（外调 pandoc）
- 自动更新（更新源可在设置页配置）

## 开发

要求：macOS、Rust、Node ≥ 20、pnpm。

```bash
pnpm install
pnpm tauri dev      # 开发运行
pnpm test           # vitest（round-trip/告警框/查找替换/过滤等）
pnpm tauri build    # 产物：src-tauri/target/release/bundle/{macos,dmg}
```

设为默认 md 打开方式：安装 DMG 到「应用程序」并首启一次后，
Finder 右键 .md → 显示简介 → 打开方式 → noteon → 「全部更改」，
或 `duti -s com.noteon.app net.daringfireball.markdown all`。

docx/HTML 导出需要 [pandoc](https://pandoc.org/installing.html)（`brew install pandoc`）。

## 结构

```
src/
├── App.tsx            # 布局/状态/菜单事件/模式切换
├── bridge/ipc.ts      # Tauri invoke 封装（唯一 IPC 边界）
├── editor/            # Milkdown 封装、命令表、告警框、查找替换、
│                      #   语言提示、mermaid 视图、frontmatter、序列化
└── ui/                # 侧栏/快速打开/设置/工具栏/右键菜单/查找面板
src-tauri/
├── src/commands/      # fs/watch/search/export/updater
├── src/menu.rs        # 原生菜单
├── Info.plist         # Markdown 文档类型声明
└── icons/
```

## 路线与约定

详细里程碑与验收记录见 [PLAN.md](PLAN.md)；当前实施计划在
[docs/superpowers/plans](docs/superpowers/plans/)。核心约定：磁盘 markdown
是唯一真相（round-trip 幂等是硬验收）、所有系统操作在 Rust 侧、仅 macOS。
