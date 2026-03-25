use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState, GlobalShortcutExt};
use xcap::Monitor;
use base64::{engine::general_purpose, Engine as _};
use std::io::Cursor;
use std::sync::Mutex;

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
fn register_shortcut(app: AppHandle, _shortcut: String) -> Result<(), String> {
    // Basic implementation: for simplicity here we register a fixed shortcut to avoid parsing strings
    // In a real app we'd parse this string to get Modifiers and Code
    // First, unregister any existing.
    let _ = app.plugin(tauri_plugin_global_shortcut::Builder::new().build());
    Ok(())
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
            
            let mut buffer = Cursor::new(Vec::new());
            if let Err(e) = image.write_to(&mut buffer, image::ImageFormat::Jpeg) {
                eprintln!("Failed to encode: {}", e);
                return;
            }
            
            let base_64 = general_purpose::STANDARD.encode(buffer.into_inner());
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
    let ctrl_shift_o = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyO);

    tauri::Builder::default()
        .manage(AppState {
            last_screenshot: Mutex::new(None),
        })
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        if shortcut == &ctrl_shift_o {
                            capture_and_show_prompt(app.clone());
                        }
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_last_screenshot, register_shortcut])
        .setup(move |app| {
            app.global_shortcut().register(ctrl_shift_o).unwrap();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
