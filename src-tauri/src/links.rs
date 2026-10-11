use crate::{
    documents::{blocking, canonical, display_path, Result},
    LinkValidationRequest, LinkValidationResult,
};
use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
};

type Cache = HashMap<String, ((u64, std::time::SystemTime), HashSet<String>)>;
static ANCHORS: OnceLock<Mutex<Cache>> = OnceLock::new();

#[tauri::command]
pub async fn open_local_path(path: String) -> Result<()> {
    blocking(move || {
        if path.chars().any(|char| char.is_control()) {
            return Err("Local paths cannot contain control characters.".into());
        }
        let path = PathBuf::from(path);
        if !path.is_absolute() {
            return Err("An absolute local path is required.".into());
        }
        let path = PathBuf::from(display_path(&canonical(&path)?));
        open_with_default_app(&path)
    })
    .await
}

#[cfg(target_os = "windows")]
fn open_with_default_app(path: &Path) -> Result<()> {
    use windows::{
        core::{w, HSTRING, PCWSTR},
        Win32::{
            Foundation::RPC_E_CHANGED_MODE,
            System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED},
            UI::{
                Shell::{
                    ShellExecuteExW, SEE_MASK_FLAG_NO_UI, SEE_MASK_NOASYNC, SHELLEXECUTEINFOW,
                },
                WindowsAndMessaging::SW_SHOWNORMAL,
            },
        },
    };

    let file = HSTRING::from(path.as_os_str());
    let directory = HSTRING::from(path.parent().unwrap_or(path).as_os_str());
    let mut info = SHELLEXECUTEINFOW {
        cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
        // Finish shell dispatch before releasing COM on this worker thread.
        fMask: SEE_MASK_NOASYNC | SEE_MASK_FLAG_NO_UI,
        lpVerb: w!("open"),
        lpFile: PCWSTR(file.as_ptr()),
        lpDirectory: PCWSTR(directory.as_ptr()),
        nShow: SW_SHOWNORMAL.0,
        ..Default::default()
    };
    let initialized = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
    if initialized.is_err() && initialized != RPC_E_CHANGED_MODE {
        return Err(initialized.to_string());
    }
    // Pass the path directly to the shell so spaces and command characters stay literal.
    let result = unsafe { ShellExecuteExW(&mut info) };
    if initialized.is_ok() {
        unsafe { CoUninitialize() };
    }
    result.map_err(|error| format!("{}: {error}", path.display()))
}

#[cfg(not(target_os = "windows"))]
fn open_with_default_app(path: &Path) -> Result<()> {
    #[cfg(target_os = "macos")]
    let mut command = std::process::Command::new("open");
    #[cfg(not(target_os = "macos"))]
    let mut command = std::process::Command::new("xdg-open");
    command
        .arg(path)
        .current_dir(path.parent().unwrap_or(path))
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("{}: {error}", path.display()))
}

#[tauri::command]
pub async fn validate_local_links(
    markdown_path: String,
    links: Vec<LinkValidationRequest>,
    anchors: Option<Vec<String>>,
) -> Result<Vec<LinkValidationResult>> {
    blocking(move || {
        let file = PathBuf::from(&markdown_path);
        let base = file.parent().unwrap_or(std::path::Path::new("."));
        let current: HashSet<_> = anchors.unwrap_or_default().into_iter().collect();
        let mut seen = HashSet::new();
        let mut results = Vec::new();
        for link in links {
            if !seen.insert((link.href.clone(), link.kind.clone())) {
                continue;
            }
            let href = link.href.trim().to_string();
            let kind = link.kind;
            if href.is_empty() || crate::is_external_href(&href) {
                results.push(crate::link_result(href, kind, true, None, None));
                continue;
            }
            if let Some(anchor) = href.strip_prefix('#') {
                let ok = current.contains(&crate::percent_decode_path(anchor));
                results.push(crate::link_result(
                    href,
                    kind,
                    ok,
                    None,
                    if ok {
                        None
                    } else {
                        Some("Heading anchor not found.".into())
                    },
                ));
                continue;
            }
            let (path, anchor) = crate::split_href_path_anchor(&href);
            let target = crate::resolve_link_path(base, path);
            let metadata = std::fs::metadata(&target);
            let mut ok = metadata.is_ok();
            if let (Ok(metadata), Some(anchor)) = (metadata, anchor) {
                if crate::is_markdown_path(&target) && metadata.len() <= 2 * 1024 * 1024 {
                    let signature = (
                        metadata.len(),
                        metadata.modified().unwrap_or(std::time::UNIX_EPOCH),
                    );
                    let key = crate::documents::display_path(&target);
                    let cache = ANCHORS.get_or_init(Mutex::default);
                    let cached = cache
                        .lock()
                        .unwrap()
                        .get(&key)
                        .filter(|(sig, _)| *sig == signature)
                        .map(|(_, anchors)| anchors.clone());
                    let anchors = cached.or_else(|| {
                        crate::documents::read_document(&target).ok().map(|file| {
                            let anchors = crate::heading_anchor_set(
                                &crate::extract_headings_from_content(&file.content),
                            );
                            let mut cache = cache.lock().unwrap();
                            if cache.len() >= 128 {
                                cache.clear();
                            }
                            cache.insert(key, (signature, anchors.clone()));
                            anchors
                        })
                    });
                    ok = anchors.is_some_and(|anchors| {
                        anchors.contains(&crate::percent_decode_path(anchor))
                    });
                }
            }
            results.push(crate::link_result(
                href,
                kind,
                ok,
                Some(crate::documents::display_path(&target)),
                if ok {
                    None
                } else {
                    Some("Local file or heading not found.".into())
                },
            ));
        }
        Ok(results)
    })
    .await
}

#[tauri::command]
pub async fn export_html(path: String, html: String) -> Result<()> {
    blocking(move || crate::export_html(path, html)).await
}

#[tauri::command]
pub async fn initial_open_paths() -> Result<Vec<String>> {
    blocking(|| Ok(crate::initial_open_paths())).await
}
