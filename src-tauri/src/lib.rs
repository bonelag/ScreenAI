use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri::tray::{TrayIconBuilder, MouseButton, MouseButtonState, TrayIconEvent};
use tauri::menu::{Menu, MenuItem};
use tauri_plugin_global_shortcut::{Shortcut, ShortcutState, GlobalShortcutExt};
use xcap::Monitor;
use base64::Engine as _;
use std::io::Cursor;
use std::sync::Mutex;
use std::str::FromStr;
use tauri_plugin_store::StoreExt;

struct AppState {
    last_screenshot: Mutex<Option<String>>,
    capture_shortcut: Mutex<String>,
    chat_shortcut: Mutex<String>,
    active_session: Mutex<Option<String>>,
}

#[tauri::command]
fn get_last_screenshot(state: tauri::State<AppState>) -> Result<String, String> {
    let last = state.last_screenshot.lock().unwrap();
    if let Some(img) = last.clone() {
        Ok(img)
    } else {
        Err("No screenshot available".into())
    }
}

#[tauri::command]
fn register_shortcuts(app: AppHandle, capture_shortcut: String, chat_shortcut: String) -> Result<(), String> {
    let _ = app.global_shortcut().unregister_all();
    
    let state: tauri::State<AppState> = app.state();
    *state.capture_shortcut.lock().unwrap() = capture_shortcut.clone();
    *state.chat_shortcut.lock().unwrap() = chat_shortcut.clone();

    if let Ok(parsed) = Shortcut::from_str(&capture_shortcut) {
        if let Err(e) = app.global_shortcut().register(parsed) {
            return Err(format!("Failed to register capture shortcut: {}", e));
        }
    } else {
        return Err(format!("Invalid capture shortcut format: {}", capture_shortcut));
    }

    if let Ok(parsed) = Shortcut::from_str(&chat_shortcut) {
        if let Err(e) = app.global_shortcut().register(parsed) {
            return Err(format!("Failed to register chat shortcut: {}", e));
        }
    } else {
        return Err(format!("Invalid chat shortcut format: {}", chat_shortcut));
    }

    Ok(())
}

#[tauri::command]
fn hide_prompt(app: AppHandle) {
    let state: tauri::State<AppState> = app.state();
    *state.active_session.lock().unwrap() = None;
    if let Some(win) = app.get_webview_window("prompt") {
        let _ = win.hide();
    }
    if let Some(win) = app.get_webview_window("chat") {
        let _ = win.hide();
    }
}

#[tauri::command]
fn minimize_to_tray(app: AppHandle, label: String) {
    let state: tauri::State<AppState> = app.state();
    *state.active_session.lock().unwrap() = Some(label.clone());
    if let Some(win) = app.get_webview_window(&label) {
        let _ = win.hide();
    }
}

#[tauri::command]
fn resize_prompt_window(app: AppHandle, x: f64, y: f64, width: f64, height: f64) {
    if let Some(win) = app.get_webview_window("prompt") {
        let _ = win.set_fullscreen(false);
        let _ = win.set_size(tauri::Size::Logical(tauri::LogicalSize { width, height }));
        let _ = win.set_position(tauri::Position::Logical(tauri::LogicalPosition { x, y }));
        let _ = win.set_skip_taskbar(true);
    }
}

#[tauri::command]
fn resize_chat_window(app: AppHandle, x: f64, y: f64, width: f64, height: f64) {
    if let Some(win) = app.get_webview_window("chat") {
        let _ = win.set_size(tauri::Size::Logical(tauri::LogicalSize { width, height }));
        let _ = win.set_position(tauri::Position::Logical(tauri::LogicalPosition { x, y }));
    }
}

#[tauri::command]
fn adjust_chat_window_size(app: AppHandle, width: f64, height: f64) {
    if let Some(win) = app.get_webview_window("chat") {
        let _ = win.set_size(tauri::Size::Logical(tauri::LogicalSize { width, height }));
        if let Ok(monitor) = win.current_monitor() {
            if let Some(m) = monitor {
                let screen_w = m.size().width as f64 / m.scale_factor();
                let screen_h = m.size().height as f64 / m.scale_factor();
                let x = (screen_w - width) / 2.0;
                let y = screen_h - height - 160.0; // 160px from bottom for better view
                let _ = win.set_position(tauri::Position::Logical(tauri::LogicalPosition { x, y }));
            }
        }
    }
}

