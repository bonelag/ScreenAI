use tauri::AppHandle; fn test_main_thread(app: AppHandle) { let _ = app.run_on_main_thread(move || {}); }
