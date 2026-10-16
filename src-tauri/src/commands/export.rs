use std::path::Path;

/// 通过外部 pandoc 导出（Typora 同样依赖外部 pandoc，不捆绑）。
/// format: "html" | "docx"
#[tauri::command]
pub fn pandoc_export(input: String, format: String) -> Result<String, String> {
    if !matches!(format.as_str(), "html" | "docx") {
        return Err(format!("不支持的导出格式：{format}"));
    }
    let output_path = Path::new(&input).with_extension(&format);
    let output = std::process::Command::new("pandoc")
        .arg(&input)
        .args(["-o", &output_path.to_string_lossy()])
        .output()
        .map_err(|_| {
            "未找到 pandoc。请安装后重试：https://pandoc.org/installing.html（Typora 同样依赖外部 pandoc）"
                .to_string()
        })?;
    if !output.status.success() {
        return Err(format!(
            "pandoc 导出失败：{}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(output_path.to_string_lossy().to_string())
}
