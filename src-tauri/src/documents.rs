use encoding_rs::{GBK, UTF_16BE, UTF_16LE};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};
use tauri::{AppHandle, Manager};

pub type Result<T> = std::result::Result<T, String>;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DiskRevision {
    pub modified: String,
    pub size: u64,
    pub hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentFile {
    pub id: String,
    pub path: String,
    pub content: String,
    pub encoding: String,
    pub bom: bool,
    pub newline: String,
    pub revision: DiskRevision,
}

#[derive(Debug, Deserialize)]
pub struct SaveRequest {
    pub path: String,
    pub content: String,
    pub encoding: String,
    pub bom: bool,
    pub newline: String,
    pub expected: Option<DiskRevision>,
}

#[derive(Debug, Serialize)]
pub struct SaveReply {
    pub file: Option<DocumentFile>,
    pub code: Option<String>,
    pub message: Option<String>,
}

pub async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T> + Send + 'static,
) -> Result<T> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
}

pub fn canonical(path: &Path) -> Result<PathBuf> {
    fs::canonicalize(path).map_err(|e| format!("{}: {e}", path.display()))
}

pub fn display_path(path: &Path) -> String {
    let value = path.to_string_lossy();
    if let Some(unc) = value.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{unc}")
    } else {
        value.strip_prefix(r"\\?\").unwrap_or(&value).to_string()
    }
}

pub fn path_id(path: &Path) -> String {
    let value = display_path(path).replace('\\', "/");
    if cfg!(windows) {
        value.to_lowercase()
    } else {
        value
    }
}

pub fn version(path: &Path, bytes: &[u8]) -> Result<DiskRevision> {
    let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
    Ok(DiskRevision {
        modified: metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|t| t.as_nanos().to_string())
            .unwrap_or_default(),
        size: bytes.len() as u64,
        hash: blake3::hash(bytes).to_hex().to_string(),
    })
}

pub fn disk_version(path: &Path) -> Result<DiskRevision> {
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    version(path, &bytes)
}

pub fn read_document(path: &Path) -> Result<DocumentFile> {
    let path = canonical(path)?;
    // This operation deliberately never enumerates a directory or reads another document.
    #[cfg(test)]
    crate::io_metrics::read();
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    let revision = version(&path, &bytes)?;
    let (text, encoding, bom) = decode(&bytes)?;
    let newline = if text.contains("\r\n") {
        "crlf"
    } else if text.contains('\r') {
        "cr"
    } else {
        "lf"
    };
    Ok(DocumentFile {
        id: path_id(&path),
        path: display_path(&path),
        content: text.replace("\r\n", "\n").replace('\r', "\n"),
        encoding,
        bom,
        newline: newline.into(),
        revision,
    })
}

fn decode(bytes: &[u8]) -> Result<(String, String, bool)> {
    if bytes.starts_with(&[0xff, 0xfe]) || bytes.starts_with(&[0xfe, 0xff]) {
        let le = bytes[0] == 0xff;
        let (text, errors) =
            (if le { UTF_16LE } else { UTF_16BE }).decode_without_bom_handling(&bytes[2..]);
        if errors {
            return Err("UTF-16 文件包含无效编码，已停止读取以避免损坏内容".into());
        }
        return Ok((
            text.into_owned(),
            if le { "UTF-16LE" } else { "UTF-16BE" }.into(),
            true,
        ));
    }
    if super::is_probably_binary_bytes(bytes) {
        return Err("该文件似乎是二进制文件，无法作为文本打开".into());
    }
    let bom = bytes.starts_with(&[0xef, 0xbb, 0xbf]);
    let body = if bom { &bytes[3..] } else { bytes };
    if let Ok(text) = std::str::from_utf8(body) {
        return Ok((text.into(), "UTF-8".into(), bom));
    }
    let (text, _, errors) = GBK.decode(body);
    if errors {
        return Err("无法无损解码为 UTF-8 或 GBK，未修改文件".into());
    }
    Ok((text.into_owned(), "GBK".into(), false))
}

