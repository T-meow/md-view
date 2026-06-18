use encoding_rs::GBK;
use serde::{Deserialize, Serialize};
use std::{
    collections::hash_map::DefaultHasher,
    fs,
    hash::{Hash, Hasher},
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Serialize)]
struct FileNode {
    path: String,
    name: String,
    kind: String,
    children: Vec<FileNode>,
    size: u64,
    modified_at: u64,
}

#[derive(Debug, Serialize)]
struct ReadFileResult {
    path: String,
    content: String,
    encoding: String,
    modified_at: u64,
}

#[derive(Debug, Serialize)]
struct OpenPathResult {
    kind: String,
    workspace_path: Option<String>,
    file_path: Option<String>,
    tree: Option<FileNode>,
    file: Option<ReadFileResult>,
}

#[derive(Debug, Serialize)]
struct SaveResult {
    ok: bool,
    conflict: bool,
    modified_at: Option<u64>,
    message: Option<String>,
}

#[derive(Debug, Serialize)]
struct Heading {
    level: usize,
    text: String,
    line: usize,
    anchor: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct DraftContent {
    path: String,
    content: String,
    updated_at: u64,
    content_hash: String,
}

#[derive(Debug, Serialize)]
struct DraftSummary {
    path: String,
    updated_at: u64,
    content_hash: String,
}

type AppResult<T> = Result<T, String>;

#[tauri::command]
fn open_workspace(path: String) -> AppResult<FileNode> {
    let root = PathBuf::from(path);
    if !root.is_dir() {
        return Err("请选择有效目录".into());
    }
    scan_directory(&root)
}

#[tauri::command]
fn open_path(path: String) -> AppResult<OpenPathResult> {
    let source_path = PathBuf::from(path);

    if source_path.is_dir() {
        let tree = scan_directory(&source_path)?;
        return Ok(OpenPathResult {
            kind: "workspace".into(),
            workspace_path: Some(normalize_path(&source_path)),
            file_path: None,
            tree: Some(tree),
            file: None,
        });
    }

    if source_path.is_file() {
        if !is_markdown(&source_path) {
            return Err("只能打开 .md 或 .markdown 文件".into());
        }

        let workspace_path = source_path
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| PathBuf::from("."));
        let tree = scan_directory(&workspace_path)?;
        let file = read_file_path(&source_path)?;

        return Ok(OpenPathResult {
            kind: "file".into(),
            workspace_path: Some(normalize_path(&workspace_path)),
            file_path: Some(normalize_path(&source_path)),
            tree: Some(tree),
            file: Some(file),
        });
    }

    Err("路径不存在或无法访问".into())
}

#[tauri::command]
fn read_file(path: String) -> AppResult<ReadFileResult> {
    let file_path = PathBuf::from(&path);
    if !file_path.is_file() {
        return Err("文件不存在".into());
    }
    if !is_markdown(&file_path) {
        return Err("Only .md and .markdown files are supported.".into());
    }
    read_file_path(&file_path)
}

#[tauri::command]
fn initial_open_paths() -> Vec<String> {
    std::env::args_os()
        .skip(1)
        .map(PathBuf::from)
        .filter(|path| path.exists() && (path.is_dir() || is_markdown(path)))
        .map(|path| normalize_path(&path))
        .collect()
}

#[tauri::command]
async fn open_default_app_settings() -> AppResult<()> {
    #[cfg(target_os = "windows")]
    {
        tauri::async_runtime::spawn_blocking(register_user_file_associations)
            .await
            .map_err(to_error)??;
        hidden_command("explorer.exe")
            .arg("ms-settings:defaultapps")
            .spawn()
            .map(|_| ())
            .map_err(to_error)
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("当前平台请在系统设置中手动选择默认应用".into())
    }
}

