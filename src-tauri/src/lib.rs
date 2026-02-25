mod permissions;

use tauri::Manager;
use tauri_plugin_store::StoreExt;

/// API Key を store から取得
#[tauri::command]
fn get_api_key(app: tauri::AppHandle) -> Result<String, String> {
    let store = app
        .store("settings.json")
        .map_err(|e| format!("Store open error: {}", e))?;

    match store.get("apiKey") {
        Some(val) => val
            .as_str()
            .map(|s| s.to_string())
            .ok_or_else(|| "apiKey is not a string".to_string()),
        None => Err("apiKey not set".to_string()),
    }
}

/// API Key を store に保存
#[tauri::command]
fn set_api_key(app: tauri::AppHandle, key: String) -> Result<(), String> {
    let store = app
        .store("settings.json")
        .map_err(|e| format!("Store open error: {}", e))?;

    store.set("apiKey", serde_json::Value::String(key));
    store
        .save()
        .map_err(|e| format!("Store save error: {}", e))?;

    Ok(())
}

/// ~/.claude/voice-chat/ からブリーフィング JSON を読み込み
#[tauri::command]
fn read_briefing() -> Result<String, String> {
    let home = dirs::home_dir().ok_or("Home directory not found")?;
    let path = home.join(".claude").join("voice-chat").join("briefing.json");
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read briefing.json: {}", e))
}

/// ~/.claude/voice-chat/ からシステムプロンプトを読み込み
#[tauri::command]
fn read_system_prompt() -> Result<String, String> {
    let home = dirs::home_dir().ok_or("Home directory not found")?;
    let path = home
        .join(".claude")
        .join("voice-chat")
        .join("system-prompt.md");
    std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read system-prompt.md: {}", e))
}

/// API Key が設定済みか確認
#[tauri::command]
fn has_api_key(app: tauri::AppHandle) -> bool {
    let store = match app.store("settings.json") {
        Ok(s) => s,
        Err(_) => return false,
    };

    match store.get("apiKey") {
        Some(val) => val.as_str().is_some_and(|s| !s.is_empty()),
        None => false,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // WebView2 マイク権限自動許可
            let webview = app.get_webview_window("main").unwrap();
            permissions::setup_mic_permission(&webview);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_api_key,
            set_api_key,
            has_api_key,
            read_briefing,
            read_system_prompt,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
