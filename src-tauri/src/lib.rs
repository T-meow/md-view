use serde::{Deserialize, Serialize};
use std::{
    collections::{hash_map::DefaultHasher, HashMap, HashSet},
    fs,
    hash::{Hash, Hasher},
    io::{Read, Write},
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

mod documents;
mod drafts;
#[cfg(test)]
mod io_metrics;
mod links;
#[cfg(windows)]
mod recycle;
mod workspace;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Serialize)]
struct Heading {
    level: usize,
    text: String,
    line: usize,
    anchor: String,
}

#[derive(Debug, Deserialize)]
struct LinkValidationRequest {
    href: String,
    kind: String,
}

#[derive(Debug, Serialize)]
struct LinkValidationResult {
    href: String,
    kind: String,
    ok: bool,
    target_path: Option<String>,
    message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct WorkspaceHeading {
    path: String,
    file_name: String,
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

fn initial_open_paths() -> Vec<String> {
    std::env::args_os()
        .skip(1)
        .map(PathBuf::from)
        .filter(|path| path.exists() && (path.is_dir() || is_supported_text_path(path)))
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
    reg_add_default(
        "HKCU\\Software\\Classes\\MdView.Markdown\\DefaultIcon",
        &icon,
    )?;
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
        reg_add_value(&format!("{application_key}\\SupportedTypes"), extension, "")?;
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
    let _ = run_reg([
        "delete",
        "HKCU\\Software\\Classes\\MarkdownReaderEditor.Markdown",
        "/f",
    ]);
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
    let output = hidden_command("reg.exe")
        .args(args)
        .output()
        .map_err(to_error)?;
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

fn export_html(path: String, html: String) -> AppResult<()> {
    let output = PathBuf::from(path);
    if let Some(parent) = output.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(to_error)?;
        }
    }
    let mut file = fs::File::create(output).map_err(to_error)?;
    file.write_all(html.as_bytes()).map_err(to_error)
}

fn extract_headings_from_content(content: &str) -> Vec<Heading> {
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

fn heading_anchor_set(headings: &[Heading]) -> HashSet<String> {
    let mut anchors = HashSet::new();
    let mut counts: HashMap<String, usize> = HashMap::new();
    for (index, heading) in headings.iter().enumerate() {
        let legacy = slug_heading(&heading.text, index);
        let base = legacy.strip_prefix("heading-").unwrap_or(&legacy);
        let count = counts.entry(base.into()).or_default();
        let slug = if *count == 0 {
            base.to_owned()
        } else {
            format!("{base}-{count}")
        };
        *count += 1;
        anchors.extend([heading.anchor.clone(), format!("heading-{slug}"), slug]);
    }
    anchors
}

fn link_result(
    href: String,
    kind: String,
    ok: bool,
    target_path: Option<String>,
    message: Option<String>,
) -> LinkValidationResult {
    LinkValidationResult {
        href,
        kind,
        ok,
        target_path,
        message,
    }
}

#[tauri::command]
fn open_external_url(url: String) -> AppResult<()> {
    if !is_allowed_external_url(&url) {
        return Err("Only http, https, mailto, and tel links can be opened externally.".into());
    }

    #[cfg(target_os = "windows")]
    {
        hidden_command("rundll32.exe")
            .args(["url.dll,FileProtocolHandler", &url])
            .spawn()
            .map(|_| ())
            .map_err(to_error)
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&url)
            .spawn()
            .map(|_| ())
            .map_err(to_error)
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map(|_| ())
            .map_err(to_error)
    }
}

fn is_external_href(href: &str) -> bool {
    let lower = href.to_lowercase();
    lower.starts_with("http:")
        || lower.starts_with("https:")
        || lower.starts_with("mailto:")
        || lower.starts_with("tel:")
        || lower.starts_with("data:")
        || lower.starts_with("blob:")
        || lower.starts_with("asset:")
}

fn is_allowed_external_url(url: &str) -> bool {
    if url.chars().any(|char| char.is_control()) {
        return false;
    }
    let lower = url.trim().to_lowercase();
    lower.starts_with("http://")
        || lower.starts_with("https://")
        || lower.starts_with("mailto:")
        || lower.starts_with("tel:")
}

fn split_href_path_anchor(href: &str) -> (&str, Option<&str>) {
    let clean = href.split('?').next().unwrap_or(href);
    let mut parts = clean.splitn(2, '#');
    let path = parts.next().unwrap_or(clean);
    (path, parts.next().filter(|anchor| !anchor.is_empty()))
}

fn resolve_link_path(base_dir: &Path, source: &str) -> PathBuf {
    let decoded = percent_decode_path(source);
    let path = PathBuf::from(decoded);
    if path.is_absolute() {
        path
    } else {
        base_dir.join(path)
    }
}

fn percent_decode_path(source: &str) -> String {
    let mut output = Vec::new();
    let bytes = source.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let Some(value) = (bytes[index + 1] as char)
                .to_digit(16)
                .zip((bytes[index + 2] as char).to_digit(16))
                .map(|(high, low)| (high * 16 + low) as u8)
            {
                output.push(value);
                index += 3;
                continue;
            }
        }
        output.push(bytes[index]);
        index += 1;
    }
    String::from_utf8(output).unwrap_or_else(|_| source.to_owned())
}

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
    drafts::write_atomic(&draft_path, &bytes)?;
    Ok(DraftSummary {
        path,
        updated_at: draft.updated_at,
        content_hash: draft.content_hash,
    })
}

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

