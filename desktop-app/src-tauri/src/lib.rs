// The tracker is a plain static HTML/CSS/JS app (see ../../../index.html)
// that normally just uses the browser's own localStorage. These two
// commands are a reliable, Rust-native mirror of that same data, written to
// a plain file — WebView2's LocalStorage (a LevelDB store under the hood)
// has proven unreliable in the wild for this app: data written during a
// session has repeatedly failed to read back after the window is closed and
// reopened, with no corruption or error, it's just silently gone. Writing
// straight to a file with std::fs sidesteps that storage layer entirely.
use tauri::Manager;

#[tauri::command]
fn save_state_file(app: tauri::AppHandle, contents: String) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("state.json"), contents).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_state_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let path = dir.join("state.json");
    if !path.exists() {
        return Ok(None);
    }
    std::fs::read_to_string(path).map(Some).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![save_state_file, load_state_file])
        .setup(|app| {
            // tauri.conf.json's own "maximized" window option is unreliable —
            // the window briefly maximizes then snaps back to its configured
            // width/height (see tauri-apps/tauri#11554). Maximizing here once
            // the window actually exists is the documented workaround.
            if let Some(window) = app.get_webview_window("main") {
                window.maximize()?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
