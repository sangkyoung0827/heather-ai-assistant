use serde::Serialize;
use std::{
    collections::HashMap,
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State, WindowEvent,
};
use tauri_plugin_global_shortcut::{
    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
};
use walkdir::WalkDir;

const MAX_TEXT_FILE_BYTES: u64 = 1_000_000;
const MAX_SEARCH_RESULTS: usize = 200;
const MAX_WALK_ENTRIES: usize = 5_000;
const SAFE_TEXT_EXTENSIONS: &[&str] = &["txt", "md", "csv", "json", "log"];
const SAFE_SEARCH_EXTENSIONS: &[&str] = &[
    "pdf", "docx", "txt", "md", "csv", "json", "png", "jpg", "jpeg",
];
const APP_ALLOWLIST: &[(&str, &str)] = &[
    ("Chrome", "Google Chrome"),
    ("Safari", "Safari"),
    ("Finder", "Finder"),
    ("VS Code", "Visual Studio Code"),
    ("Terminal", "Terminal"),
];

#[derive(Default)]
struct DesktopState {
    allowed_dirs: Mutex<HashMap<String, PathBuf>>,
    file_registry: Mutex<HashMap<String, PathBuf>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SystemInfo {
    os_name: String,
    app_version: String,
    home_label: String,
    cpu_summary: String,
    memory_summary: String,
}

#[derive(Serialize)]
struct AllowedDirectory {
    id: String,
    label: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FileEntry {
    id: Option<String>,
    name: String,
    relative_path: String,
    extension: String,
    #[serde(rename = "type")]
    item_type: String,
    size: Option<u64>,
    updated_at: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TextFileReadResult {
    file_id: String,
    name: String,
    content: String,
    truncated: bool,
}

#[derive(Serialize)]
struct ClipboardText {
    text: String,
}

#[tauri::command]
fn get_system_info(app: AppHandle) -> SystemInfo {
    SystemInfo {
        os_name: std::env::consts::OS.to_string(),
        app_version: app.package_info().version.to_string(),
        home_label: "Home folder".to_string(),
        cpu_summary: format!("{} logical CPU(s)", available_parallelism()),
        memory_summary: "Memory total is not exposed in Heather desktop v1".to_string(),
    }
}

#[tauri::command]
fn choose_directory(state: State<DesktopState>) -> Result<Option<AllowedDirectory>, String> {
    let Some(path) = rfd::FileDialog::new().pick_folder() else {
        return Ok(None);
    };

    let canonical = canonicalize_existing_dir(&path)?;
    let id = make_id("dir");
    let label = canonical
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("Selected folder")
        .to_string();

    state
        .allowed_dirs
        .lock()
        .map_err(|_| "Directory registry lock failed.".to_string())?
        .insert(id.clone(), canonical);

    Ok(Some(AllowedDirectory { id, label }))
}

#[tauri::command]
fn list_directory(folder_id: String, state: State<DesktopState>) -> Result<Vec<FileEntry>, String> {
    let root = resolve_allowed_dir(&folder_id, &state)?;
    let mut entries = Vec::new();

    for entry in fs::read_dir(&root).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if is_hidden(&path) {
            continue;
        }
        entries.push(file_entry_for_path(&root, &path, &state)?);
    }

    Ok(entries)
}

#[tauri::command]
fn search_files(
    folder_id: String,
    query: Option<String>,
    extensions: Option<Vec<String>>,
    state: State<DesktopState>,
) -> Result<Vec<FileEntry>, String> {
    let root = resolve_allowed_dir(&folder_id, &state)?;
    let query = query.unwrap_or_default().to_lowercase();
    let extensions = normalize_extensions(extensions.unwrap_or_else(|| {
        SAFE_SEARCH_EXTENSIONS
            .iter()
            .map(|extension| extension.to_string())
            .collect()
    }));
    let mut results = Vec::new();

    for entry in WalkDir::new(&root)
        .follow_links(false)
        .max_depth(8)
        .into_iter()
        .filter_map(Result::ok)
        .take(MAX_WALK_ENTRIES)
    {
        let path = entry.path();
        if path == root || is_hidden(path) || !path.is_file() {
            continue;
        }

        let extension = extension_for(path);
        if !extensions.iter().any(|candidate| candidate == &extension) {
            continue;
        }

        let name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_lowercase();
        if !query.is_empty() && !name.contains(&query) {
            continue;
        }

        results.push(file_entry_for_path(&root, path, &state)?);
        if results.len() >= MAX_SEARCH_RESULTS {
            break;
        }
    }

    Ok(results)
}

#[tauri::command]
fn read_text_file(file_id: String, state: State<DesktopState>) -> Result<TextFileReadResult, String> {
    let path = {
        let registry = state
            .file_registry
            .lock()
            .map_err(|_| "File registry lock failed.".to_string())?;
        registry
            .get(&file_id)
            .cloned()
            .ok_or_else(|| "This file was not selected from an allowed folder.".to_string())?
    };

    if !path.is_file() {
        return Err("Selected item is not a file.".to_string());
    }

    let extension = extension_for(&path);
    if !SAFE_TEXT_EXTENSIONS
        .iter()
        .any(|candidate| candidate == &extension)
    {
        return Err("Only safe text files can be read in Heather desktop v1.".to_string());
    }

    let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
    if metadata.len() > MAX_TEXT_FILE_BYTES {
        return Err("File is too large for Heather desktop v1.".to_string());
    }

    let content = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("text file")
        .to_string();

    Ok(TextFileReadResult {
        file_id,
        name,
        content,
        truncated: false,
    })
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    let lower = url.to_lowercase();
    if !(lower.starts_with("http://") || lower.starts_with("https://")) {
        return Err("Only http/https URLs are allowed.".to_string());
    }

    if lower.starts_with("file://")
        || lower.starts_with("javascript:")
        || lower.starts_with("data:")
    {
        return Err("Unsafe URL scheme is blocked.".to_string());
    }

    open_url_with_system(&url)
}

#[tauri::command]
fn open_app(app_name: String) -> Result<(), String> {
    let Some((label, system_name)) = APP_ALLOWLIST
        .iter()
        .find(|(label, _)| label.eq_ignore_ascii_case(&app_name))
    else {
        return Err("This app is not in Heather's allowlist.".to_string());
    };

    open_allowlisted_app(label, system_name)
}

#[tauri::command]
fn get_clipboard_text() -> Result<ClipboardText, String> {
    let text = read_clipboard_text()?;
    Ok(ClipboardText {
        text: mask_sensitive(&text),
    })
}

#[tauri::command]
fn set_clipboard_text(text: String) -> Result<(), String> {
    write_clipboard_text(&text)
}

pub fn run() {
    tauri::Builder::default()
        .manage(DesktopState::default())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    let mac_shortcut =
                        Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyH);
                    let other_shortcut =
                        Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyH);
                    if event.state == ShortcutState::Pressed
                        && (*shortcut == mac_shortcut || *shortcut == other_shortcut)
                    {
                        show_main_window(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            setup_tray(app.handle())?;
            register_global_shortcuts(app.handle())?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_system_info,
            choose_directory,
            list_directory,
            search_files,
            read_text_file,
            open_external_url,
            open_app,
            get_clipboard_text,
            set_clipboard_text
        ])
        .run(tauri::generate_context!())
        .expect("error while running Heather AI Assistant");
}

fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Heather", true, None::<&str>)?;
    let quick = MenuItem::with_id(app, "quick_ask", "Quick Ask / Focus Heather", true, None::<&str>)?;
    let local_control = MenuItem::with_id(app, "local_control", "Local Control", true, None::<&str>)?;
    let voice_settings = MenuItem::with_id(app, "voice_settings", "Voice Settings", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Heather", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quick, &local_control, &voice_settings, &quit])?;

    let mut tray_builder = TrayIconBuilder::new()
        .tooltip("Heather AI Assistant")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" | "quick_ask" => show_main_window(app),
            "local_control" => {
                show_main_window(app);
                let _ = app.emit("heather://open-view", "local_control");
            }
            "voice_settings" => {
                show_main_window(app);
                let _ = app.emit("heather://open-view", "settings");
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        tray_builder = tray_builder.icon(icon.clone());
    }

    tray_builder.build(app)?;
    Ok(())
}

fn register_global_shortcuts(app: &AppHandle) -> tauri::Result<()> {
    let mac_shortcut = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyH);
    let other_shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyH);
    let shortcuts = app.global_shortcut();

    if let Err(error) = shortcuts.register(mac_shortcut) {
        eprintln!("Heather shortcut Command+Shift+H registration failed: {error}");
    }

    if let Err(error) = shortcuts.register(other_shortcut) {
        eprintln!("Heather shortcut Ctrl+Shift+H registration failed: {error}");
    }

    Ok(())
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn resolve_allowed_dir(folder_id: &str, state: &State<DesktopState>) -> Result<PathBuf, String> {
    state
        .allowed_dirs
        .lock()
        .map_err(|_| "Directory registry lock failed.".to_string())?
        .get(folder_id)
        .cloned()
        .ok_or_else(|| "Choose a folder first. Arbitrary paths are not accepted.".to_string())
}

fn canonicalize_existing_dir(path: &Path) -> Result<PathBuf, String> {
    let canonical = fs::canonicalize(path).map_err(|error| error.to_string())?;
    if !canonical.is_dir() {
        return Err("Selected path is not a directory.".to_string());
    }
    Ok(canonical)
}

