use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs,
    io::{Read, Write},
    net::TcpStream,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder, WindowEvent,
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
    ("Safari", "Safari"),
    ("Google Chrome", "Google Chrome"),
    ("Chrome", "Google Chrome"),
    ("Finder", "Finder"),
    ("Cursor", "Cursor"),
    ("VS Code", "Visual Studio Code"),
    ("Notes", "Notes"),
    ("Calendar", "Calendar"),
    ("Music", "Music"),
    ("Zoom", "zoom.us"),
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OllamaStatus {
    available: bool,
    base_url: String,
    configured_model: String,
    model: String,
    models: Vec<String>,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ChatRisk {
    level: String,
    requires_confirmation: bool,
    reason: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopChatResponse {
    message: String,
    title: String,
    risk: ChatRisk,
    provider: String,
    model: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MediaActionResult {
    service: String,
    query: String,
    url: String,
    attempted_autoplay: bool,
    message: String,
}

#[derive(Deserialize)]
struct OllamaTagsResponse {
    models: Option<Vec<OllamaModelEntry>>,
}

#[derive(Deserialize)]
struct OllamaModelEntry {
    name: Option<String>,
    model: Option<String>,
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
fn play_youtube_music(query: String) -> Result<MediaActionResult, String> {
    let trimmed_query = query.trim();
    if trimmed_query.is_empty() {
        return Err("YouTube Music에서 재생할 검색어가 필요합니다.".to_string());
    }

    let url = format!(
        "https://music.youtube.com/search?q={}",
        encode_url_component(trimmed_query)
    );
    let attempted_autoplay = try_youtube_music_autoplay(&url).unwrap_or_else(|_| {
        let _ = open_url_with_system(&url);
        false
    });

    Ok(MediaActionResult {
        service: "youtube_music".to_string(),
        query: trimmed_query.to_string(),
        url,
        attempted_autoplay,
        message: if attempted_autoplay {
            format!("YouTube Music에서 \"{trimmed_query}\" 재생을 시도했습니다.")
        } else {
            format!("YouTube Music에서 \"{trimmed_query}\" 검색 페이지를 열었습니다. 브라우저 자동 재생 권한이 필요하면 첫 결과를 직접 눌러주세요.")
        },
    })
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

#[tauri::command]
fn ollama_status(base_url: String, model: String) -> Result<OllamaStatus, String> {
    let models = list_ollama_models(&base_url)?;
    let selected_model = resolve_ollama_model(&models, &model);
    let available = selected_model.is_some();
    let resolved_model = selected_model.unwrap_or_default();
    let message = if available {
        format!("Ollama 연결 가능: {resolved_model} 모델을 사용합니다.")
    } else if models.is_empty() {
        format!(
            "Ollama에 설치된 모델이 없습니다. 먼저 `ollama pull {}` 실행 후 다시 시도하세요.",
            model.replace(":latest", "")
        )
    } else {
        format!("{model} 모델을 찾지 못했습니다. 설치 모델을 확인하세요.")
    };

    Ok(OllamaStatus {
        available,
        base_url,
        configured_model: model,
        model: resolved_model,
        models,
        message,
    })
}

#[tauri::command]
fn ollama_chat(payload: Value) -> Result<DesktopChatResponse, String> {
    let message = value_string(&payload, &["message"]).unwrap_or_default();
    if message.trim().is_empty() {
        return Err("Message is required.".to_string());
    }

    let settings = payload.get("settings").unwrap_or(&Value::Null);
    let base_url = value_string(settings, &["ollamaBaseUrl"])
        .or_else(|| value_string(settings, &["ollama_base_url"]))
        .unwrap_or_else(|| "http://localhost:11434".to_string());
    let configured_model = value_string(settings, &["ollamaModel"])
        .or_else(|| value_string(settings, &["ollama_model"]))
        .unwrap_or_else(|| "gemma4:latest".to_string());
    let model = configured_model;

    if asks_current_provider_or_model(&message) {
        return Ok(DesktopChatResponse {
            message: format!("현재 사용 중인 모델은 {model}입니다. provider는 ollama입니다."),
            title: conversation_title(&message),
            risk: classify_chat_risk(&message),
            provider: "ollama".to_string(),
            model,
        });
    }

    let response = send_ollama_chat(&base_url, &model, build_ollama_messages(&payload, &message, &model)?)?;

    Ok(DesktopChatResponse {
        message: response
            .get("message")
            .and_then(|value| value.get("content"))
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|content| !content.is_empty())
            .ok_or_else(|| "Ollama returned an empty message.".to_string())?
            .to_string(),
        title: conversation_title(&message),
        risk: classify_chat_risk(&message),
        provider: "ollama".to_string(),
        model: response
            .get("model")
            .and_then(Value::as_str)
            .unwrap_or(&model)
            .to_string(),
    })
}

#[tauri::command]
fn show_heather(app: AppHandle) {
    show_main_window(&app);
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
            setup_floating_launcher(app.handle())?;
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
            play_youtube_music,
            get_clipboard_text,
            set_clipboard_text,
            ollama_status,
            ollama_chat,
            show_heather
        ])
        .run(tauri::generate_context!())
        .expect("error while running Heather AI Assistant");
}

fn setup_floating_launcher(app: &AppHandle) -> tauri::Result<()> {
    WebviewWindowBuilder::new(app, "floating", WebviewUrl::App("floating".into()))
        .title("Heather")
        .inner_size(92.0, 92.0)
        .min_inner_size(76.0, 76.0)
        .position(24.0, 128.0)
        .decorations(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .transparent(true)
        .build()?;
    Ok(())
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

fn list_ollama_models(base_url: &str) -> Result<Vec<String>, String> {
    let (_, body) = http_request(base_url, "GET", "/api/tags", None)?;
    let data: OllamaTagsResponse = serde_json::from_str(&body)
        .map_err(|_| "Ollama 모델 목록 응답을 읽지 못했습니다.".to_string())?;

    Ok(data
        .models
        .unwrap_or_default()
        .into_iter()
        .filter_map(|entry| entry.name.or(entry.model))
        .filter(|name| !name.trim().is_empty())
        .collect())
}

fn resolve_ollama_model(models: &[String], requested_model: &str) -> Option<String> {
    if let Some(exact) = models.iter().find(|model| model.as_str() == requested_model) {
        return Some(exact.clone());
    }

    let requested_base = requested_model.strip_suffix(":latest").unwrap_or(requested_model);
    models
        .iter()
        .find(|model| model.strip_suffix(":latest").unwrap_or(model) == requested_base)
        .cloned()
}

fn send_ollama_chat(base_url: &str, model: &str, messages: Vec<Value>) -> Result<Value, String> {
    let request_body = json!({
        "model": model,
        "stream": false,
        "think": false,
        "messages": messages,
        "options": {
            "temperature": 0.6,
            "num_predict": 900
        }
    })
    .to_string();
    let (_, body) = http_request(base_url, "POST", "/api/chat", Some(&request_body))?;
    serde_json::from_str(&body).map_err(|_| "Ollama 채팅 응답을 읽지 못했습니다.".to_string())
}

fn build_ollama_messages(payload: &Value, message: &str, model: &str) -> Result<Vec<Value>, String> {
    let settings = payload.get("settings").unwrap_or(&Value::Null);
    let tone = value_string(settings, &["tone"]).unwrap_or_else(|| "analytical".to_string());
    let tone_instruction = match tone.as_str() {
        "soft" => "말투는 부드럽고 안심시키되, 결론은 흐리지 않는다.",
        "direct" => "말투는 직설적이고 짧게, 핵심 판단과 다음 행동을 먼저 말한다.",
        _ => "말투는 분석적이고 논리적으로, 근거와 비교 기준을 분명히 제시한다.",
    };
    let default_language =
        value_string(settings, &["defaultLanguage"]).unwrap_or_else(|| "en".to_string());
    let language_instruction = match default_language.as_str() {
        "ko" => "기본 응답 언어는 한국어다. 사용자가 영어로 말하면 자연스럽게 영어로 답할 수 있다.",
        "auto" => "사용자가 쓴 언어를 따라 답한다. 한국어와 영어를 모두 자연스럽게 사용할 수 있다.",
        _ => "Default response language is English. If the user writes in Korean or explicitly asks for Korean, answer naturally in Korean. You can use both Korean and English fluently.",
    };

    let system_prompt = [
        "너는 Heather / 헤더, 사용자의 개인 AI 비서다.".to_string(),
        "너는 단순 챗봇이 아니라 프로젝트, 일정, 관계 분석, 문서 작성, 음성 대화, 장기 기억을 돕는다.".to_string(),
        tone_instruction.to_string(),
        language_instruction.to_string(),
        "파일 삭제, 외부 게시, 결제, 이메일 발송, 로컬 앱 실행 같은 위험 작업은 반드시 사용자 확인이 필요하다고 말한다.".to_string(),
        format!("현재 실행 환경: provider=ollama, model={model}. 사용자가 현재 모델명이나 provider를 물으면 이 값을 직접 답한다."),
        "하드 응답 규칙: 사용자가 현재 모델, provider, backend, API 상태, 로컬 모델, 런타임 상태를 물으면 provider와 model 값을 직접 짧게 답한다.".to_string(),
        "단순 사실 질문은 1-3문장으로 답한다. 분석 질문일 때만 구조화된 상세 답변을 사용한다.".to_string(),
        "사용자가 명시적으로 요청하지 않는 한 심리 분석, 감정 추정, 투명성 논의로 확장하지 않는다.".to_string(),
    ]
    .join("\n");

    let mut messages = vec![
        json!({
            "role": "system",
            "content": system_prompt
        }),
        json!({
            "role": "system",
            "content": compact_desktop_context(payload)
        }),
    ];

    if let Some(history) = payload
        .get("conversation")
        .and_then(|conversation| conversation.get("messages"))
        .and_then(Value::as_array)
    {
        for item in history.iter().rev().take(4).collect::<Vec<_>>().into_iter().rev() {
            let role = value_string(item, &["role"]).unwrap_or_default();
            let content = value_string(item, &["content"]).unwrap_or_default();
            if role == "system" || content.trim().is_empty() || content.trim() == message.trim() {
                continue;
            }
            messages.push(json!({
                "role": role,
                "content": content.chars().take(700).collect::<String>()
            }));
        }
    }

    messages.push(json!({
        "role": "user",
        "content": message
    }));

    Ok(messages)
}

fn compact_desktop_context(payload: &Value) -> String {
    let memories = payload
        .get("memories")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter(|item| !item.get("archived").and_then(Value::as_bool).unwrap_or(false))
                .take(6)
                .filter_map(|item| value_string(item, &["content"]))
                .map(|content| format!("- {}", content.chars().take(240).collect::<String>()))
                .collect::<Vec<_>>()
                .join("\n")
        })
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "- 없음".to_string());

    let projects = payload
        .get("projects")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .take(6)
                .map(|item| {
                    let title = value_string(item, &["title"]).unwrap_or_else(|| "Untitled".to_string());
                    let status = value_string(item, &["status"]).unwrap_or_else(|| "unknown".to_string());
                    let priority = value_string(item, &["priority"]).unwrap_or_else(|| "unknown".to_string());
                    format!("- {title}: {status}/{priority}")
                })
                .collect::<Vec<_>>()
                .join("\n")
        })
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "- 없음".to_string());

    format!("로컬 장기 기억:\n{memories}\n\n프로젝트:\n{projects}")
}

