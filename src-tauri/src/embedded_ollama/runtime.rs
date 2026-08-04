use super::{http_client, EmbeddedOllamaState};
use std::{
    fs::{self, OpenOptions},
    net::TcpListener,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::Duration,
};
use tauri::{AppHandle, Manager};

const HOST: &str = "127.0.0.1";
const STARTUP_ATTEMPTS: usize = 80;
const STARTUP_DELAY: Duration = Duration::from_millis(150);

pub struct RuntimeContext {
    pub endpoint: String,
    pub models_dir: PathBuf,
    pub runtime_path: PathBuf,
    pub import_summary: String,
}

pub fn ensure_running(
    app: &AppHandle,
    state: &EmbeddedOllamaState,
) -> Result<RuntimeContext, String> {
    let runtime_path = resolve_runtime_path(app)?;
    ensure_executable(&runtime_path)?;

    if let Some(endpoint) = live_endpoint(state)? {
        return context_from_state(state, endpoint, runtime_path);
    }

    let root = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("Heather app data directory is unavailable: {error}"))?
        .join("embedded-ollama");
    let models_dir = root.join("models");
    fs::create_dir_all(&models_dir).map_err(|error| error.to_string())?;
    let import_summary = import_legacy_models(&models_dir)?;

    *state
        .models_dir
        .lock()
        .map_err(|_| "Heather model directory lock failed.".to_string())? = Some(models_dir.clone());
    *state
        .import_summary
        .lock()
        .map_err(|_| "Heather model import state lock failed.".to_string())? = Some(import_summary.clone());

    let listener = TcpListener::bind((HOST, 0)).map_err(|error| error.to_string())?;
    let port = listener.local_addr().map_err(|error| error.to_string())?.port();
    drop(listener);
    let endpoint = format!("http://{HOST}:{port}");
    let log_path = root.join("embedded-ollama.log");
    let log = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|error| error.to_string())?;
    let log_copy = log.try_clone().map_err(|error| error.to_string())?;

    let mut process = Command::new(&runtime_path)
        .arg("serve")
        .env("OLLAMA_HOST", format!("{HOST}:{port}"))
        .env("OLLAMA_MODELS", &models_dir)
        .env("OLLAMA_KEEP_ALIVE", "10m")
        .env("OLLAMA_NOHISTORY", "1")
        .env("OLLAMA_FLASH_ATTENTION", "1")
        .stdout(Stdio::from(log_copy))
        .stderr(Stdio::from(log))
        .spawn()
        .map_err(|error| format!("Heather에 포함된 Ollama 런타임을 시작하지 못했습니다: {error}"))?;

    for _ in 0..STARTUP_ATTEMPTS {
        if let Some(status) = process.try_wait().map_err(|error| error.to_string())? {
            return Err(format!(
                "Heather 내장 Ollama가 시작 직후 종료되었습니다({status}). 로그: {}",
                log_path.display()
            ));
        }
        if tags_available(&endpoint) {
            *state
                .child
                .lock()
                .map_err(|_| "Heather embedded process lock failed.".to_string())? = Some(process);
            *state
                .endpoint
                .lock()
                .map_err(|_| "Heather embedded endpoint lock failed.".to_string())? = Some(endpoint.clone());
            return Ok(RuntimeContext {
                endpoint,
                models_dir,
                runtime_path,
                import_summary,
            });
        }
        thread::sleep(STARTUP_DELAY);
    }

    let _ = process.kill();
    let _ = process.wait();
    Err(format!(
        "Heather 내장 Ollama가 준비되지 않았습니다. 로그: {}",
        log_path.display()
    ))
}

fn context_from_state(
    state: &EmbeddedOllamaState,
    endpoint: String,
    runtime_path: PathBuf,
) -> Result<RuntimeContext, String> {
    let models_dir = state
        .models_dir
        .lock()
        .map_err(|_| "Heather model directory lock failed.".to_string())?
        .clone()
        .unwrap_or_default();
    let import_summary = state
        .import_summary
        .lock()
        .map_err(|_| "Heather model import state lock failed.".to_string())?
        .clone()
        .unwrap_or_else(|| "Heather 전용 모델 저장소가 준비되어 있습니다.".to_string());
    Ok(RuntimeContext {
        endpoint,
        models_dir,
        runtime_path,
        import_summary,
    })
}

