import { invoke } from "@tauri-apps/api/core";

export { invoke };

export interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

export function readTextFile(path: string): Promise<string> {
  return invoke<string>("read_text_file", { path });
}

export function writeTextFile(path: string, contents: string): Promise<void> {
  return invoke<void>("write_text_file", { path, contents });
}

export function listDir(path: string): Promise<DirEntry[]> {
  return invoke<DirEntry[]>("list_dir", { path });
}

/** 保存图片到 dir/assets/，返回最终文件名 */
export function saveImage(
  dir: string,
  name: string,
  dataBase64: string,
): Promise<string> {
  return invoke<string>("save_image", { dir, name, dataBase64 });
}

/** 监听文件外部变更（切换文档时重复调用即可） */
export function watchFile(path: string): Promise<void> {
  return invoke<void>("watch_file", { path });
}

/** 取命令行传入的待打开文件路径 */
export function takePendingOpen(): Promise<string | null> {
  return invoke<string | null>("take_pending_open");
}

/** 新建文件/文件夹（重名自动加序号），返回最终路径 */
export function createPath(path: string, isDir: boolean): Promise<string> {
  return invoke<string>("create_path", { path, isDir });
}

export function renamePath(from: string, to: string): Promise<void> {
  return invoke<void>("rename_path", { from, to });
}

/** 删除到系统废纸篓 */
export function deletePath(path: string): Promise<void> {
  return invoke<void>("delete_path", { path });
}

/** 遍历工作区 markdown 文件（遵循 .gitignore） */
export function walkMarkdownFiles(root: string): Promise<string[]> {
  return invoke<string[]>("walk_markdown_files", { root });
}

export interface SearchHit {
  path: string;
  line: number;
  text: string;
}

/** 全文搜索（大小写不敏感、字面量） */
export function searchWorkspace(
  root: string,
  query: string,
): Promise<SearchHit[]> {
  return invoke<SearchHit[]>("search_workspace", { root, query });
}

/** 外部 pandoc 导出（html/docx），返回输出文件路径 */
export function pandocExport(input: string, format: string): Promise<string> {
  return invoke<string>("pandoc_export", { input, format });
}

export interface UpdateInfo {
  status: "not-configured" | "up-to-date" | "available";
  version?: string;
  notes?: string;
}

/** 用指定更新源检查更新（源来自设置页，可运行时变更） */
export function checkUpdate(endpoint: string): Promise<UpdateInfo> {
  return invoke<UpdateInfo>("check_update", { endpoint });
}

/** 下载并安装已检查到的更新，完成后应用自动重启 */
export function installUpdate(): Promise<void> {
  return invoke<void>("install_update");
}