fn file_entry_for_path(
    root: &Path,
    path: &Path,
    state: &State<DesktopState>,
) -> Result<FileEntry, String> {
    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    let is_file = metadata.is_file();
    let id = if is_file {
        let id = make_id("file");
        state
            .file_registry
            .lock()
            .map_err(|_| "File registry lock failed.".to_string())?
            .insert(id.clone(), path.to_path_buf());
        Some(id)
    } else {
        None
    };

    Ok(FileEntry {
        id,
        name: path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_string(),
        relative_path: path
            .strip_prefix(root)
            .unwrap_or(path)
            .to_string_lossy()
            .to_string(),
        extension: extension_for(path),
        item_type: if metadata.is_dir() {
            "directory".to_string()
        } else {
            "file".to_string()
        },
        size: if is_file { Some(metadata.len()) } else { None },
        updated_at: metadata.modified().ok().map(system_time_to_label),
    })
}

fn is_hidden(path: &Path) -> bool {
    path.file_name()
        .and_then(|value| value.to_str())
        .map(|name| name.starts_with('.'))
        .unwrap_or(false)
}

fn extension_for(path: &Path) -> String {
    path.extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_lowercase()
}

fn normalize_extensions(extensions: Vec<String>) -> Vec<String> {
    extensions
        .into_iter()
        .map(|extension| extension.trim().trim_start_matches('.').to_lowercase())
        .filter(|extension| {
            SAFE_SEARCH_EXTENSIONS
                .iter()
                .any(|candidate| candidate == extension)
        })
        .collect()
}

fn system_time_to_label(time: SystemTime) -> String {
    let seconds = time
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    seconds.to_string()
}

fn make_id(prefix: &str) -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    format!("{prefix}_{millis}")
}

fn available_parallelism() -> usize {
    std::thread::available_parallelism()
        .map(|value| value.get())
        .unwrap_or(1)
}

fn open_url_with_system(url: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", url])
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(());
    }
}

fn open_allowlisted_app(_label: &str, system_name: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-a", system_name])
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        let executable = match system_name {
            "Google Chrome" => "chrome",
            "Safari" => "safari",
            "Finder" => "explorer",
            "Visual Studio Code" => "code",
            "Terminal" => "wt",
            _ => return Err("Unsupported allowlisted app on Windows.".to_string()),
        };
        Command::new(executable)
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let (executable, arg) = match system_name {
            "Google Chrome" => ("google-chrome", None),
            "Safari" => return Err("Safari is not available on this platform.".to_string()),
            "Finder" => ("xdg-open", Some(".")),
            "Visual Studio Code" => ("code", None),
            "Terminal" => ("x-terminal-emulator", None),
            _ => return Err("Unsupported allowlisted app on Linux.".to_string()),
        };
        let mut command = Command::new(executable);
        if let Some(arg) = arg {
            command.arg(arg);
        }
        command.spawn().map_err(|error| error.to_string())?;
        return Ok(());
    }
}

fn read_clipboard_text() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("pbpaste")
            .output()
            .map_err(|error| error.to_string())?;
        return Ok(String::from_utf8_lossy(&output.stdout).to_string());
    }

    #[cfg(target_os = "windows")]
    {
        let output = Command::new("powershell")
            .args(["-NoProfile", "-Command", "Get-Clipboard"])
            .output()
            .map_err(|error| error.to_string())?;
        return Ok(String::from_utf8_lossy(&output.stdout).to_string());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let output = Command::new("xclip")
            .args(["-selection", "clipboard", "-out"])
            .output()
            .map_err(|error| error.to_string())?;
        return Ok(String::from_utf8_lossy(&output.stdout).to_string());
    }
}

fn write_clipboard_text(text: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let mut child = Command::new("pbcopy")
            .stdin(Stdio::piped())
            .spawn()
            .map_err(|error| error.to_string())?;
        child
            .stdin
            .as_mut()
            .ok_or_else(|| "Clipboard stdin is unavailable.".to_string())?
            .write_all(text.as_bytes())
            .map_err(|error| error.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        let mut child = Command::new("clip")
            .stdin(Stdio::piped())
            .spawn()
            .map_err(|error| error.to_string())?;
        child
            .stdin
            .as_mut()
            .ok_or_else(|| "Clipboard stdin is unavailable.".to_string())?
            .write_all(text.as_bytes())
            .map_err(|error| error.to_string())?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let mut child = Command::new("xclip")
            .args(["-selection", "clipboard"])
            .stdin(Stdio::piped())
            .spawn()
            .map_err(|error| error.to_string())?;
        child
            .stdin
            .as_mut()
            .ok_or_else(|| "Clipboard stdin is unavailable.".to_string())?
            .write_all(text.as_bytes())
            .map_err(|error| error.to_string())?;
        return Ok(());
    }
}

fn mask_sensitive(text: &str) -> String {
    let lower = text.to_lowercase();
    let looks_secret = lower.contains("password")
        || lower.contains("token")
        || lower.contains("secret")
        || text.contains("sk-")
        || (text.starts_with("eyJ") && text.matches('.').count() >= 2);

    if looks_secret {
        "[masked sensitive clipboard text]".to_string()
    } else {
        text.chars().take(4_000).collect()
    }
}
