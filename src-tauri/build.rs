const APP_COMMANDS: &[&str] = &[
    "get_system_info",
    "choose_directory",
    "list_directory",
    "search_files",
    "read_text_file",
    "open_external_url",
    "open_url",
    "open_app",
    "search_web",
    "search_youtube",
    "search_youtube_music",
    "play_youtube_music",
    "speak_macos",
    "stop_speaking",
    "get_clipboard_text",
    "set_clipboard_text",
    "ollama_status",
    "ollama_chat",
    "ollama_shutdown",
    "show_heather",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(APP_COMMANDS)),
    )
    .expect("failed to generate Heather Tauri permissions");
}
