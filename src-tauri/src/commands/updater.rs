use std::sync::Mutex;

use serde_json::{Value, json};
use tauri::{AppHandle, Runtime, State};
use tauri_plugin_updater::{Update, UpdaterExt};

/// 已检查到的待安装更新（check 与 install 两个命令之间传递）。
pub struct PendingUpdate(pub Mutex<Option<Update>>);

/// 用前端设置里的更新源动态检查更新（更新源不写死在配置里）。
#[tauri::command]
pub async fn check_update<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, PendingUpdate>,
    endpoint: String,
) -> Result<Value, String> {
    let endpoint = endpoint.trim().to_string();
    if endpoint.is_empty() {
        return Ok(json!({ "status": "not-configured" }));
    }
    let url = endpoint
        .parse()
        .map_err(|e| format!("更新源 URL 无效：{e}"))?;
    let updater = app
        .updater_builder()
        .endpoints(vec![url])
        .map_err(|e| format!("更新源配置失败：{e}"))?
        .build()
        .map_err(|e| format!("更新器构建失败：{e}"))?;
    let update = updater
        .check()
        .await
        .map_err(|e| format!("无法检查更新：{e}"))?;
    match update {
        None => Ok(json!({ "status": "up-to-date" })),
        Some(update) => {
            let info = json!({
                "status": "available",
                "version": update.version,
                "notes": update.body,
            });
            *state
                .0
                .lock()
                .map_err(|_| "更新状态锁不可用".to_string())? = Some(update);
            Ok(info)
        }
    }
}

/// 下载并安装待安装的更新，完成后应用自动重启。
#[tauri::command]
pub async fn install_update<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, PendingUpdate>,
) -> Result<(), String> {
    let update = state
        .0
        .lock()
        .map_err(|_| "更新状态锁不可用".to_string())?
        .take();
    let Some(update) = update else {
        return Err("没有待安装的更新，请先检查更新".to_string());
    };
    // 下载进度回调占位：需要进度 UI 时再接
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|e| format!("下载/安装更新失败：{e}"))?;
    app.restart(); // 永不返回
}
