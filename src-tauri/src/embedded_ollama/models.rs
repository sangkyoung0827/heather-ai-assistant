use super::http_client;
use serde_json::{json, Value};
use std::time::Duration;

pub fn list(endpoint: &str) -> Result<Vec<String>, String> {
    let response = http_client(Duration::from_secs(10))
        .get(format!("{endpoint}/api/tags"))
        .send()
        .map_err(|error| format!("Heather 내장 모델 목록을 읽지 못했습니다: {error}"))?;
    let status = response.status();
    let value = response.json::<Value>().map_err(|error| error.to_string())?;
    if !status.is_success() {
        return Err(error_message(&value, "Heather 내장 모델 목록 요청에 실패했습니다."));
    }
    Ok(value
        .get("models")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|entry| {
            entry
                .get("name")
                .or_else(|| entry.get("model"))
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .collect())
}

pub fn resolve(models: &[String], requested: &str) -> Option<String> {
    if let Some(exact) = models.iter().find(|model| model.as_str() == requested) {
        return Some(exact.clone());
    }
    let base = requested.strip_suffix(":latest").unwrap_or(requested);
    models
        .iter()
        .find(|model| model.strip_suffix(":latest").unwrap_or(model) == base)
        .cloned()
}

pub fn pull(endpoint: &str, model: &str) -> Result<(), String> {
    if model.trim().is_empty() {
        return Err("Heather 기본 엔진 모델 이름이 비어 있습니다.".to_string());
    }
    let response = http_client(Duration::from_secs(60 * 60))
        .post(format!("{endpoint}/api/pull"))
        .json(&json!({ "model": model, "stream": false }))
        .send()
        .map_err(|error| format!("Heather 전용 모델 설치에 실패했습니다: {error}"))?;
    let status = response.status();
    let value = response.json::<Value>().map_err(|error| error.to_string())?;
    if !status.is_success() {
        return Err(error_message(&value, "Heather 전용 모델 설치에 실패했습니다."));
    }
    Ok(())
}

fn error_message(value: &Value, fallback: &str) -> String {
    value
        .get("error")
        .and_then(Value::as_str)
        .unwrap_or(fallback)
        .to_string()
}