fn encode(request: &SaveRequest) -> Result<Vec<u8>> {
    let normalized = request.content.replace("\r\n", "\n").replace('\r', "\n");
    let text = match request.newline.as_str() {
        "crlf" => normalized.replace('\n', "\r\n"),
        "cr" => normalized.replace('\n', "\r"),
        _ => normalized,
    };
    match request.encoding.as_str() {
        "UTF-8" => {
            let mut bytes = if request.bom {
                vec![0xef, 0xbb, 0xbf]
            } else {
                Vec::new()
            };
            bytes.extend_from_slice(text.as_bytes());
            Ok(bytes)
        }
        "GBK" => {
            let (bytes, _, errors) = GBK.encode(&text);
            if errors {
                Err("当前内容包含 GBK 无法表示的字符，请选择转换为 UTF-8".into())
            } else {
                Ok(bytes.into_owned())
            }
        }
        "UTF-16LE" | "UTF-16BE" => {
            let le = request.encoding == "UTF-16LE";
            let mut bytes = if request.bom {
                if le {
                    vec![0xff, 0xfe]
                } else {
                    vec![0xfe, 0xff]
                }
            } else {
                Vec::new()
            };
            for value in text.encode_utf16() {
                bytes.extend_from_slice(&if le {
                    value.to_le_bytes()
                } else {
                    value.to_be_bytes()
                });
            }
            Ok(bytes)
        }
        _ => Err("不支持此保存编码，请选择 UTF-8".into()),
    }
}

fn conflict(message: &str) -> SaveReply {
    SaveReply {
        file: None,
        code: Some("conflict".into()),
        message: Some(message.into()),
    }
}

pub fn save_document(request: SaveRequest) -> Result<SaveReply> {
    let input = PathBuf::from(&request.path);
    let parent = canonical(input.parent().ok_or("文件缺少父目录")?)?;
    let path = parent.join(input.file_name().ok_or("文件名不能为空")?);
    // Do not replace links: the explicitly opened document already has a canonical path.
    if fs::symlink_metadata(&path).is_ok_and(|m| is_link(&m)) {
        return Err("请直接打开链接的目标文件后保存".into());
    }
    match &request.expected {
        Some(expected) if disk_version(&path).as_ref().ok() != Some(expected) => {
            return Ok(conflict("磁盘文件已改变或被删除，请重新载入或另存为"))
        }
        None if path.exists() => {
            return Ok(conflict("目标文件已存在，请选择其他名称或明确确认覆盖"))
        }
        _ => {}
    }
    let bytes = match encode(&request) {
        Ok(bytes) => bytes,
        Err(message) => {
            return Ok(SaveReply {
                file: None,
                code: Some("encoding".into()),
                message: Some(message),
            })
        }
    };
    let mut temp = tempfile::NamedTempFile::new_in(&parent).map_err(|e| e.to_string())?;
    temp.write_all(&bytes).map_err(|e| e.to_string())?;
    if let Ok(metadata) = fs::metadata(&path) {
        temp.as_file()
            .set_permissions(metadata.permissions())
            .map_err(|e| e.to_string())?;
    }
    temp.as_file().sync_all().map_err(|e| e.to_string())?;
    if let Some(expected) = &request.expected {
        if disk_version(&path).as_ref().ok() != Some(expected) {
            return Ok(conflict("写入前检测到文件发生变化，已保留原文件"));
        }
        temp.persist(&path).map_err(|e| e.error.to_string())?;
    } else {
        temp.persist_noclobber(&path)
            .map_err(|e| e.error.to_string())?;
    }
    let revision = version(&path, &bytes)?;
    Ok(SaveReply {
        file: Some(DocumentFile {
            id: path_id(&path),
            path: display_path(&path),
            content: request.content,
            encoding: request.encoding,
            bom: request.bom,
            newline: request.newline,
            revision,
        }),
        code: None,
        message: None,
    })
}

pub fn is_link(metadata: &fs::Metadata) -> bool {
    // On Windows Rust checks the name-surrogate tag, covering symlinks and
    // junctions without rejecting OneDrive/cloud-file reparse points.
    metadata.file_type().is_symlink()
}

#[tauri::command]
pub async fn document_open(app: AppHandle, path: String) -> Result<DocumentFile> {
    blocking(move || {
        let file = read_document(Path::new(&path))?;
        if let Some(parent) = Path::new(&file.path).parent() {
            app.asset_protocol_scope()
                .allow_directory(parent, true)
                .map_err(|e| e.to_string())?;
        }
        Ok(file)
    })
    .await
}

#[tauri::command]
pub async fn document_save(request: SaveRequest) -> Result<SaveReply> {
    blocking(move || save_document(request)).await
}

#[tauri::command]
pub async fn document_versions(paths: Vec<String>) -> Result<Vec<(String, Option<DiskRevision>)>> {
    blocking(move || {
        Ok(paths
            .into_iter()
            .map(|p| {
                let rev = disk_version(Path::new(&p)).ok();
                (p, rev)
            })
            .collect())
    })
    .await
}