#[cfg(target_os = "windows")]
fn register_user_file_associations() -> AppResult<()> {
    cleanup_legacy_file_associations();

    let exe_path = std::env::current_exe().map_err(to_error)?;
    let exe_name = exe_path
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| "md-view.exe".into());
    let exe_path = normalize_path(&exe_path);
    let app_name = "md-view";
    let prog_id = "MdView.Markdown";
    let open_command = format!("\"{}\" \"%1\"", exe_path);
    let icon = format!("\"{}\",0", exe_path);

    reg_add_default("HKCU\\Software\\Classes\\MdView.Markdown", "Markdown 文档")?;
    reg_add_default("HKCU\\Software\\Classes\\MdView.Markdown\\DefaultIcon", &icon)?;
    reg_add_default(
        "HKCU\\Software\\Classes\\MdView.Markdown\\shell\\open",
        "使用 md-view 打开",
    )?;
    reg_add_default(
        "HKCU\\Software\\Classes\\MdView.Markdown\\shell\\open\\command",
        &open_command,
    )?;

    for extension in [".md", ".markdown"] {
        reg_add_default(&format!("HKCU\\Software\\Classes\\{extension}"), prog_id)?;
        reg_add_value(
            &format!("HKCU\\Software\\Classes\\{extension}\\OpenWithProgids"),
            prog_id,
            "",
        )?;
    }

    let application_key = format!("HKCU\\Software\\Classes\\Applications\\{exe_name}");
    reg_add_default(
        &format!("{application_key}\\shell\\open\\command"),
        &open_command,
    )?;
    for extension in [".md", ".markdown"] {
        reg_add_value(
            &format!("{application_key}\\SupportedTypes"),
            extension,
            "",
        )?;
    }

    reg_add_value(
        "HKCU\\Software\\MdView\\Capabilities",
        "ApplicationName",
        app_name,
    )?;
    reg_add_value(
        "HKCU\\Software\\MdView\\Capabilities",
        "ApplicationDescription",
        "md-view Markdown 阅读与编辑器",
    )?;
    for extension in [".md", ".markdown"] {
        reg_add_value(
            "HKCU\\Software\\MdView\\Capabilities\\FileAssociations",
            extension,
            prog_id,
        )?;
    }
    reg_add_value(
        "HKCU\\Software\\RegisteredApplications",
        app_name,
        "Software\\MdView\\Capabilities",
    )?;

    Ok(())
}

#[cfg(target_os = "windows")]
fn cleanup_legacy_file_associations() {
    let _ = run_reg(["delete", "HKCU\\Software\\Classes\\MarkdownReaderEditor.Markdown", "/f"]);
    let _ = run_reg(["delete", "HKCU\\Software\\MarkdownReaderEditor", "/f"]);
    let _ = run_reg([
        "delete",
        "HKCU\\Software\\RegisteredApplications",
        "/v",
        "Markdown 本地阅读编辑器",
        "/f",
    ]);
}

#[cfg(target_os = "windows")]
fn reg_add_default(key: &str, value: &str) -> AppResult<()> {
    run_reg(["add", key, "/ve", "/d", value, "/f"])
}

#[cfg(target_os = "windows")]
fn reg_add_value(key: &str, name: &str, value: &str) -> AppResult<()> {
    run_reg(["add", key, "/v", name, "/d", value, "/f"])
}

#[cfg(target_os = "windows")]
fn run_reg<const N: usize>(args: [&str; N]) -> AppResult<()> {
    let output = hidden_command("reg.exe").args(args).output().map_err(to_error)?;
    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Err(if stderr.is_empty() { stdout } else { stderr })
}

#[cfg(target_os = "windows")]
fn hidden_command(program: &str) -> Command {
    let mut command = Command::new(program);
    command.creation_flags(CREATE_NO_WINDOW);
    command
}

fn read_file_path(file_path: &Path) -> AppResult<ReadFileResult> {
    let bytes = fs::read(&file_path).map_err(to_error)?;
    let (content, encoding) = decode_text(&bytes);
    let modified_at = modified_at(&file_path)?;
    Ok(ReadFileResult {
        path: normalize_path(file_path),
        content,
        encoding,
        modified_at,
    })
}