#[tauri::command]
async fn ask_ai(endpoint: String, api_key: String, model: String, messages: serde_json::Value, enable_thinking: Option<bool>) -> Result<String, String> {
    use reqwest::Client;
    use serde_json::json;

    let client = Client::new();
    
    let thinking_enabled = enable_thinking.unwrap_or(true);
    
    let body = json!({
        "model": model,
        "messages": messages,
        "chat_template_kwargs": {
            "enable_thinking": thinking_enabled
        }
    });

    let mut req = client.post(&endpoint).header("Content-Type", "application/json");
        
    if !api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {}", api_key));
    }

    let res = req.json(&body)
        .send()
        .await
        .map_err(|e| format!("Network Error: {}", e))?;

    if !res.status().is_success() {
        let status = res.status();
        let error_text = res.text().await.unwrap_or_default();
        return Err(format!("API Error ({}): {}", status, error_text));
    }

    let json_res: serde_json::Value = res.json().await.map_err(|e| format!("Parse Error: {}", e))?;
    
    let message = &json_res["choices"][0]["message"];
    let content = message["content"].as_str().unwrap_or("");
    let reasoning = message["reasoning_content"].as_str().unwrap_or("");
    
    let mut final_content = String::new();
    if !reasoning.is_empty() {
        final_content.push_str(&format!("<think>\n{}\n</think>\n\n", reasoning));
    }
    final_content.push_str(content);
    
    if final_content.is_empty() {
        Err("Invalid JSON response from AI".into())
    } else {
        Ok(final_content)
    }
}

#[tauri::command]
async fn ask_ai_stream(app: AppHandle, endpoint: String, api_key: String, model: String, messages: serde_json::Value, enable_thinking: Option<bool>) -> Result<(), String> {
    use reqwest::Client;
    use serde_json::json;
    use tauri::Emitter;
    use eventsource_stream::Eventsource;
    use futures_util::StreamExt;

    let client = Client::new();
    let thinking_enabled = enable_thinking.unwrap_or(true);
    
    let body = json!({
        "model": model,
        "messages": messages,
        "stream": true,
        "chat_template_kwargs": {
            "enable_thinking": thinking_enabled
        }
    });

    let mut req = client.post(&endpoint).header("Content-Type", "application/json");
        
    if !api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {}", api_key));
    }

    let res = req.json(&body)
        .send()
        .await
        .map_err(|e| format!("Network Error: {}", e))?;

    if !res.status().is_success() {
        let status = res.status();
        let error_text = res.text().await.unwrap_or_default();
        return Err(format!("API Error ({}): {}", status, error_text));
    }

    let mut stream = res.bytes_stream().eventsource();

    while let Some(event) = stream.next().await {
        match event {
            Ok(evt) => {
                let data = evt.data;
                if data == "[DONE]" {
                    break;
                }
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&data) {
                    if let Some(choices) = parsed["choices"].as_array() {
                        if let Some(choice) = choices.first() {
                            let delta = &choice["delta"];
                            let content = delta["content"].as_str().unwrap_or("");
                            let reasoning = delta["reasoning_content"].as_str().unwrap_or("");
                            
                            if !content.is_empty() || !reasoning.is_empty() {
                                let _ = app.emit("ai-stream-chunk", json!({
                                    "content": content,
                                    "reasoning": reasoning,
                                }));
                            }
                        }
                    }
                }
            }
            Err(_) => {}
        }
    }
    
    let _ = app.emit("ai-stream-done", json!({}));

    Ok(())
}

fn show_main_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
    }
}

fn capture_and_show_prompt(app: AppHandle) {
    let app_handle = app.clone();
    
    std::thread::spawn(move || {
        let screens = match Monitor::all() {
            Ok(s) => s,
            Err(e) => {
                eprintln!("Failed to get monitors: {}", e);
                return;
            }
        };
        
        if let Some(monitor) = screens.first() {
            let image = match monitor.capture_image() {
                Ok(img) => img,
                Err(e) => {
                    eprintln!("Failed to capture: {}", e);
                    return;
                }
            };
            
            let rgb_image = image::DynamicImage::ImageRgba8(image).into_rgb8();
            
            let mut buffer = Cursor::new(Vec::new());
            if let Err(e) = rgb_image.write_to(&mut buffer, image::ImageFormat::Jpeg) {
                eprintln!("Failed to encode: {}", e);
                return;
            }
            
            let base_64 = base64::engine::general_purpose::STANDARD.encode(buffer.into_inner());
            let data_uri = format!("data:image/jpeg;base64,{}", base_64);
            
            let state: tauri::State<AppState> = app_handle.state();
            *state.last_screenshot.lock().unwrap() = Some(data_uri);
            
            let prompt_window = app_handle.get_webview_window("prompt");
            if let Some(win) = prompt_window {
                let _ = win.eval("window.location.reload()");
                let _ = win.show();
                let _ = win.set_focus();
                let _ = win.set_fullscreen(true);
                let _ = win.set_skip_taskbar(true);
            } else {
                let win = WebviewWindowBuilder::new(
                    &app_handle,
                    "prompt",
                    WebviewUrl::App("/#/prompt".into())
                )
                .title("AI On Screen")
                .fullscreen(true)
                .always_on_top(true)
                .decorations(false)
                .transparent(true)
                .skip_taskbar(true)
                .build();
                let _ = win;
            }
        }
    });
}

