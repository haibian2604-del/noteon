use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    Emitter, Runtime,
};

fn item<R: Runtime>(
    app: &tauri::AppHandle<R>,
    id: &str,
    label: &str,
    accel: Option<&str>,
) -> tauri::Result<MenuItem<R>> {
    MenuItem::with_id(app, id, label, true, accel)
}

/// 构建原生菜单（对齐 Typora 菜单结构），动作统一以 `noteon://menu` 事件转发前端执行。
pub fn build<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
    let app_menu = Submenu::with_id(app, "app", "noteon", true)?;
    app_menu.append(&PredefinedMenuItem::about(app, Some("noteon"), None)?)?;
    app_menu.append(&PredefinedMenuItem::separator(app)?)?;
    app_menu.append(&item(app, "settings", "设置…", Some("CmdOrCtrl+,"))?)?;
    app_menu.append(&PredefinedMenuItem::separator(app)?)?;
    app_menu.append(&PredefinedMenuItem::services(app, None)?)?;
    app_menu.append(&PredefinedMenuItem::hide(app, Some("隐藏 noteon"))?)?;
    app_menu.append(&PredefinedMenuItem::hide_others(app, None)?)?;
    app_menu.append(&PredefinedMenuItem::show_all(app, None)?)?;
    app_menu.append(&PredefinedMenuItem::separator(app)?)?;
    app_menu.append(&PredefinedMenuItem::quit(app, Some("退出 noteon"))?)?;

    // ── 文件 ──
    let file_menu = Submenu::with_id(app, "file", "文件", true)?;
    file_menu.append(&item(app, "new", "新建", Some("CmdOrCtrl+N"))?)?;
    file_menu.append(&item(app, "open", "打开…", Some("CmdOrCtrl+O"))?)?;
    file_menu.append(&item(
        app,
        "open-folder",
        "打开文件夹…",
        Some("CmdOrCtrl+Shift+O"),
    )?)?;
    file_menu.append(&item(app, "quick-open", "快速打开…", Some("CmdOrCtrl+P"))?)?;
    file_menu.append(&PredefinedMenuItem::separator(app)?)?;
    let export_menu = Submenu::with_id(app, "export", "导出", true)?;
    export_menu.append(&item(app, "export:pdf", "PDF…", None)?)?;
    export_menu.append(&item(app, "export:html", "HTML", None)?)?;
    export_menu.append(&item(app, "export:docx", "Word (docx)", None)?)?;
    file_menu.append(&export_menu)?;
    file_menu.append(&PredefinedMenuItem::separator(app)?)?;
    file_menu.append(&item(app, "save", "保存", Some("CmdOrCtrl+S"))?)?;
    file_menu.append(&item(app, "save-as", "另存为…", Some("CmdOrCtrl+Shift+S"))?)?;
    file_menu.append(&PredefinedMenuItem::separator(app)?)?;
    file_menu.append(&PredefinedMenuItem::close_window(app, Some("关闭窗口"))?)?;

    // ── 编辑（系统标准项）──
    let edit_menu = Submenu::with_id(app, "edit", "编辑", true)?;
    edit_menu.append(&PredefinedMenuItem::undo(app, Some("撤销"))?)?;
    edit_menu.append(&PredefinedMenuItem::redo(app, Some("重做"))?)?;
    edit_menu.append(&PredefinedMenuItem::separator(app)?)?;
    edit_menu.append(&PredefinedMenuItem::cut(app, Some("剪切"))?)?;
    edit_menu.append(&PredefinedMenuItem::copy(app, Some("拷贝"))?)?;
    edit_menu.append(&PredefinedMenuItem::paste(app, Some("粘贴"))?)?;
    edit_menu.append(&PredefinedMenuItem::select_all(app, Some("全选"))?)?;

    // ── 段落 ──
    let para_menu = Submenu::with_id(app, "para", "段落", true)?;
    para_menu.append(&item(app, "para:h1", "标题 1", Some("CmdOrCtrl+1"))?)?;
    para_menu.append(&item(app, "para:h2", "标题 2", Some("CmdOrCtrl+2"))?)?;
    para_menu.append(&item(app, "para:h3", "标题 3", Some("CmdOrCtrl+3"))?)?;
    para_menu.append(&item(app, "para:h4", "标题 4", Some("CmdOrCtrl+4"))?)?;
    para_menu.append(&item(app, "para:h5", "标题 5", Some("CmdOrCtrl+5"))?)?;
    para_menu.append(&item(app, "para:h6", "标题 6", Some("CmdOrCtrl+6"))?)?;
    para_menu.append(&PredefinedMenuItem::separator(app)?)?;
    para_menu.append(&item(app, "para:bullet-list", "无序列表", Some("CmdOrCtrl+Alt+U"))?)?;
    para_menu.append(&item(app, "para:ordered-list", "有序列表", Some("CmdOrCtrl+Alt+O"))?)?;
    para_menu.append(&item(app, "para:quote", "引用", Some("CmdOrCtrl+Shift+Q"))?)?;
    para_menu.append(&PredefinedMenuItem::separator(app)?)?;
    para_menu.append(&item(app, "para:code-block", "代码块", Some("CmdOrCtrl+Alt+C"))?)?;
    para_menu.append(&item(app, "para:table", "表格", Some("CmdOrCtrl+Alt+T"))?)?;
    para_menu.append(&item(app, "para:table-row-before", "在上方插入行", None)?)?;
    para_menu.append(&item(app, "para:table-row-after", "在下方插入行", None)?)?;
    para_menu.append(&item(app, "para:table-col-before", "在左侧插入列", None)?)?;
    para_menu.append(&item(app, "para:table-col-after", "在右侧插入列", None)?)?;
    para_menu.append(&item(app, "para:hr", "水平分割线", None)?)?;

    // ── 格式 ──
    let fmt_menu = Submenu::with_id(app, "fmt", "格式", true)?;
    fmt_menu.append(&item(app, "fmt:bold", "加粗", Some("CmdOrCtrl+B"))?)?;
    fmt_menu.append(&item(app, "fmt:italic", "斜体", Some("CmdOrCtrl+I"))?)?;
    fmt_menu.append(&item(app, "fmt:strike", "删除线", Some("CmdOrCtrl+Shift+X"))?)?;
    fmt_menu.append(&item(app, "fmt:inline-code", "行内代码", Some("CmdOrCtrl+Shift+C"))?)?;
    fmt_menu.append(&PredefinedMenuItem::separator(app)?)?;
    fmt_menu.append(&item(app, "fmt:link", "链接", Some("CmdOrCtrl+K"))?)?;

    // ── 视图 ──
    let view_menu = Submenu::with_id(app, "view", "视图", true)?;
    view_menu.append(&item(
        app,
        "toggle-sidebar",
        "切换侧栏",
        Some("CmdOrCtrl+Shift+L"),
    )?)?;
    view_menu.append(&item(
        app,
        "search",
        "搜索",
        Some("CmdOrCtrl+Shift+F"),
    )?)?;
    view_menu.append(&item(
        app,
        "source-mode",
        "源码模式",
        Some("CmdOrCtrl+/"),
    )?)?;
    view_menu.append(&PredefinedMenuItem::separator(app)?)?;
    view_menu.append(&item(app, "focus-mode", "专注模式", Some("F8"))?)?;
    view_menu.append(&item(app, "typewriter-mode", "打字机模式", Some("F9"))?)?;
    view_menu.append(&PredefinedMenuItem::separator(app)?)?;
    let theme_menu = Submenu::with_id(app, "theme", "主题", true)?;
    theme_menu.append(&item(app, "theme:github", "Github（亮色）", None)?)?;
    theme_menu.append(&item(app, "theme:night", "Night（暗色）", None)?)?;
    view_menu.append(&theme_menu)?;
    view_menu.append(&PredefinedMenuItem::separator(app)?)?;
    view_menu.append(&PredefinedMenuItem::fullscreen(app, Some("进入全屏"))?)?;

    let menu = Menu::with_items(
        app,
        &[&app_menu, &file_menu, &edit_menu, &para_menu, &fmt_menu, &view_menu],
    )?;
    app.set_menu(menu)?;

    // 菜单动作统一转发给前端执行
    app.on_menu_event(|app, event| {
        let _ = app.emit("noteon://menu", event.id().as_ref().to_string());
    });

    Ok(())
}
