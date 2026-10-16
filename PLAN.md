# noteon — 复刻 Typora 的 Markdown 编辑器（macOS / Tauri）

> 参照对象：Typora 0.11.18 (macOS)。架构结论见上一轮分析：原生薄壳 + Web 编辑内核 + 命令桥。
> noteon 用同构架构实现：**Tauri 2 (Rust 壳) + 系统 WKWebView + Web 编辑内核**，仅针对 macOS。

## 0. 技术栈（已定，不再讨论）

| 层 | 选型 | 说明 |
|---|---|---|
| 壳 | Tauri 2.x | Rust 壳，macOS 用系统 WKWebView |
| 前端 | React 18 + TypeScript + Vite | 构建/路由/状态 |
| 包管理 | pnpm | 本机已装 11.21 |
| 编辑器 | Milkdown（ProseMirror 封装） | 完全所见即所得，Typora 观感 |
| 源码模式 | CodeMirror 6 | 后期阶段，同一 WebView 内切换 |
| 公式 / 图表 / 高亮 | KaTeX / mermaid / Shiki | 懒加载 |
| 搜索 | `ignore` + `grep-searcher` crate | ripgrep 库，不携带二进制 |
| 导出 | WKWebView 打印 → PDF；pandoc 外调 → docx/html 等 | 与 Typora 一致，不捆绑 pandoc |
| 更新 / 崩溃 | tauri-plugin-updater / tauri-plugin-sentry | 产品化阶段 |

**平台范围：仅 macOS**（aarch64 + x86_64 universal）。最低系统 10.15+。
不做 Windows/Linux，不做移动端；跨平台留待以后，不预埋抽象。

## 1. 目录结构

```
noteon/
├── PLAN.md
├── src-tauri/                  # Rust 壳（对应 Typora 原生层）
│   ├── tauri.conf.json
│   ├── Cargo.toml
│   ├── icons/
│   └── src/
│       ├── main.rs             # 入口、窗口、原生菜单
│       ├── commands/           # ← 一比一对应 Typora 的 *Commands 类
│       │   ├── fs.rs           #   DocumentCommands：读/写/另存/最近文件
│       │   ├── watch.rs        #   FileChanges：外部修改监听 (notify)
│       │   ├── search.rs       #   QuickOpenCommands：全局搜索 (ignore/grep-searcher)
│       │   ├── export.rs       #   TyExport/PandocBridge：PDF + pandoc 外调
│       │   ├── image.rs        #   ImageCommands：图片复制/保存/上传
│       │   └── theme.rs        #   主题 CSS 读写（用户 themes 目录）
│       ├── doc.rs              # 脏状态、自动保存、关闭队列（对应 FileCloseQueue）
│       ├── menu.rs             # 原生 NSMenu（文件/编辑/段落/格式/视图/主题/帮助）
│       └── lib.rs
└── src/                        # Web 内核（对应 TypeMark/）
    ├── main.tsx
    ├── App.tsx                 # 布局：侧栏 + 编辑区 + 底部状态
    ├── bridge/
    │   └── ipc.ts              # invoke 封装（对应 WebViewJavascriptBridge）
    ├── editor/
    │   ├── milkdown.ts         # Milkdown 实例、序列化（markdown ↔ 文档）
    │   ├── plugins/            # katex / mermaid / 代码高亮 / 粘贴图片
    │   └── shortcuts.ts        # Typora 快捷键映射（Cmd+B/I/K、表格 Tab…）
    ├── ui/
    │   ├── Sidebar.tsx         # 文件树 + 大纲两个 tab
    │   ├── FileTree.tsx
    │   ├── Outline.tsx
    │   ├── QuickOpen.tsx       # Cmd+P 模糊打开
    │   ├── WordCount.tsx       # 右下角字数统计
    │   └── Titlebar.tsx        # 悬浮工具条（红绿灯留给系统）
    └── themes/                 # Typora 主题协议：一个 CSS 文件一个主题
        ├── github.css          # 默认主题（复刻 Typora Github 主题观感）
        └── github-dark.css
```

## 2. 界面复刻清单（对照 Typora 0.11.18）

按可见界面逐项复刻，验收以截图对比 Typora 为准：

1. **主窗口**：`titleBarStyle: Overlay` + `hiddenTitle`——红绿灯按钮悬浮在内容区左上角，
   无系统标题栏文字，窗口背景即编辑器背景（Typora 标志性外观）。