fn http_request(
    base_url: &str,
    method: &str,
    path: &str,
    body: Option<&str>,
) -> Result<(u16, String), String> {
    let endpoint = parse_local_http_base_url(base_url)?;
    let mut stream = TcpStream::connect((endpoint.host.as_str(), endpoint.port))
        .map_err(|_| "Ollama가 실행 중인지 확인하세요. 터미널에서 `ollama serve`를 실행한 뒤 다시 시도하세요.".to_string())?;

    let body = body.unwrap_or("");
    let request = format!(
        "{method} {}{path} HTTP/1.1\r\nHost: {}\r\nContent-Type: application/json\r\nAccept: application/json\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{}",
        endpoint.base_path,
        endpoint.host_header,
        body.as_bytes().len(),
        body
    );
    stream
        .write_all(request.as_bytes())
        .map_err(|error| error.to_string())?;

    let mut response = String::new();
    stream
        .read_to_string(&mut response)
        .map_err(|error| error.to_string())?;
    parse_http_response(&response)
}

struct LocalHttpEndpoint {
    host: String,
    port: u16,
    host_header: String,
    base_path: String,
}

fn parse_local_http_base_url(base_url: &str) -> Result<LocalHttpEndpoint, String> {
    let trimmed = base_url.trim().trim_end_matches('/');
    let without_scheme = trimmed
        .strip_prefix("http://")
        .ok_or_else(|| "Desktop Ollama bridge는 http://localhost 계열 endpoint만 허용합니다.".to_string())?;
    let (host_port, base_path) = without_scheme
        .split_once('/')
        .map(|(host, path)| (host, format!("/{path}")))
        .unwrap_or((without_scheme, String::new()));
    let (host, port) = host_port
        .rsplit_once(':')
        .and_then(|(host, port)| port.parse::<u16>().ok().map(|port| (host, port)))
        .unwrap_or((host_port, 80));
    let normalized_host = host.trim_matches(['[', ']']).to_string();

    if !matches!(normalized_host.as_str(), "localhost" | "127.0.0.1" | "::1") {
        return Err("Desktop Ollama bridge는 로컬 Ollama endpoint만 호출할 수 있습니다.".to_string());
    }

    Ok(LocalHttpEndpoint {
        host: normalized_host,
        port,
        host_header: host_port.to_string(),
        base_path,
    })
}

