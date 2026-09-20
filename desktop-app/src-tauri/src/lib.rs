// The tracker is a plain static HTML/CSS/JS app (see ../../../index.html) —
// it doesn't call any native Tauri commands, so this just hosts the webview.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
