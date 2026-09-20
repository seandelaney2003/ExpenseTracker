// The tracker is a plain static HTML/CSS/JS app (see ../../../index.html) —
// it doesn't call any native Tauri commands, so this just hosts the webview.
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
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
