//! Tauri host. Owns the Rust core `Store`, exposes it to the webview through
//! a single `call` command (see core/src/bridge.rs), and provides the native
//! pieces a web page cannot: window state, menu bar, deep links,
//! notifications and the on-disk database.
#![forbid(unsafe_code)]
use hemlixfocus_core::{dispatch, Store};
use serde_json::Value;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};

pub mod menu;

pub struct CoreState(pub Arc<Store>);

#[tauri::command]
fn call(state: State<'_, CoreState>, method: String, args: Value) -> Result<Value, String> {
    dispatch(&state.0, &method, &args)
}

#[tauri::command]
fn database_path(app: AppHandle) -> Result<String, String> {
    Ok(db_path(&app)?.to_string_lossy().into_owned())
}

fn db_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("database.json"))
}

/// Handle `focus://add?name=...&note=...&due=...` style URLs (Quick Entry
/// from other apps, e.g. a mail client's "send to inbox" rule).
fn handle_urls(app: &AppHandle, urls: Vec<String>) {
    for url in urls {
        if let Ok(u) = url::Url::parse(&url) {
            if u.host_str() == Some("add") || u.path().trim_start_matches('/') == "add" {
                let mut spec = serde_json::json!({
                    "name": "", "note": "", "parent": null, "after": null, "project": null,
                    "tagIds": [], "flagged": false, "deferDate": null, "plannedDate": null,
                    "dueDate": null, "estimatedMinutes": null, "repetition": null
                });
                for (k, v) in u.query_pairs() {
                    match k.as_ref() {
                        "name" => spec["name"] = Value::String(v.into_owned()),
                        "note" => spec["note"] = Value::String(v.into_owned()),
                        "flag" | "flagged" => spec["flagged"] = Value::Bool(v == "true" || v == "1"),
                        _ => {}
                    }
                }
                let state = app.state::<CoreState>();
                let _ = dispatch(&state.0, "addTask", &serde_json::json!({ "spec": spec }));
                let _ = app.emit("core-changed", ());
            }
        }
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.show();
            let _ = w.set_focus();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_os::init())
        .setup(|app| {
            let path = db_path(&app.handle())?;
            let store = Store::open(path.to_string_lossy().into_owned())?;
            app.manage(CoreState(store));

            #[cfg(desktop)]
            {
                menu::install(app.handle())?;
                use tauri_plugin_deep_link::DeepLinkExt;
                #[cfg(any(windows, target_os = "linux"))]
                app.deep_link().register_all()?;
                let handle = app.handle().clone();
                app.deep_link().on_open_url(move |event| {
                    let urls: Vec<String> = event.urls().iter().map(|u| u.to_string()).collect();
                    handle_urls(&handle, urls);
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![call, database_path])
        .run(tauri::generate_context!())
        .expect("error while running application");
}
