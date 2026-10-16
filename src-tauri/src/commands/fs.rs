use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_FILE_BYTES: u64 = 64 * 1024 * 1024;

fn guard(path: &str) -> Result<(), String> {
    let meta = fs::metadata(path).map_err(|e| e.to_string())?;
    if meta.len() > MAX_FILE_BYTES {
        return Err(format!("文件超过 {} MB，拒绝加载", MAX_FILE_BYTES / 1024 / 1024));
    }
    Ok(())
}

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    guard(&path)?;
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_text_file(path: String, contents: String) -> Result<(), String> {
    // 先写临时文件再改名，避免写一半崩溃损坏原文档
    let tmp = Path::new(&path).with_extension("md.noteon-tmp");
    fs::write(&tmp, &contents).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        e.to_string()
    })
}

#[derive(serde::Serialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

/// 列出目录一级内容（跳过隐藏项），文件夹在前、名称不区分大小写排序。
/// 树展开由前端按需调用，避免大目录一次性递归。
#[tauri::command]
pub fn list_dir(path: String) -> Result<Vec<DirEntry>, String> {
    let mut out = Vec::new();
    let entries = fs::read_dir(&path).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        out.push(DirEntry {
            name,
            path: entry.path().to_string_lossy().to_string(),
            is_dir,
        });
    }
    out.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(out)
}

/// 保存粘贴/拖入的图片到 `<dir>/assets/`，返回最终文件名。
/// data_base64 为不带 data: 前缀的纯 base64。
#[tauri::command]
pub fn save_image(dir: String, name: String, data_base64: String) -> Result<String, String> {
    use base64::Engine as _;

    // 只取文件名部分，防路径穿越
    let safe_name = name.rsplit(['/', '\\']).next().unwrap_or("image");
    let (stem, ext) = match safe_name.rsplit_once('.') {
        Some((s, e)) if !s.is_empty() => (s.to_string(), e.to_lowercase()),
        _ => (safe_name.to_string(), "png".to_string()),
    };
    let ext = match ext.as_str() {
        "jpg" => "jpeg".to_string(),
        e => e.to_string(),
    };

    let assets = Path::new(&dir).join("assets");
    fs::create_dir_all(&assets).map_err(|e| e.to_string())?;

    let mut final_name = format!("{stem}.{ext}");
    if assets.join(&final_name).exists() {
        let ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        final_name = format!("{stem}-{ms}.{ext}");
    }

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_base64.trim())
        .map_err(|e| format!("图片数据解码失败：{e}"))?;
    if bytes.is_empty() {
        return Err("图片数据为空".into());
    }
    fs::write(assets.join(&final_name), bytes).map_err(|e| e.to_string())?;
    Ok(final_name)
}

/// 新建文件/文件夹（父目录自动创建；同名自动加序号）
#[tauri::command]
pub fn create_path(path: String, is_dir: bool) -> Result<String, String> {
    let mut final_path = path.clone();
    let mut n = 1;
    while Path::new(&final_path).exists() {
        let p = Path::new(&path);
        let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("untitled");
        let ext = p.extension().and_then(|s| s.to_str());
        final_path = match ext {
            Some(e) => p
                .with_file_name(format!("{stem}-{n}.{e}"))
                .to_string_lossy()
                .to_string(),
            None => p
                .with_file_name(format!("{stem}-{n}"))
                .to_string_lossy()
                .to_string(),
        };
        n += 1;
    }
    if is_dir {
        fs::create_dir_all(&final_path).map_err(|e| e.to_string())?;
    } else {
        if let Some(parent) = Path::new(&final_path).parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(&final_path, "").map_err(|e| e.to_string())?;
    }
    Ok(final_path)
}

#[tauri::command]
pub fn rename_path(from: String, to: String) -> Result<(), String> {
    if Path::new(&to).exists() {
        return Err(format!("目标已存在：{to}"));
    }
    fs::rename(&from, &to).map_err(|e| e.to_string())
}

/// 删除到系统废纸篓（防误删）
#[tauri::command]
pub fn delete_path(path: String) -> Result<(), String> {
    trash::delete(&path).map_err(|e| e.to_string())
}

