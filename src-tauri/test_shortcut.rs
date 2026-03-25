use std::str::FromStr;
use tauri_plugin_global_shortcut::Shortcut;

fn main() {
    let test_cases = ["Alt+W", "Alt+KeyW", "CommandOrControl+Shift+0", "Ctrl+Shift+Digit0", "Ctrl+Shift+W"];
    
    for tc in &test_cases {
        match Shortcut::from_str(tc) {
            Ok(s) => println!("SUCCESS parsing '{}' -> {:?}", tc, s),
            Err(e) => println!("FAILED parsing '{}' -> {:?}", tc, e),
        }
    }
}
