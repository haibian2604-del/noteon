use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, State};
use std::sync::Mutex;

/// 当前激活文档的文件监听器；切换文档时整体替换（旧 watcher 随 drop 注销）
pub struct WatchState(pub Mutex<Option<RecommendedWatcher>>);

/// 监听单个文件的外部变更，事件发给前端决定重载或提示
#[tauri::command]
pub fn watch_file(
    app: AppHandle,
    state: State<'_, WatchState>,
    path: String,
) -> Result<(), String> {
    let handle = app.clone();
    let mut watcher = notify::recommended_watcher(
        move |res: notify::Result<notify::Event>| {
            if res.is_ok() {
                let _ = handle.emit("noteon://file-changed", ());
            }
        },
    )
    .map_err(|e| e.to_string())?;
    watcher
        .watch(std::path::Path::new(&path), RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;
    *state.0.lock().unwrap() = Some(watcher);
    Ok(())
}