#[tauri::command]
pub async fn path_kind(path: String) -> Result<String> {
    blocking(move || {
        let m = fs::metadata(&path).map_err(|e| e.to_string())?;
        Ok(if m.is_dir() { "directory" } else { "file" }.into())
    })
    .await
}

#[tauri::command]
pub async fn create_folder(path: String) -> Result<String> {
    blocking(move || {
        fs::create_dir(&path).map_err(|e| e.to_string())?;
        Ok(display_path(&canonical(Path::new(&path))?))
    })
    .await
}

#[tauri::command]
pub async fn move_path(path: String, target: String) -> Result<String> {
    blocking(move || {
        let from = PathBuf::from(path);
        if fs::symlink_metadata(&from)
            .map_err(|e| e.to_string())
            .map(|m| is_link(&m))?
        {
            return Err("暂不移动符号链接或目录联接".into());
        }
        let to = PathBuf::from(target);
        if to.exists() {
            return Err("目标名称已存在，请选择其他名称".into());
        }
        rename_no_replace(&from, &to).map_err(|e| {
            if e.kind() == std::io::ErrorKind::CrossesDevices {
                "不能跨磁盘移动，请使用另存为".into()
            } else {
                e.to_string()
            }
        })?;
        Ok(display_path(&canonical(&to)?))
    })
    .await
}

fn rename_no_replace(from: &Path, to: &Path) -> std::io::Result<()> {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        let from: Vec<u16> = from.as_os_str().encode_wide().chain(Some(0)).collect();
        let to: Vec<u16> = to.as_os_str().encode_wide().chain(Some(0)).collect();
        if unsafe {
            windows_sys::Win32::Storage::FileSystem::MoveFileExW(from.as_ptr(), to.as_ptr(), 0)
        } == 0
        {
            Err(std::io::Error::last_os_error())
        } else {
            Ok(())
        }
    }
    #[cfg(unix)]
    {
        use std::{ffi::CString, os::unix::ffi::OsStrExt};
        let from = CString::new(from.as_os_str().as_bytes())?;
        let to = CString::new(to.as_os_str().as_bytes())?;
        #[cfg(target_os = "macos")]
        let result = unsafe { libc::renamex_np(from.as_ptr(), to.as_ptr(), libc::RENAME_EXCL) };
        #[cfg(target_os = "linux")]
        let result = unsafe {
            libc::renameat2(
                libc::AT_FDCWD,
                from.as_ptr(),
                libc::AT_FDCWD,
                to.as_ptr(),
                libc::RENAME_NOREPLACE,
            )
        };
        #[cfg(not(any(target_os = "macos", target_os = "linux")))]
        let result = -1;
        if result == 0 {
            Ok(())
        } else {
            Err(std::io::Error::last_os_error())
        }
    }
}

#[tauri::command]
pub async fn trash_path(path: String) -> Result<()> {
    blocking(move || {
        #[cfg(windows)]
        let result = crate::recycle::recycle(Path::new(&path));
        #[cfg(not(windows))]
        let result = trash::delete(path).map_err(|e| e.to_string());
        result.map_err(|e| format!("移入回收站失败，未永久删除：{e}"))
    })
    .await
}