fn parse_http_response(response: &str) -> Result<(u16, String), String> {
    let (headers, body) = response
        .split_once("\r\n\r\n")
        .ok_or_else(|| "Ollama HTTP 응답 형식이 올바르지 않습니다.".to_string())?;
    let status = headers
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|code| code.parse::<u16>().ok())
        .unwrap_or(500);
    let decoded_body = if headers.to_lowercase().contains("transfer-encoding: chunked") {
        decode_chunked_body(body)?
    } else {
        body.to_string()
    };

    if !(200..300).contains(&status) {
        let message = serde_json::from_str::<Value>(&decoded_body)
            .ok()
            .and_then(|value| value.get("error").and_then(Value::as_str).map(str::to_string))
            .unwrap_or_else(|| "Ollama 요청에 실패했습니다.".to_string());
        return Err(message);
    }

    Ok((status, decoded_body))
}

fn decode_chunked_body(body: &str) -> Result<String, String> {
    let mut rest = body;
    let mut decoded = String::new();

    loop {
        let Some((size_line, next)) = rest.split_once("\r\n") else {
            break;
        };
        let size = usize::from_str_radix(size_line.trim(), 16)
            .map_err(|_| "Ollama chunked 응답을 읽지 못했습니다.".to_string())?;
        if size == 0 {
            break;
        }
        if next.len() < size {
            return Err("Ollama chunked 응답이 잘렸습니다.".to_string());
        }
        decoded.push_str(&next[..size]);
        rest = next.get(size + 2..).unwrap_or_default();
    }

    Ok(decoded)
}