fn live_endpoint(state: &EmbeddedOllamaState) -> Result<Option<String>, String> {
    let endpoint = state
        .endpoint
        .lock()
        .map_err(|_| "Heather embedded endpoint lock failed.".to_string())?
        .clone();
    let mut child = state
        .child
        .lock()
        .map_err(|_| "Heather embedded process lock failed.".to_string())?;
    let Some(process) = child.as_mut() else {
        return Ok(None);
    };
    if process.try_wait().map_err(|error| error.to_string())?.is_some() {
        *child = None;
        return Ok(None);
    }
    let Some(endpoint) = endpoint else {
        return Ok(None);
    };
    if tags_available(&endpoint) {
        return Ok(Some(endpoint));
    }
    let _ = process.kill();
    let _ = process.wait();
    *child = None;
    Ok(None)
}

fn tags_available(endpoint: &str) -> bool {
    http_client(Duration::from_secs(3))
        .get(format!("{endpoint}/api/tags"))
        .send()
        .map(|response| response.status().is_success())
        .unwrap_or(false)
}

fn resolve_runtime_path(app: &AppHandle) -> Result<PathBuf, String> {
    let packaged = app
        .path()
        .resource_dir()
        .map_err(|error| error.to_string())?
        .join("embedded-ollama")
        .join(executable_name());
    if packaged.is_file() {
        return Ok(packaged);
    }
    if let Some(manifest) = option_env!("CARGO_MANIFEST_DIR") {
        let development = Path::new(manifest)
            .join("resources")
            .join("embedded-ollama")
            .join(executable_name());
        if development.is_file() {
            return Ok(development);
        }
    }
    Err("Heather 앱에 내장 Ollama 런타임이 없습니다. `python3 scripts/prepare-embedded-ollama.py` 실행 후 다시 빌드하세요.".to_string())
}

fn executable_name() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "ollama.exe"
    }
    #[cfg(not(target_os = "windows"))]
    {
        "ollama"
    }
}

fn ensure_executable(path: &Path) -> Result<(), String> {
    if !path.is_file() {
        return Err(format!("Heather embedded runtime is missing: {}", path.display()));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
        if metadata.permissions().mode() & 0o111 == 0 {
            let mut permissions = metadata.permissions();
            permissions.set_mode(permissions.mode() | 0o755);
            fs::set_permissions(path, permissions).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn import_legacy_models(destination: &Path) -> Result<String, String> {
    let marker = destination.join(".heather-import-complete");
    if marker.exists() || destination.join("manifests").is_dir() || destination.join("blobs").is_dir() {
        return Ok("Heather 전용 모델 저장소가 준비되어 있습니다.".to_string());
    }
    let Some(home) = dirs::home_dir() else {
        fs::write(marker, b"no-home").map_err(|error| error.to_string())?;
        return Ok("새 Heather 모델 저장소를 사용합니다.".to_string());
    };
    let source = home.join(".ollama").join("models");
    if !source.is_dir() {
        fs::write(marker, b"no-legacy-models").map_err(|error| error.to_string())?;
        return Ok("기존 Ollama 모델이 없어 Heather가 필요한 모델을 자체 설치합니다.".to_string());
    }

    let mut files = 0usize;
    let mut links = 0usize;
    let mut copies = 0usize;
    clone_tree(&source, destination, &mut files, &mut links, &mut copies)?;
    fs::write(&marker, format!("files={files} links={links} copies={copies}"))
        .map_err(|error| error.to_string())?;
    Ok(format!(
        "기존 모델 {files}개를 Heather 전용 저장소로 독립 이관했습니다(하드링크 {links}, 복사 {copies})."
    ))
}

fn clone_tree(
    source: &Path,
    destination: &Path,
    files: &mut usize,
    links: &mut usize,
    copies: &mut usize,
) -> Result<(), String> {
    fs::create_dir_all(destination).map_err(|error| error.to_string())?;
    for entry in fs::read_dir(source).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        if file_type.is_dir() {
            clone_tree(&source_path, &destination_path, files, links, copies)?;
        } else if file_type.is_file() && !destination_path.exists() {
            *files += 1;
            if fs::hard_link(&source_path, &destination_path).is_ok() {
                *links += 1;
            } else {
                fs::copy(&source_path, &destination_path).map_err(|error| error.to_string())?;
                *copies += 1;
            }
        }
    }
    Ok(())
}
