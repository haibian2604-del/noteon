use tauri::{
    menu::{CheckMenuItem, Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu},
    Emitter, Manager, Runtime,
};

struct ViewMenuChecks<R: Runtime>(Vec<CheckMenuItem<R>>);

#[tauri::command]
pub fn set_view_menu_checked<R: Runtime>(
    app: tauri::AppHandle<R>,
    checked: std::collections::HashMap<String, bool>,
) -> Result<(), String> {
    let items = app.state::<ViewMenuChecks<R>>();
    for item in &items.0 {
        let value = checked
            .get(item.id().as_ref())
            .ok_or_else(|| format!("缺少菜单状态：{}", item.id().as_ref()))?;
        item.set_checked(*value).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn item<R: Runtime>(
    app: &tauri::AppHandle<R>,
    id: &str,
    label: &str,
    accel: Option<&str>,
) -> tauri::Result<MenuItem<R>> {
    MenuItem::with_id(app, id, label, true, accel)
}

pub fn handle_menu_event<R: Runtime>(app: &tauri::AppHandle<R>, event: MenuEvent) {
    if event.id().as_ref() == "fullscreen" {
        if let Some(window) = app.get_webview_window("main") {
            if let Err(err) = window
                .is_fullscreen()
                .and_then(|value| window.set_fullscreen(!value))
            {
                eprintln!("切换全屏失败：{err}");
            }
        }
        return;
    }
    // 原生勾选项会自行反转；重复点击当前主题仍应保持选中。
    if event.id().as_ref().starts_with("theme:") {
        for item in &app.state::<ViewMenuChecks<R>>().0 {
            if item.id().as_ref().starts_with("theme:") {
                if let Err(err) = item.set_checked(item.id() == event.id()) {
                    eprintln!("主题菜单状态同步失败：{err}");
                }
            }
        }
    }
    let _ = app.emit("noteon://menu", event.id().as_ref().to_string());
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
    para_menu.append(&PredefinedMenuItem::separator(app)?)?;
    para_menu.append(&item(app, "alert:note", "注意 [!NOTE]", None)?)?;
    para_menu.append(&item(app, "alert:tip", "建议 [!TIP]", None)?)?;
    para_menu.append(&item(app, "alert:important", "重要 [!IMPORTANT]", None)?)?;
    para_menu.append(&item(app, "alert:warning", "警告 [!WARNING]", None)?)?;
    para_menu.append(&item(app, "alert:caution", "危险 [!CAUTION]", None)?)?;

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
    let mut checks = Vec::new();
    for (id, label, accel) in [
        ("toggle-sidebar", "切换侧栏", "CmdOrCtrl+Shift+L"),
        ("search", "搜索", "CmdOrCtrl+Shift+F"),
        ("source-mode", "源码模式", "CmdOrCtrl+/"),
        ("focus-mode", "专注模式", "F8"),
        ("typewriter-mode", "打字机模式", "F9"),
    ] {
        if id == "focus-mode" {
            view_menu.append(&PredefinedMenuItem::separator(app)?)?;
        }
        let check = CheckMenuItem::with_id(app, id, label, true, false, Some(accel))?;
        view_menu.append(&check)?;
        checks.push(check);
    }
    view_menu.append(&PredefinedMenuItem::separator(app)?)?;
    let theme_menu = Submenu::with_id(app, "theme", "主题", true)?;
    for (id, label) in [
        ("theme:github", "Github（亮色）"),
        ("theme:night", "Night（暗色）"),
    ] {
        let check =
            CheckMenuItem::with_id(app, id, label, true, id == "theme:github", None::<&str>)?;
        theme_menu.append(&check)?;
        checks.push(check);
    }
    app.manage(ViewMenuChecks(checks));
    view_menu.append(&theme_menu)?;
    view_menu.append(&PredefinedMenuItem::separator(app)?)?;
    let fullscreen =
        CheckMenuItem::with_id(app, "fullscreen", "全屏", true, false, Some("Ctrl+Super+F"))?;
    view_menu.append(&fullscreen)?;
    if let Some(window) = app.get_webview_window("main") {
        fullscreen.set_checked(window.is_fullscreen()?)?;
        let current_window = window.clone();
        window.on_window_event(move |event| {
            if matches!(event, tauri::WindowEvent::Resized(_)) {
                if let Err(err) = current_window
                    .is_fullscreen()
                    .and_then(|value| fullscreen.set_checked(value))
                {
                    eprintln!("全屏菜单状态同步失败：{err}");
                }
            }
        });
    }

    let menu = Menu::with_items(
        app,
        &[&app_menu, &file_menu, &edit_menu, &para_menu, &fmt_menu, &view_menu],
    )?;
    app.set_menu(menu)?;

    // 菜单动作统一转发给前端执行
    app.on_menu_event(handle_menu_event);

    Ok(())
}