fn is_markdown(p: &Path) -> bool {
    matches!(
        p.extension().and_then(|e| e.to_str()),
        Some("md") | Some("markdown")
    )
}

/// 遍历工作区的 markdown 文件（遵循 .gitignore、跳过隐藏目录），上限 5000
#[tauri::command]
pub fn walk_markdown_files(root: String) -> Result<Vec<String>, String> {
    use ignore::WalkBuilder;

    let mut out = Vec::new();
    for entry in WalkBuilder::new(&root).build() {
        let Ok(entry) = entry else { continue };
        let path = entry.path();
        if entry.file_type().is_some_and(|t| t.is_file()) && is_markdown(path) {
            out.push(path.to_string_lossy().to_string());
            if out.len() >= 5000 {
                break;
            }
        }
    }
    Ok(out)
}

#[derive(serde::Serialize)]
pub struct SearchHit {
    pub path: String,
    pub line: u64,
    pub text: String,
}

/// 全文搜索：ripgrep 的库形态（grep-searcher + ignore），大小写不敏感、字面量匹配
#[tauri::command]
pub fn search_workspace(root: String, query: String) -> Result<Vec<SearchHit>, String> {
    use grep_regex::RegexMatcherBuilder;
    use grep_searcher::sinks::UTF8;
    use grep_searcher::SearcherBuilder;
    use ignore::WalkBuilder;

    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let matcher = RegexMatcherBuilder::new()
        .fixed_strings(true)
        .case_insensitive(true)
        .build(query)
        .map_err(|e| e.to_string())?;
    let cap = 200;

    let mut hits = Vec::new();
    'outer: for entry in WalkBuilder::new(&root).build() {
        let Ok(entry) = entry else { continue };
        let path = entry.path();
        if !(entry.file_type().is_some_and(|t| t.is_file()) && is_markdown(path)) {
            continue;
        }
        let mut per_file = 0usize;
        let mut searcher = SearcherBuilder::new().line_number(true).build();
        let path_str = path.to_string_lossy().to_string();
        let mut sink = UTF8(|line_no, line| {
            if per_file < 20 {
                hits.push(SearchHit {
                    path: path_str.clone(),
                    line: line_no,
                    text: line.trim_end().to_string(),
                });
                per_file += 1;
            }
            Ok(true)
        });
        let _ = searcher.search_path(&matcher, path, &mut sink);
        if hits.len() >= cap {
            break 'outer;
        }
    }
    Ok(hits)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// M4 验收：10 万行级目录全文搜索 < 1s（20 文件 × 5000 行）
    #[test]
    fn search_finds_needle_fast() {
        let dir = std::env::temp_dir().join(format!("noteon-search-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        for i in 0..20 {
            let mut content = String::with_capacity(120_000);
            for l in 0..5000 {
                content.push_str(&format!("file{i} line{l} 普通行\n"));
            }
            content.push_str(&format!("file{i} 目标行 unique-needle-{i}\n"));
            fs::write(dir.join(format!("f{i}.md")), content).unwrap();
        }
        let start = std::time::Instant::now();
        let hits = search_workspace(dir.to_string_lossy().to_string(), "unique-needle".into()).unwrap();
        let elapsed = start.elapsed();
        assert_eq!(hits.len(), 20, "每个文件恰好命中一行");
        assert!(hits.iter().all(|h| h.text.contains("unique-needle")));
        assert!(
            elapsed.as_millis() < 1000,
            "搜索耗时 {}ms，超过 1s 预算",
            elapsed.as_millis()
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn create_dedupes_names() {
        let dir = std::env::temp_dir().join(format!("noteon-create-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let base = dir.join("笔记.md").to_string_lossy().to_string();
        let a = create_path(base.clone(), false).unwrap();
        let b = create_path(base.clone(), false).unwrap();
        assert_ne!(a, b);
        assert!(Path::new(&a).exists() && Path::new(&b).exists());
        let _ = fs::remove_dir_all(&dir);
    }
}
