mod permissions;
mod tray;

use std::process::Command;
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

/// voice-chat ディレクトリのパスを取得（なければ作成）
fn voice_chat_dir() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("Home directory not found")?;
    let dir = home.join(".claude").join("voice-chat");
    if !dir.exists() {
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create voice-chat dir: {}", e))?;
    }
    Ok(dir)
}

/// サマリーを ~/.claude/voice-chat/summary.md に書き出し
#[tauri::command]
fn write_summary(content: String) -> Result<(), String> {
    let path = voice_chat_dir()?.join("summary.md");
    std::fs::write(&path, content)
        .map_err(|e| format!("Failed to write summary.md: {}", e))
}

/// 会話ログを ~/.claude/voice-chat/conversation.md に書き出し
#[tauri::command]
fn write_conversation(content: String) -> Result<(), String> {
    let path = voice_chat_dir()?.join("conversation.md");
    std::fs::write(&path, content)
        .map_err(|e| format!("Failed to write conversation.md: {}", e))
}

/// BurntToast でサマリー保存完了を通知
#[tauri::command]
fn notify_summary_saved() -> Result<(), String> {
    #[cfg(windows)]
    {
        Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "New-BurntToastNotification -Text 'Kanade', 'サマリーを保存しました'",
            ])
            .spawn()
            .map_err(|e| format!("Notification failed: {}", e))?;
    }
    Ok(())
}

/// Python 実行ファイルのパスを探索
fn find_python() -> Option<std::path::PathBuf> {
    // 1. Programs/Python から探す（Windows の標準インストール先）
    if let Some(local) = dirs::data_local_dir() {
        let programs = local.join("Programs").join("Python");
        if programs.exists() {
            if let Ok(entries) = std::fs::read_dir(&programs) {
                for entry in entries.flatten() {
                    let python = entry.path().join("python.exe");
                    if python.exists() {
                        return Some(python);
                    }
                }
            }
        }
    }

    // 2. PATH 上の python（WindowsApps スタブの可能性あり、フォールバック）
    Some(std::path::PathBuf::from("python"))
}

/// pyautogui スクリプトでサマリーを CC に注入
#[tauri::command]
fn inject_to_cc(summary: String) -> Result<(), String> {
    // 不審コマンド文字列のフィルタ
    let suspicious = [
        "rm -rf", "del /f", "format c:", "shutdown",
        "powershell -e", "cmd /c", "sudo ",
    ];
    for pattern in &suspicious {
        if summary.to_lowercase().contains(pattern) {
            return Err(format!("Suspicious content detected: {}", pattern));
        }
    }

    let home = dirs::home_dir().ok_or("Home directory not found")?;
    let script = home
        .join(".claude")
        .join("scripts")
        .join("kanade-send-to-cc.py");

    if !script.exists() {
        return Err("kanade-send-to-cc.py not found".to_string());
    }

    // サマリーテキストを一時ファイル経由で渡す（コマンドライン引数の文字化け回避）
    let summary_path = voice_chat_dir()?.join("summary.md");

    // Python のパスを探索（WindowsApps のスタブではなく実際の Python を使う）
    let python = find_python().ok_or("Python not found")?;

    Command::new(&python)
        .arg(&script)
        .arg(&summary_path)
        .spawn()
        .map_err(|e| format!("Failed to run pyautogui script: {}", e))?;

    Ok(())
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

            // システムトレイ構築
            tray::setup_tray(app)?;

            // ウィンドウ閉じ → トレイに最小化（終了しない）
            let window_for_close = webview.clone();
            webview.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window_for_close.hide();
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_api_key,
            set_api_key,
            has_api_key,
            read_briefing,
            read_system_prompt,
            write_summary,
            write_conversation,
            notify_summary_saved,
            inject_to_cc,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