2. **编辑区**：居中内容列（默认宽 ~800px、上下留白），`#write` 选择器约定沿用 Typora 主题协议，
   现有 Typora 主题 CSS 文件可直接放入 `themes/` 生效。
3. **侧栏**（默认收起，Cmd+Shift+L 或侧栏按钮展开）：
   - Files tab：文件树，打开文件夹为工作区
   - Outline tab：从文档标题实时生成的大纲，点击跳转
4. **左上角悬浮条**：红绿灯右侧一排图标按钮（侧栏、大纲、源码模式切换），hover 显示，仿 Typora。
5. **底部右下角**：字数/字符统计胶囊，点击弹出统计详情（段落数/字符数/字数）。
6. **菜单栏**：原生菜单（不是网页内菜单）——文件、编辑、段落（标题/表格/代码块/引用）、
   格式（加粗/斜体/删除线/高亮）、视图（源码模式/专注模式/打字机模式/主题子菜单）、帮助。
7. **模式**：
   - 专注模式：非当前段落淡化
   - 打字机模式：光标行保持屏幕垂直居中
   - 源码模式：切换到 CodeMirror 6（后期阶段）
8. **默认主题**：复刻 Typora "Github" 亮/暗两套（暗色跟随系统 `prefers-color-scheme`）。
9. **Quick Open**：Cmd+P 模糊搜索文件名，Cmd+Shift+F 全文搜索（后期）。
10. **文档属性区**：打开文件时标题即窗口标题；未命名文档显示 "Untitled"。

不复刻（明确出圈）：iPic/图床账号体系、Sentry 上报、License 窗口、welcome/license 页面、
内置帮助文档（Docs/）、i18n 多语言（先中文+英文）。

## 3. 里程碑与验收

### M1 — 骨架跑通（第 1 周）
- [ ] `pnpm create tauri-app`（React+TS 模板）落进本目录，改名 noteon
- [ ] macOS 窗口配置：Overlay 标题栏、默认尺寸 1000×700、背景色跟随主题
- [ ] Milkdown 集成：可输入、Cmd+B/I、标题/列表/引用/代码块
- [ ] 打开/保存单个 .md（原生菜单 + 拖拽到 Dock 图标），脏标记 + 关闭确认
- **验收**：能打开本机任意 md 文件、编辑、Cmd+S 保存且 markdown 往返无损（round-trip 测试）

### M2 — 界面复刻（第 2 周）
- [ ] 侧栏 Files + Outline、悬浮工具条、字数统计
- [ ] github.css / github-dark.css 复刻，主题热切换
- [ ] 专注模式、打字机模式
- [ ] 完整原生菜单树 + 快捷键
- **验收**：与 Typora 同开一篇文档截图对比，布局/配色/交互一致；Typora 官方主题文件可直接套用

### M3 — 编辑体验补齐（第 3–4 周）✅ 2026-10-15 完成
- [x] KaTeX / mermaid / 代码高亮（懒加载，不拖慢首屏）
- [x] 粘贴/拖拽图片 → 拷入文档同目录 `assets/` 并插入相对链接（未保存文档走 data URL；用 `asset://` 协议加载本地图片）
- [x] 表格编辑（Tab 导航走 gfm 内置 keymap；菜单增删行列）、任务列表
- [x] 自动保存（2.5s 防抖）+ `notify` 外部变更检测：非脏自动重载、脏则询问（已实测自动重载）
- 验收记录：公式/图表/高亮截图一致；调试期间发现并修复 lowlight 未注册语言（mermaid）抛异常中断整个高亮循环的 bug

### M4 — 检索与导出（第 5 周）✅ 2026-10-15 完成
- [x] 文件夹工作区：文件树右键菜单（新建/重命名/删除到废纸篓，内联重命名）、Quick Open (⌘P 模糊匹配)；打开文件自动采纳所在目录为工作区
- [x] 全文搜索（`ignore`+`grep-searcher`+`grep-regex`，搜索 tab 结果面板点击跳转打开文件）
- [x] 导出：PDF 走系统打印对话框（wry 无直接 print-to-PDF API，升级路径：wry `with_webview` 调 WKWebView createPDF）+ `@media print` 样式表；HTML/docx 外调 pandoc（未装则提示安装）
- 验收记录：**10 万行级目录（20 文件×5000 行）全文搜索 0.06s**（Rust 单测断言 <1s）；Quick Open/搜索跳转/新建/重命名均实测通过
- 已知小项：菜单项暂无勾选态；外部删除活跃文档时 UI 不自动关闭；文件树变更后展开状态重置

