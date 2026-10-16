mod commands;
mod menu;

use std::sync::Mutex;
use tauri::{Emitter, Manager};

/// 命令行传入的待打开文件路径（窗口加载完成前前端无法收事件，先暂存）
struct PendingOpen(Mutex<Option<String>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(PendingOpen(Mutex::new(None)))
        .manage(commands::watch::WatchState(Mutex::new(None)))
        .manage(commands::updater::PendingUpdate(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            commands::fs::read_text_file,
            commands::fs::write_text_file,
            commands::fs::list_dir,
            commands::fs::save_image,
            commands::fs::create_path,
            commands::fs::rename_path,
            commands::fs::delete_path,
            commands::fs::walk_markdown_files,
            commands::fs::search_workspace,
            commands::export::pandoc_export,
            commands::watch::watch_file,
            commands::updater::check_update,
            commands::updater::install_update,
            take_pending_open,
        ])
        .setup(|app| {
            menu::build(app.handle())?;
            if let Some(path) = std::env::args().nth(1) {
                let resolved = std::path::Path::new(&path)
                    .canonicalize()
                    .ok()
                    .map(|p| p.to_string_lossy().to_string());
                *app.state::<PendingOpen>().0.lock().unwrap() = resolved;
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // macOS「打开方式」/ Finder 双击：转换 file:// URL 后转发前端；
            // 同时写入 PendingOpen 兜底（事件先于窗口加载时由前端启动流程取走）
            if let tauri::RunEvent::Opened { urls } = event {
                for url in urls {
                    if let Ok(path) = url.to_file_path() {
                        let path = path.to_string_lossy().to_string();
                        *app.state::<PendingOpen>().0.lock().unwrap() = Some(path.clone());
                        let _ = app.emit("noteon://open-file", path);
                    }
                }
            }
        });
}

#[tauri::command]
fn take_pending_open(state: tauri::State<PendingOpen>) -> Option<String> {
    state.0.lock().unwrap().take()
}