#[tauri::command]
fn save_file(path: String, content: String, expected: Option<u64>, overwrite: bool) -> AppResult<SaveResult> {
    let file_path = PathBuf::from(&path);
    if !file_path.is_file() {
        return Err("文件不存在，无法保存".into());
    }

    if !is_markdown(&file_path) {
        return Err("Only .md and .markdown files are supported.".into());
    }

    let current_modified = modified_at(&file_path)?;
    if let Some(expected_modified) = expected {
        if current_modified != expected_modified && !overwrite {
            return Ok(SaveResult {
                ok: false,
                conflict: true,
                modified_at: Some(current_modified),
                message: Some("磁盘文件已被外部修改。".into()),
            });
        }
    }

    fs::write(&file_path, content.as_bytes()).map_err(to_error)?;
    let modified_at = modified_at(&file_path)?;
    Ok(SaveResult {
        ok: true,
        conflict: false,
        modified_at: Some(modified_at),
        message: None,
    })
}

#[tauri::command]
fn extract_outline(content: String) -> Vec<Heading> {
    let mut headings = Vec::new();
    let mut in_fence = false;

    for (index, line) in content.lines().enumerate() {
        let trimmed = line.trim_start();
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            in_fence = !in_fence;
            continue;
        }
        if in_fence || !trimmed.starts_with('#') {
            continue;
        }

        let level = trimmed.chars().take_while(|char| *char == '#').count();
        if level == 0 || level > 6 {
            continue;
        }
        let rest = &trimmed[level..];
        if !rest.starts_with(' ') {
            continue;
        }
        let text = rest.trim().trim_end_matches('#').trim().to_string();
        if text.is_empty() {
            continue;
        }
        let line_number = index + 1;
        headings.push(Heading {
            level,
            text,
            line: line_number,
            anchor: format!("heading-{line_number}"),
        });
    }

    headings
}

#[tauri::command]
fn write_draft(app: AppHandle, path: String, content: String) -> AppResult<DraftSummary> {
    let draft = DraftContent {
        path: path.clone(),
        content_hash: stable_hash(&content),
        content,
        updated_at: now_ms(),
    };
    let drafts_dir = drafts_dir(&app)?;
    fs::create_dir_all(&drafts_dir).map_err(to_error)?;
    let draft_path = draft_path(&drafts_dir, &path);
    let bytes = serde_json::to_vec_pretty(&draft).map_err(to_error)?;
    fs::write(draft_path, bytes).map_err(to_error)?;
    Ok(DraftSummary {
        path,
        updated_at: draft.updated_at,
        content_hash: draft.content_hash,
    })
}

#[tauri::command]
fn read_draft(app: AppHandle, path: String) -> AppResult<Option<DraftContent>> {
    let drafts_dir = drafts_dir(&app)?;
    let draft_path = draft_path(&drafts_dir, &path);
    if !draft_path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(draft_path).map_err(to_error)?;
    let draft = serde_json::from_slice::<DraftContent>(&bytes).map_err(to_error)?;
    Ok(Some(draft))
}

#[tauri::command]
fn delete_draft(app: AppHandle, path: String) -> AppResult<bool> {
    let drafts_dir = drafts_dir(&app)?;
    let draft_path = draft_path(&drafts_dir, &path);
    if draft_path.exists() {
        fs::remove_file(draft_path).map_err(to_error)?;
        return Ok(true);
    }
    Ok(false)
}

#[tauri::command]
fn list_drafts(app: AppHandle, workspace: String) -> AppResult<Vec<DraftSummary>> {
    let drafts_dir = drafts_dir(&app)?;
    let workspace_path = PathBuf::from(workspace);
    if !drafts_dir.exists() {
        return Ok(Vec::new());
    }

    let mut drafts = Vec::new();
    for entry in fs::read_dir(drafts_dir).map_err(to_error)? {
        let entry = entry.map_err(to_error)?;
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let bytes = fs::read(path).map_err(to_error)?;
        let draft = serde_json::from_slice::<DraftContent>(&bytes).map_err(to_error)?;
        if PathBuf::from(&draft.path).starts_with(&workspace_path) {
            drafts.push(DraftSummary {
                path: draft.path,
                updated_at: draft.updated_at,
                content_hash: draft.content_hash,
            });
        }
    }
    drafts.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(drafts)
}