fn delete_draft(app: AppHandle, path: String) -> AppResult<bool> {
    let drafts_dir = drafts_dir(&app)?;
    let draft_path = draft_path(&drafts_dir, &path);
    if draft_path.exists() {
        fs::remove_file(draft_path).map_err(to_error)?;
        return Ok(true);
    }
    Ok(false)
}

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
    drafts.sort_by_key(|draft| std::cmp::Reverse(draft.updated_at));
    Ok(drafts)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(workspace::WorkspaceState::default())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            documents::document_open,
            documents::document_save,
            documents::document_versions,
            documents::path_kind,
            documents::create_folder,
            documents::move_path,
            documents::trash_path,
            documents::reveal_path,
            workspace::directory_load,
            workspace::workspace_scan,
            workspace::scan_cancel,
            workspace::workspace_watch,
            drafts::write_draft,
            drafts::read_draft,
            drafts::delete_draft,
            drafts::list_drafts,
            drafts::move_draft,
            links::initial_open_paths,
            open_default_app_settings,
            open_external_url,
            links::open_local_path,
            links::validate_local_links,
            links::export_html
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn is_markdown_path(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|value| value.to_str()).map(|value| value.to_lowercase()),
        Some(extension) if extension == "md" || extension == "markdown"
    )
}

fn is_browsable_text_path(path: &Path) -> bool {
    if is_markdown_path(path) {
        return true;
    }

    matches!(
        path.extension().and_then(|value| value.to_str()).map(|value| value.to_lowercase()),
        Some(extension) if extension == "txt"
    )
}

fn is_supported_text_path(path: &Path) -> bool {
    if is_browsable_text_path(path) {
        return true;
    }

    match path.extension().and_then(|value| value.to_str()) {
        Some(_) => is_probably_text_file(path),
        None => path.exists() && is_probably_text_file(path),
    }
}

fn is_probably_text_file(path: &Path) -> bool {
    let Ok(mut file) = fs::File::open(path) else {
        return false;
    };
    let mut buffer = [0_u8; 8192];
    let Ok(read) = file.read(&mut buffer) else {
        return false;
    };
    !is_probably_binary_bytes(&buffer[..read])
}

fn is_probably_binary_bytes(bytes: &[u8]) -> bool {
    if bytes.is_empty() {
        return false;
    }

    let sample = &bytes[..bytes.len().min(8192)];
    if sample.contains(&0) {
        return true;
    }

    let control_count = sample
        .iter()
        .filter(|byte| matches!(**byte, 0x01..=0x08 | 0x0B | 0x0C | 0x0E..=0x1F))
        .count();

    control_count * 100 / sample.len() > 5
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

fn slug_heading(text: &str, index: usize) -> String {
    let mut slug = String::new();
    let mut previous_dash = false;
    for char in text.trim().to_lowercase().chars() {
        if char.is_alphanumeric() {
            slug.push(char);
            previous_dash = false;
        } else if (char.is_whitespace() || char == '-') && !previous_dash && !slug.is_empty() {
            slug.push('-');
            previous_dash = true;
        }
    }
    let slug = slug.trim_matches('-').to_string();
    if slug.is_empty() {
        format!("heading-{}", index + 1)
    } else {
        format!("heading-{slug}")
    }
}

fn to_error<E: std::fmt::Display>(error: E) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn supported_text_extensions_are_allowed() {
        for path in ["notes.txt", "README.md", "guide.markdown"] {
            assert!(is_supported_text_path(Path::new(path)), "{path}");
        }
    }

    #[test]
    fn browsable_text_extensions_are_explicitly_allowed() {
        for path in ["README.md", "guide.markdown", "notes.txt"] {
            assert!(is_browsable_text_path(Path::new(path)), "{path}");
        }
    }

    #[test]
    fn unknown_extensions_are_not_browsable_text() {
        for path in [
            "App.svelte",
            "script.ts",
            "settings.json",
            "Cargo.toml",
            ".env",
            ".gitignore",
            "preview.png",
        ] {
            assert!(!is_browsable_text_path(Path::new(path)), "{path}");
        }
    }

    #[test]
    fn binary_bytes_are_rejected() {
        assert!(is_probably_binary_bytes(&[0, 1, 2, 3, 4]));
        assert!(!is_probably_binary_bytes(b"plain text\nwith lines\n"));
    }
}
