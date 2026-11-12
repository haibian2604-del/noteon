#[path = "../src/menu.rs"]
mod menu;

use std::collections::HashMap;
use tauri::menu::MenuEvent;

fn main() {
    let mut context = tauri::generate_context!();
    context.config_mut().app.windows[0].visible = false;
    tauri::Builder::default()
        .setup(|app| {
            menu::build(app.handle())?;
            let root = app.menu().unwrap();
            let view_item = root.get("view").unwrap();
            let view = view_item.as_submenu().unwrap();
            let theme_item = view.get("theme").unwrap();
            let theme = theme_item.as_submenu().unwrap();
            assert!(view.get("toggle-sidebar").is_none());
            assert!(view.get("search").is_none());
            for (id, label) in [("sidebar:files", "文件"), ("sidebar:outline", "大纲"), ("sidebar:search", "搜索")] {
                assert_eq!(view.get(id).unwrap().as_check_menuitem().unwrap().text()?, label);
            }
            let ids = ["sidebar:files", "sidebar:outline", "sidebar:search", "source-mode", "focus-mode",
                "typewriter-mode", "theme:github", "theme:night"];

            for enabled in [false, true, false] {
                let checked: HashMap<_, _> = ids.iter().map(|id| {
                    let value = if *id == "theme:github" { !enabled } else { enabled };
                    (id.to_string(), value)
                }).collect();
                menu::set_view_menu_checked(app.handle().clone(), checked.clone()).unwrap();
                for (id, expected) in checked {
                    let item = view.get(&id).or_else(|| theme.get(&id)).unwrap();
                    assert_eq!(item.as_check_menuitem().unwrap().is_checked()?, expected, "{id}");
                }
            }

            for id in ["theme:github", "theme:github", "theme:night", "theme:night"] {
                let selected = theme.get(id).unwrap();
                let selected = selected.as_check_menuitem().unwrap();
                selected.set_checked(!selected.is_checked()?)?;
                menu::handle_menu_event(app.handle(), MenuEvent { id: id.into() });
                for theme_id in ["theme:github", "theme:night"] {
                    let item = theme.get(theme_id).unwrap();
                    assert_eq!(item.as_check_menuitem().unwrap().is_checked()?, theme_id == id);
                }
            }
            let fullscreen = view.get("fullscreen").unwrap();
            assert!(!fullscreen.as_check_menuitem().unwrap().is_checked()?);
            assert!(menu::set_view_menu_checked(app.handle().clone(), HashMap::new()).is_err());
            println!("PASS: all view checks synchronize; theme selection stays exclusive on repeat clicks");
            std::process::exit(0);
        })
        .run(context)
        .expect("native view menu regression check");
}