#[tauri::command]
fn clear_workspace_drafts(app: AppHandle, workspace: String) -> AppResult<usize> {
    let drafts_dir = drafts_dir(&app)?;
    let workspace_path = PathBuf::from(workspace);
    if !drafts_dir.exists() {
        return Ok(0);
    }

    let mut removed = 0;
    for entry in fs::read_dir(drafts_dir).map_err(to_error)? {
        let entry = entry.map_err(to_error)?;
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }

        let bytes = fs::read(&path).map_err(to_error)?;
        let draft = serde_json::from_slice::<DraftContent>(&bytes).map_err(to_error)?;
        if PathBuf::from(&draft.path).starts_with(&workspace_path) {
            fs::remove_file(path).map_err(to_error)?;
            removed += 1;
        }
    }

    Ok(removed)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            open_workspace,
            open_path,
            read_file,
            save_file,
            extract_outline,
            write_draft,
            read_draft,
            delete_draft,
            list_drafts,
            clear_workspace_drafts,
            initial_open_paths,
            open_default_app_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn scan_directory(path: &Path) -> AppResult<FileNode> {
    let metadata = fs::metadata(path).map_err(to_error)?;
    let mut children = Vec::new();

    for entry in fs::read_dir(path).map_err(to_error)? {
        let entry = entry.map_err(to_error)?;
        let child_path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();

        if should_skip(&file_name) {
            continue;
        }

        if child_path.is_dir() {
            let node = scan_directory(&child_path)?;
            if !node.children.is_empty() {
                children.push(node);
            }
        } else if is_markdown(&child_path) {
            let child_metadata = fs::metadata(&child_path).map_err(to_error)?;
            children.push(FileNode {
                path: normalize_path(&child_path),
                name: file_name,
                kind: "file".into(),
                children: Vec::new(),
                size: child_metadata.len(),
                modified_at: system_time_to_ms(child_metadata.modified().ok()),
            });
        }
    }

    children.sort_by(|left, right| {
        let left_rank = if left.kind == "directory" { 0 } else { 1 };
        let right_rank = if right.kind == "directory" { 0 } else { 1 };
        left_rank
            .cmp(&right_rank)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });

    Ok(FileNode {
        path: normalize_path(path),
        name: path
            .file_name()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_else(|| normalize_path(path)),
        kind: "directory".into(),
        children,
        size: metadata.len(),
        modified_at: system_time_to_ms(metadata.modified().ok()),
    })
}

fn should_skip(name: &str) -> bool {
    matches!(
        name,
        ".git" | ".svn" | ".hg" | "node_modules" | "target" | "dist" | ".svelte-kit"
    )
}

fn is_markdown(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|value| value.to_str()).map(|value| value.to_lowercase()),
        Some(extension) if extension == "md" || extension == "markdown"
    )
}

fn decode_text(bytes: &[u8]) -> (String, String) {
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        if let Ok(content) = String::from_utf8(bytes[3..].to_vec()) {
            return (content, "UTF-8 BOM".into());
        }
    }

    if let Ok(content) = String::from_utf8(bytes.to_vec()) {
        return (content, "UTF-8".into());
    }

    let (content, _, had_errors) = GBK.decode(bytes);
    let encoding = if had_errors { "GBK/ANSI fallback" } else { "GBK" };
    (content.into_owned(), encoding.into())
}

fn modified_at(path: &Path) -> AppResult<u64> {
    let metadata = fs::metadata(path).map_err(to_error)?;
    Ok(system_time_to_ms(metadata.modified().ok()))
}

fn system_time_to_ms(time: Option<SystemTime>) -> u64 {
    time.and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

fn now_ms() -> u64 {
    system_time_to_ms(Some(SystemTime::now()))
}

fn drafts_dir(app: &AppHandle) -> AppResult<PathBuf> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("drafts"))
        .map_err(to_error)
}

fn draft_path(drafts_dir: &Path, source_path: &str) -> PathBuf {
    drafts_dir.join(format!("{}.json", stable_hash(source_path)))
}

fn stable_hash(value: &str) -> String {
    let mut hasher = DefaultHasher::new();
    value.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn normalize_path(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

fn to_error<E: std::fmt::Display>(error: E) -> String {
    error.to_string()
}