fn open_chat_window(app: AppHandle) {
    // Compact size: just the input bar
    let compact_width = 500.0;
    let compact_height = 110.0;
    
    let chat_window = app.get_webview_window("chat");
    if let Some(win) = chat_window {
        let _ = win.eval("window.location.reload()");
        let _ = win.set_size(tauri::Size::Logical(tauri::LogicalSize { width: compact_width, height: compact_height }));
        // Re-center near bottom
        if let Ok(monitor) = win.current_monitor() {
            if let Some(m) = monitor {
                let screen_w = m.size().width as f64 / m.scale_factor();
                let screen_h = m.size().height as f64 / m.scale_factor();
                let x = (screen_w - compact_width) / 2.0;
                let y = screen_h - compact_height - 160.0;
                let _ = win.set_position(tauri::Position::Logical(tauri::LogicalPosition { x, y }));
            }
        }
        let _ = win.show();
        let _ = win.set_focus();
    } else {
        // Get primary monitor size for positioning
        let monitors = xcap::Monitor::all().unwrap_or_default();
        let (screen_w, screen_h) = monitors.first()
            .map(|m| (m.width().unwrap_or(1920) as f64, m.height().unwrap_or(1080) as f64))
            .unwrap_or((1920.0, 1080.0));
        
        // Cần lấy scale_factor chuẩn nếu có thể, nhưng fallback tạm
        let x = (screen_w - compact_width) / 2.0;
        let y = screen_h - compact_height - 160.0;
        
        let win = WebviewWindowBuilder::new(
            &app,
            "chat",
            WebviewUrl::App("/#/chat".into())
        )
        .title("ScreenAI Chat")
        .inner_size(compact_width, compact_height)
        .position(x, y)
        .always_on_top(true)
        .decorations(false)
        .transparent(false)
        .skip_taskbar(true)
        .build();
        let _ = win;
    }
}

fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let open_item = MenuItem::with_id(app, "open_settings", "Open Settings", true, None::<&str>)?;
    let capture_item = MenuItem::with_id(app, "capture_now", "Capture Now", true, None::<&str>)?;
    let chat_item = MenuItem::with_id(app, "open_chat", "Open Chat", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    
    let menu = Menu::with_items(app, &[&open_item, &capture_item, &chat_item, &quit_item])?;

    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .on_menu_event(move |app, event| {
            match event.id.as_ref() {
                "open_settings" => {
                    show_main_window(app);
                }
                "capture_now" => {
                    capture_and_show_prompt(app.clone());
                }
                "open_chat" => {
                    open_chat_window(app.clone());
                }
                "quit" => {
                    app.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                let app = tray.app_handle();
                show_main_window(app);
            }
        })
        .tooltip("ScreenAI")
        .build(app)?;
    
    Ok(())
}

fn is_shortcut_match(shortcut: &Shortcut, shortcut_str: &str) -> bool {
    if let Ok(parsed) = Shortcut::from_str(shortcut_str) {
        shortcut.mods == parsed.mods && shortcut.key == parsed.key
    } else {
        false
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState {
            last_screenshot: Mutex::new(None),
            capture_shortcut: Mutex::new("Ctrl+Shift+KeyO".to_string()),
            chat_shortcut: Mutex::new("Ctrl+Shift+KeyI".to_string()),
            active_session: Mutex::new(None),
        })
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        let state: tauri::State<AppState> = app.state();
                        
                        // Check for active minimized session first
                        let active = state.active_session.lock().unwrap().clone();
                        if let Some(label) = active {
                            if let Some(win) = app.get_webview_window(&label) {
                                let _ = win.show();
                                let _ = win.set_focus();
                                return;
                            } else {
                                // Window no longer exists, clear session
                                *state.active_session.lock().unwrap() = None;
                            }
                        }
                        
                        let capture_sc = state.capture_shortcut.lock().unwrap().clone();
                        let chat_sc = state.chat_shortcut.lock().unwrap().clone();
                        
                        if is_shortcut_match(shortcut, &capture_sc) {
                            capture_and_show_prompt(app.clone());
                        } else if is_shortcut_match(shortcut, &chat_sc) {
                            open_chat_window(app.clone());
                        }
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_last_screenshot, register_shortcuts, hide_prompt, minimize_to_tray, resize_prompt_window, resize_chat_window, adjust_chat_window_size, ask_ai, ask_ai_stream])
        .setup(move |app| {
            setup_tray(app)?;

            let default_capture = "Ctrl+Shift+KeyO".to_string();
            let default_chat = "Ctrl+Shift+KeyI".to_string();
            let mut capture_sc = default_capture.clone();
            let mut chat_sc = default_chat.clone();
            
            if let Ok(store) = app.store("settings.json") {
                if let Some(val) = store.get("shortcutText") {
                    if let Some(s) = val.get("value").and_then(|v| v.as_str()) {
                        capture_sc = s.to_string();
                    }
                }
                if let Some(val) = store.get("chatShortcutText") {
                    if let Some(s) = val.get("value").and_then(|v| v.as_str()) {
                        chat_sc = s.to_string();
                    }
                }
            }

            // Save to state
            {
                let state: tauri::State<AppState> = app.state();
                *state.capture_shortcut.lock().unwrap() = capture_sc.clone();
                *state.chat_shortcut.lock().unwrap() = chat_sc.clone();
            }

            // Register both shortcuts
            if let Ok(parsed) = Shortcut::from_str(&capture_sc) {
                let _ = app.global_shortcut().register(parsed);
            }
            if let Ok(parsed) = Shortcut::from_str(&chat_sc) {
                let _ = app.global_shortcut().register(parsed);
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
