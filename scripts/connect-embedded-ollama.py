from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def patch(path: str, transform) -> None:
    target = ROOT / path
    original = target.read_text(encoding="utf-8")
    updated = transform(original)
    if updated == original:
        print(f"{path}: embedded Ollama integration already applied")
        return
    target.write_text(updated, encoding="utf-8")
    print(f"{path}: embedded Ollama integration applied")


def replace_once(content: str, old: str, new: str, label: str) -> str:
    if new in content:
        return content
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return content.replace(old, new, 1)


def patch_rust(content: str) -> str:
    content = replace_once(
        content,
        "use serde::{Deserialize, Serialize};",
        "mod embedded_ollama;\n\nuse serde::{Deserialize, Serialize};",
        "Rust module import",
    )
    content = replace_once(
        content,
        "    speech_process: Mutex<Option<Child>>,\n}",
        "    speech_process: Mutex<Option<Child>>,\n    embedded_ollama: embedded_ollama::EmbeddedOllamaState,\n}",
        "DesktopState embedded runtime",
    )

    status_pattern = re.compile(
        r"#\[tauri::command\]\nfn ollama_status\(base_url: String, model: String\) -> Result<OllamaStatus, String> \{.*?\n\}\n\n#\[tauri::command\]\nfn ollama_chat",
        re.S,
    )
    status_replacement = '''#[tauri::command]
fn ollama_status(
    app: AppHandle,
    model: String,
    state: State<DesktopState>,
) -> Result<embedded_ollama::EmbeddedOllamaStatus, String> {
    embedded_ollama::status(&app, &state.embedded_ollama, &model)
}

#[tauri::command]
fn ollama_chat'''
    if status_replacement not in content:
        content, count = status_pattern.subn(status_replacement, content, count=1)
        if count != 1:
            raise RuntimeError(f"Rust ollama_status replacement: expected one match, found {count}")

    chat_pattern = re.compile(
        r"#\[tauri::command\]\nfn ollama_chat\(payload: Value\) -> Result<DesktopChatResponse, String> \{.*?\n\}\n\n#\[tauri::command\]\nfn show_heather",
        re.S,
    )
    chat_replacement = '''#[tauri::command]
fn ollama_chat(
    app: AppHandle,
    payload: Value,
    state: State<DesktopState>,
) -> Result<DesktopChatResponse, String> {
    let message = value_string(&payload, &["message"]).unwrap_or_default();
    if message.trim().is_empty() {
        return Err("Message is required.".to_string());
    }

    let settings = payload.get("settings").unwrap_or(&Value::Null);
    let configured_model = value_string(settings, &["ollamaModel"])
        .or_else(|| value_string(settings, &["ollama_model"]))
        .unwrap_or_else(|| "gemma4:latest".to_string());

    if asks_current_provider_or_model(&message) {
        return Ok(DesktopChatResponse {
            message: format!(
                "현재 사용 중인 모델은 {configured_model}입니다. provider는 Heather embedded Ollama입니다. 외부 Ollama 앱은 사용하지 않습니다."
            ),
            title: conversation_title(&message),
            risk: classify_chat_risk(&message),
            provider: "embedded-ollama".to_string(),
            model: configured_model,
        });
    }

    let max_tokens = if is_simple_factual_question(&message) { 350 } else { 900 };
    let (resolved_model, response) = embedded_ollama::chat(
        &app,
        &state.embedded_ollama,
        &configured_model,
        build_ollama_messages(&payload, &message, &configured_model)?,
        max_tokens,
    )?;

    Ok(DesktopChatResponse {
        message: response
            .get("message")
            .and_then(|value| value.get("content"))
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|content| !content.is_empty())
            .ok_or_else(|| "Heather embedded Ollama returned an empty message.".to_string())?
            .to_string(),
        title: conversation_title(&message),
        risk: classify_chat_risk(&message),
        provider: "embedded-ollama".to_string(),
        model: response
            .get("model")
            .and_then(Value::as_str)
            .unwrap_or(&resolved_model)
            .to_string(),
    })
}

#[tauri::command]
fn ollama_shutdown(state: State<DesktopState>) {
    embedded_ollama::shutdown(&state.embedded_ollama);
}

#[tauri::command]
fn show_heather'''
    if chat_replacement not in content:
        content, count = chat_pattern.subn(chat_replacement, content, count=1)
        if count != 1:
            raise RuntimeError(f"Rust ollama_chat replacement: expected one match, found {count}")

    content = replace_once(
        content,
        "            ollama_chat,\n            show_heather",
        "            ollama_chat,\n            ollama_shutdown,\n            show_heather",
        "Rust invoke handler",
    )
    return content


patch("src-tauri/src/lib.rs", patch_rust)