fn asks_current_provider_or_model(message: &str) -> bool {
    let normalized = message.to_lowercase();
    let runtime_terms = [
        "모델",
        "model",
        "provider",
        "프로바이더",
        "제공자",
        "엔진",
        "backend",
        "백엔드",
        "api",
        "런타임",
        "runtime",
        "상태",
        "status",
        "로컬 모델",
    ];
    let current_terms = [
        "현재",
        "지금",
        "사용",
        "쓰고",
        "뭐야",
        "무엇",
        "알려",
        "확인",
        "check",
        "current",
    ];

    runtime_terms.iter().any(|term| normalized.contains(term))
        && current_terms.iter().any(|term| normalized.contains(term))
}

fn classify_chat_risk(message: &str) -> ChatRisk {
    let lower = message.to_lowercase();
    if lower.contains("delete")
        || lower.contains("remove")
        || lower.contains("erase")
        || lower.contains("rm -rf")
        || lower.contains("결제")
        || lower.contains("송금")
        || lower.contains("구매")
        || lower.contains("메일")
        || lower.contains("파일 삭제")
    {
        return ChatRisk {
            level: "high".to_string(),
            requires_confirmation: true,
            reason: "되돌리기 어렵거나 외부에 영향을 주는 작업이 포함될 수 있습니다.".to_string(),
        };
    }

    if lower.contains("수정")
        || lower.contains("변경")
        || lower.contains("update")
        || lower.contains("edit")
        || lower.contains("캡처")
        || lower.contains("screenshot")
        || lower.contains("clipboard")
        || lower.contains("클립보드")
    {
        return ChatRisk {
            level: "medium".to_string(),
            requires_confirmation: true,
            reason: "개인 데이터나 외부 커뮤니케이션에 영향을 줄 수 있어 확인이 필요합니다.".to_string(),
        };
    }

    ChatRisk {
        level: "low".to_string(),
        requires_confirmation: false,
        reason: "일반적인 사고 정리 또는 정보 요청으로 보입니다.".to_string(),
    }
}

