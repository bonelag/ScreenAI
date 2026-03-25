use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState, GlobalShortcutExt};
use xcap::Monitor;
use base64::{engine::general_purpose, Engine as _};
use std::io::Cursor;
use std::sync::Mutex;
use std::str::FromStr;
use tauri_plugin_store::StoreExt;

struct AppState {
    last_screenshot: Mutex<Option<String>>,
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
fn register_shortcut(app: AppHandle, shortcut: String) -> Result<(), String> {
    let _ = app.global_shortcut().unregister_all();
    
    if let Ok(parsed_shortcut) = Shortcut::from_str(&shortcut) {
        if let Err(e) = app.global_shortcut().register(parsed_shortcut) {
            return Err(format!("Failed to register shortcut: {}", e));
        }
        Ok(())
    } else {
        Err(format!("Invalid shortcut format: {}", shortcut))
    }
}

#[tauri::command]
fn hide_prompt(app: AppHandle) {
    if let Some(win) = app.get_webview_window("prompt") {
        let _ = win.hide();
    }
}

#[tauri::command]
async fn ask_ai(endpoint: String, api_key: String, model: String, messages: serde_json::Value) -> Result<String, String> {
    use reqwest::Client;
    use serde_json::json;

    let client = Client::new();
    
    let body = json!({
        "model": model,
        "messages": messages
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

fn capture_and_show_prompt(app: AppHandle) {
    let app_handle = app.clone();
    
    // Run in a new thread so we don't block the UI thread
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
            
            // Convert Rgba8 to Rgb8 since JPEG does not support Alpha channel
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
            
            // Re-open or show the prompt window
            let prompt_window = app_handle.get_webview_window("prompt");
            if let Some(win) = prompt_window {
                let _ = win.eval("window.location.reload()");
                let _ = win.show();
                let _ = win.set_focus();
                let _ = win.set_fullscreen(true);
            } else {
                let _win = WebviewWindowBuilder::new(
                    &app_handle,
                    "prompt",
                    WebviewUrl::App("/#/prompt".into())
                )
                .title("AI On Screen")
                .fullscreen(true)
                .always_on_top(true)
                .decorations(false)
                .transparent(true)
                .build();
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState {
            last_screenshot: Mutex::new(None),
        })
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        capture_and_show_prompt(app.clone());
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_last_screenshot, register_shortcut, hide_prompt, ask_ai])
        .setup(move |app| {
            let default_shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyO);
            let mut shortcut = default_shortcut;
            
            if let Ok(store) = app.store("settings.json") {
                if let Some(val) = store.get("shortcutText") {
                    if let Some(s) = val.get("value").and_then(|v| v.as_str()) {
                        if let Ok(parsed) = Shortcut::from_str(s) {
                            shortcut = parsed;
                        }
                    }
                }
            }
            let _ = app.global_shortcut().register(shortcut);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