#[tauri::command]
pub async fn reveal_path(path: String) -> Result<()> {
    blocking(move || {
        #[cfg(windows)]
        let result = super::hidden_command("explorer.exe")
            .arg(format!("/select,{path}"))
            .spawn();
        #[cfg(target_os = "macos")]
        let result = std::process::Command::new("open")
            .args(["-R", &path])
            .spawn();
        #[cfg(not(any(windows, target_os = "macos")))]
        let result = std::process::Command::new("xdg-open")
            .arg(Path::new(&path).parent().unwrap_or(Path::new(&path)))
            .spawn();
        result.map(|_| ()).map_err(|e| e.to_string())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    fn request(file: &DocumentFile, content: &str) -> SaveRequest {
        SaveRequest {
            path: file.path.clone(),
            content: content.into(),
            encoding: file.encoding.clone(),
            bom: file.bom,
            newline: file.newline.clone(),
            expected: Some(file.revision.clone()),
        }
    }
    #[test]
    fn preserves_bom_crlf_and_rejects_external_changes() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a.md");
        fs::write(&path, b"\xef\xbb\xbf# A\r\ntext\r\n").unwrap();
        let file = read_document(&path).unwrap();
        assert_eq!(file.content, "# A\ntext\n");
        let saved = save_document(request(&file, "# B\ntext\n"))
            .unwrap()
            .file
            .unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"\xef\xbb\xbf# B\r\ntext\r\n");
        fs::write(&path, "external").unwrap();
        assert_eq!(
            save_document(request(&saved, "local"))
                .unwrap()
                .code
                .as_deref(),
            Some("conflict")
        );
        assert_eq!(fs::read_to_string(path).unwrap(), "external");
    }
    #[test]
    fn gbk_save_cannot_silently_replace_characters() {
        let request = SaveRequest {
            path: String::new(),
            content: "你好🙂".into(),
            encoding: "GBK".into(),
            bom: false,
            newline: "lf".into(),
            expected: None,
        };
        assert!(encode(&request).is_err());
    }
    #[test]
    fn rename_never_overwrites_destination() {
        let dir = tempfile::tempdir().unwrap();
        let from = dir.path().join("a.md");
        let to = dir.path().join("b.md");
        fs::write(&from, "a").unwrap();
        fs::write(&to, "b").unwrap();
        assert!(rename_no_replace(&from, &to).is_err());
        assert_eq!(fs::read_to_string(to).unwrap(), "b");
    }
    #[test]
    fn new_file_does_not_overwrite_existing_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a.md");
        fs::write(&path, "keep").unwrap();
        let mut request = request(&read_document(&path).unwrap(), "replace");
        request.expected = None;
        assert_eq!(
            save_document(request).unwrap().code.as_deref(),
            Some("conflict")
        );
        assert_eq!(fs::read_to_string(path).unwrap(), "keep");
    }
    #[test]
    fn utf16_roundtrip_preserves_encoding_and_line_endings() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a.md");
        let request = SaveRequest {
            path: path.to_string_lossy().into(),
            content: "# 中文\n你好".into(),
            encoding: "UTF-16LE".into(),
            bom: true,
            newline: "crlf".into(),
            expected: None,
        };
        assert!(save_document(request).unwrap().file.is_some());
        let result = read_document(&path).unwrap();
        assert_eq!(result.encoding, "UTF-16LE");
        assert_eq!(result.content, "# 中文\n你好");
        assert_eq!(result.newline, "crlf");
    }
    #[test]
    #[ignore = "Creates 100,000 files in a project-owned fixture; run explicitly for performance acceptance"]
    fn large_project_open_has_zero_directory_visits() {
        use std::time::Instant;
        let project = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
        let fixtures = project.join(".local/fixtures");
        fs::create_dir_all(&fixtures).unwrap();
        let fixture = tempfile::Builder::new()
            .prefix("open-performance-")
            .tempdir_in(&fixtures)
            .unwrap();
        assert!(canonical(fixture.path())
            .unwrap()
            .starts_with(canonical(&fixtures).unwrap()));
        let small = fixture.path().join("small");
        let large = fixture.path().join("large");
        fs::create_dir(&small).unwrap();
        fs::create_dir(&large).unwrap();
        let text = format!(
            "# Benchmark\n{}",
            "Markdown text for reading.\n".repeat(4096)
        );
        for root in [&small, &large] {
            fs::write(root.join("README.md"), &text).unwrap();
        }
        for directory in 0..100 {
            let path = large.join(format!("assets-{directory}"));
            fs::create_dir(&path).unwrap();
            for file in 0..1000 {
                fs::File::create(path.join(format!("unrelated-{file}.bin"))).unwrap();
            }
        }
        let mut small_times = Vec::new();
        let mut large_times = Vec::new();
        crate::io_metrics::reset();
        for _ in 0..30 {
            let start = Instant::now();
            let result = read_document(&small.join("README.md")).unwrap();
            small_times.push(start.elapsed().as_micros() as u64);
            assert_eq!(result.content, text);
            let start = Instant::now();
            let result = read_document(&large.join("README.md")).unwrap();
            large_times.push(start.elapsed().as_micros() as u64);
            assert_eq!(result.content, text);
        }
        let (reads, entries) = crate::io_metrics::snapshot();
        assert_eq!((reads, entries), (60, 0));
        small_times.sort_unstable();
        large_times.sort_unstable();
        let report = serde_json::json!({ "unrelated_files": 100000, "document_bytes": text.len(), "samples_per_folder": 30, "document_reads": reads, "directory_entries": entries, "unrelated_document_reads": 0, "small_p50_us": small_times[15], "small_p95_us": small_times[28], "large_p50_us": large_times[15], "large_p95_us": large_times[28], "scope": "backend read/decode; UI first paint requires manual acceptance" });
        fs::write(
            project.join(".local/open-performance.json"),
            serde_json::to_vec_pretty(&report).unwrap(),
        )
        .unwrap();
        println!("{report}");
    }
}