### M5 — 产品化（按需）✅ 2026-10-15 完成（签名公证/DMG 打包按用户要求跳过）
- [x] 源码模式：CodeMirror 6（`basicSetup` + lang-markdown + language-data 围栏代码高亮 + oneDark 暗色），
  ⌘/ 或标题栏 `</>` 切换，与所见即所得共用 content 状态双向同步；源码模式下大纲从 markdown 文本解析、点击按行号跳转；
  >512KB 文件打开时提示切源码模式（PLAN §4）
- [x] 设置页（⌘, 或 noteon 菜单 → 设置…）：主题 Github/Night、字号 13–24px（html 根字号 rem 基准 + CM 变量）、
  正文字体（系统/衬线/等宽）、自动保存开关、更新源 URL + 检查更新；设置持久化 localStorage
- [x] 自动更新：tauri-plugin-updater，动态更新源（`UpdaterBuilder.endpoints()`，设置页可配，不写死配置）；
  updater 密钥对已生成（`~/.tauri/noteon-updater.key(.pub)`，公钥在 tauri.conf.json）；check_update/install_update
  两个命令，发现新版弹确认 → 下载验签 → 安装后 `app.restart()`
- [x] 崩溃上报（sentry）：**有意不做**——无后端 DSN，接入即假遥测；待有真实 Sentry 项目再接
- 验收记录：
  - 源码模式双向同步实测（源码追加行 → 退出后 WYSIWYG 出现；反向同路径复用 round-trip 管道）
  - 发现并修复：**CM 聚焦时 WKWebView 吞掉原生菜单加速键**（⌘/ 直插 "/"）→ SourceEditor 内
    `Prec.highest(keymap.of([Mod-/]))` 拦截转交父组件；App 另加 window keydown 兜底 ⌘/ 与 ⌘,
    （`defaultPrevented` 守卫避免与 CM 双触发）
  - 自动更新全链路本地实测：本地 HTTP 假源（v0.1.1 manifest）→ 检查 → 原生确认弹窗（含 release notes）→
    下载 → 签名故意不匹配 → 优雅报错"检查失败：下载/安装更新失败：The signature verification failed"；
    空更新源 → "未配置更新源"。真实安装+重启需签名产物与分发服务器，随签名公证一并留待发布阶段
  - tsc ✓ / vitest 3 ✓ / cargo test 2 ✓ / vite build ✓
- 已知小项：CM 主题切换靠 key 重建（丢滚动位置，可接受）；updater 下载进度未接 UI（回调已占位）

## 4. 关键实现约定

- **IPC 边界**：Web 侧只通过 `bridge/ipc.ts` 调 Rust，与 Typora 的 CommandBridge 同构；
  所有文件/系统操作在 Rust 侧，Web 侧不碰 Node API。
- **真相源**：磁盘上的 markdown 文件是唯一真相；Milkdown 文档状态 ↔ markdown 字符串
  序列化必须幂等（round-trip 是 M1 的硬验收，写进 CI）。
- **主题协议**：沿用 Typora——主题 = 单个 CSS 文件 + `#write` 内容列选择器，
  用户主题目录 `~/Library/Application Support/noteon/themes/`。
- **大文件**：>512KB 自动提示切只读/源码模式（Typora 同样会卡，不做虚拟化渲染）。
- **测试基线**：`src-tauri` 内 markdown round-trip 单测 + 一个 `pnpm test` 冒烟测试，
  不搭测试框架全家桶。

## 5. 风险与对策

| 风险 | 对策 |
|---|---|
| Milkdown 边角 case（列表续行、表格、粘贴） | ProseMirror schema 层修，禁止在 React 组件里 hack 文档 |
| markdown round-trip 有损 | M1 就建序列化快照测试，发现即修，不带病前进 |
| WKWebView 与 Chromium 行为差异 | 仅 macOS 无此问题；代码里不引入 Chromium 专有 API |
| Overlay 标题栏拖拽区域 | 用 Tauri `data-tauri-drag-region`，红绿灯 inset 用系统默认 |
