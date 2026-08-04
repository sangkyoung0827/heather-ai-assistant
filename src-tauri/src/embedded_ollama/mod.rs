mod models;
mod runtime;

use reqwest::blocking::Client;
use serde::Serialize;
use serde_json::{json, Value};
use std::{process::Child, sync::Mutex, time::Duration};
use tauri::AppHandle;

#[derive(Default)]
pub struct EmbeddedOllamaState {
    pub(crate) child: Mutex<Option<Child>>,
    pub(crate) endpoint: Mutex<Option<String>>,
    pub(crate) models_dir: Mutex<Option<std::path::PathBuf>>,
    pub(crate) import_summary: Mutex<Option<String>>,
}

impl Drop for EmbeddedOllamaState {
    fn drop(&mut self) {
        if let Ok(child) = self.child.get_mut() {
            if let Some(process) = child.as_mut() {
                let _ = process.kill();
                let _ = process.wait();
            }
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddedOllamaStatus {
    pub available: bool,
    pub embedded: bool,
    pub endpoint: String,
    pub configured_model: String,
    pub model: String,
    pub models: Vec<String>,
    pub models_dir: String,
    pub runtime_path: String,
    pub import_summary: String,
    pub message: String,
}

pub fn status(
    app: &AppHandle,
    state: &EmbeddedOllamaState,
    configured_model: &str,
) -> Result<EmbeddedOllamaStatus, String> {
    let context = runtime::ensure_running(app, state)?;
    let installed = models::list(&context.endpoint)?;
    let selected = models::resolve(&installed, configured_model).unwrap_or_default();
    let message = if selected.is_empty() {
        format!(
            "Heather 내장 Ollama 런타임은 실행 중입니다. 첫 답변에서 {configured_model} 모델을 Heather 전용 저장소에 준비합니다."
        )
    } else {
        format!(
            "Heather 내장 Ollama 런타임이 독립 실행 중이며 {selected} 모델을 사용합니다. 외부 Ollama 설치는 필요하지 않습니다."
        )
    };

    Ok(EmbeddedOllamaStatus {
        available: true,
        embedded: true,
        endpoint: context.endpoint,
        configured_model: configured_model.to_string(),
        model: selected,
        models: installed,
        models_dir: context.models_dir.display().to_string(),
        runtime_path: context.runtime_path.display().to_string(),
        import_summary: context.import_summary,
        message,
    })
}

pub fn chat(
    app: &AppHandle,
    state: &EmbeddedOllamaState,
    configured_model: &str,
    messages: Vec<Value>,
    max_tokens: u16,
) -> Result<(String, Value), String> {
    let context = runtime::ensure_running(app, state)?;
    let mut installed = models::list(&context.endpoint)?;
    let mut selected = models::resolve(&installed, configured_model);

    if selected.is_none() {
        models::pull(&context.endpoint, configured_model)?;
        installed = models::list(&context.endpoint)?;
        selected = models::resolve(&installed, configured_model);
    }

    let selected = selected
        .or_else(|| installed.first().cloned())
        .ok_or_else(|| format!("Heather 전용 저장소에 {configured_model} 모델을 준비하지 못했습니다."))?;
    let response = http_client(Duration::from_secs(15 * 60))
        .post(format!("{}/api/chat", context.endpoint))
        .json(&json!({
            "model": selected,
            "stream": false,
            "think": false,
            "messages": messages,
            "options": {
                "temperature": 0.6,
                "num_predict": max_tokens
            }
        }))
        .send()
        .map_err(|error| format!("Heather 내장 모델 호출에 실패했습니다: {error}"))?;
    let status = response.status();
    let value = response
        .json::<Value>()
        .map_err(|error| format!("Heather 내장 모델 응답을 읽지 못했습니다: {error}"))?;
    if !status.is_success() {
        return Err(value
            .get("error")
            .and_then(Value::as_str)
            .unwrap_or("Heather 내장 모델 요청에 실패했습니다.")
            .to_string());
    }
    Ok((selected, value))
}

pub fn shutdown(state: &EmbeddedOllamaState) {
    if let Ok(mut child) = state.child.lock() {
        if let Some(process) = child.as_mut() {
            let _ = process.kill();
            let _ = process.wait();
        }
        *child = None;
    }
    if let Ok(mut endpoint) = state.endpoint.lock() {
        *endpoint = None;
    }
}

pub(crate) fn http_client(timeout: Duration) -> Client {
    Client::builder()
        .timeout(timeout)
        .build()
        .unwrap_or_else(|_| Client::new())
}
