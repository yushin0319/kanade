//! WebView2 マイク権限自動許可ハンドラ
//!
//! localhost / tauri:// オリジンに対してのみマイク権限を自動許可する。
//! wry 0.54 の PermissionRequested 実装パターンに準拠。

#[cfg(target_os = "windows")]
pub fn setup_mic_permission(webview: &tauri::WebviewWindow) {
    // wry と同じパターン: EventRegistrationToken は実質 i64
    type EventRegistrationToken = i64;

    let result = webview.with_webview(|wv| {
        unsafe {
            use webview2_com::Microsoft::Web::WebView2::Win32::*;
            use webview2_com::PermissionRequestedEventHandler;

            let controller = wv.controller();
            let core = controller.CoreWebView2().unwrap();

            let mut token = EventRegistrationToken::default();

            core.add_PermissionRequested(
                &PermissionRequestedEventHandler::create(Box::new(|_sender, args| {
                    let Some(args) = args else { return Ok(()) };

                    let mut kind = COREWEBVIEW2_PERMISSION_KIND::default();
                    args.PermissionKind(&mut kind)?;

                    if kind == COREWEBVIEW2_PERMISSION_KIND_MICROPHONE {
                        let mut uri_pwstr = windows::core::PWSTR::null();
                        args.Uri(&mut uri_pwstr)?;
                        let uri_str = if uri_pwstr.is_null() {
                            String::new()
                        } else {
                            uri_pwstr.to_string().unwrap_or_default()
                        };

                        // localhost / tauri オリジンのみ許可
                        if uri_str.starts_with("http://localhost")
                            || uri_str.starts_with("https://localhost")
                            || uri_str.starts_with("http://tauri.localhost")
                            || uri_str.starts_with("https://tauri.localhost")
                            || uri_str.starts_with("tauri://")
                        {
                            log::info!("マイク権限を自動許可: {}", uri_str);
                            args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;
                        } else {
                            log::warn!("マイク権限を拒否（不明なオリジン）: {}", uri_str);
                            args.SetState(COREWEBVIEW2_PERMISSION_STATE_DENY)?;
                        }
                    }

                    Ok(())
                })),
                &mut token,
            )
            .expect("Failed to add PermissionRequested handler");

            log::info!("WebView2 マイク権限ハンドラを登録しました");
        }
    });

    if let Err(e) = result {
        log::error!("WebView2 権限ハンドラの登録に失敗: {}", e);
    }
}

#[cfg(not(target_os = "windows"))]
pub fn setup_mic_permission(_webview: &tauri::WebviewWindow) {
    log::warn!("マイク権限自動許可は Windows のみサポートされています");
}