fn conversation_title(message: &str) -> String {
    let normalized = message.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.chars().count() <= 34 {
        return normalized;
    }
    format!("{}...", normalized.chars().take(34).collect::<String>())
}

fn value_string(value: &Value, path: &[&str]) -> Option<String> {
    let mut cursor = value;
    for key in path {
        cursor = cursor.get(*key)?;
    }
    cursor.as_str().map(str::to_string)
}

fn encode_url_component(input: &str) -> String {
    input
        .bytes()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (byte as char).to_string()
            }
            _ => format!("%{byte:02X}"),
        })
        .collect()
}

fn try_youtube_music_autoplay(url: &str) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        let script = r#"
on run argv
  set targetUrl to item 1 of argv
  tell application "Google Chrome"
    activate
    if not (exists window 1) then make new window
    set URL of active tab of front window to targetUrl
  end tell
  delay 3
  tell application "Google Chrome"
    tell active tab of front window
      set jsResult to execute javascript "(() => { const selectors = ['ytmusic-responsive-list-item-renderer a.yt-simple-endpoint', 'ytmusic-card-shelf-renderer a.yt-simple-endpoint']; const link = selectors.map((selector) => document.querySelector(selector)).find(Boolean); if (link) { link.click(); return 'clicked-result'; } const play = document.querySelector('ytmusic-player-bar #play-pause-button'); if (play && /play/i.test(play.getAttribute('title') || '')) { play.click(); return 'clicked-play'; } return 'no-play-target'; })();"
    end tell
  end tell
  return jsResult
end run
"#;
        let output = Command::new("osascript")
            .args(["-e", script, url])
            .output()
            .map_err(|error| error.to_string())?;
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        if output.status.success()
            && (stdout.contains("clicked-result") || stdout.contains("clicked-play"))
        {
            return Ok(true);
        }

        open_url_with_system(url)?;
        return Ok(false);
    }

    #[cfg(not(target_os = "macos"))]
    {
        open_url_with_system(url)?;
        Ok(false)
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
            "Cursor" => "cursor",
            "Visual Studio Code" => "code",
            "Notes" => "notepad",
            "Calendar" => "outlookcal:",
            "Music" => "mswindowsmusic:",
            "zoom.us" => "Zoom",
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
            "Cursor" => ("cursor", None),
            "Visual Studio Code" => ("code", None),
            "Notes" => return Err("Notes is not available on this platform.".to_string()),
            "Calendar" => return Err("Calendar is not available on this platform.".to_string()),
            "Music" => return Err("Music is not available on this platform.".to_string()),
            "zoom.us" => ("zoom", None),
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
