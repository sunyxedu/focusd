//! Due notifications: a background ticker asks the core which items come
//! due in the next minute (and, optionally, `notify_before_minutes` ahead)
//! and posts a system notification for each, once.
use hemlixfocus_core::{DueItem, Store};
use std::collections::HashSet;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

const TICK: Duration = Duration::from_secs(30);

fn post(app: &AppHandle, item: &DueItem, prefix: &str) {
    let body = match &item.project {
        Some(p) => format!("{}{}", prefix, p),
        None => prefix.trim_end_matches(" · ").to_string(),
    };
    let _ = app.notification().builder().title(&item.name).body(&body).show();
}

/// Items due in `[from, to)` become notifications; `seen` prevents repeats
/// while the app keeps running.
pub fn tick(app: &AppHandle, store: &Store, seen: &mut HashSet<(String, i64, bool)>, now: i64) {
    let settings = store.settings();
    if !settings.notify_due {
        return;
    }
    let minute = 60_000;
    for item in store.due_between(now - minute, now) {
        if seen.insert((item.id.clone(), item.due, false)) {
            post(app, &item, "Due now · ");
        }
    }
    let before = settings.notify_before_minutes as i64 * minute;
    if before > 0 {
        for item in store.due_between(now + before - minute, now + before) {
            if seen.insert((item.id.clone(), item.due, true)) {
                post(app, &item, &format!("Due in {} minutes · ", settings.notify_before_minutes));
            }
        }
    }
}

pub fn start(app: AppHandle) {
    std::thread::Builder::new()
        .name("due-notifications".into())
        .spawn(move || {
            let mut seen: HashSet<(String, i64, bool)> = HashSet::new();
            loop {
                let store: Arc<Store> = app.state::<crate::CoreState>().0.clone();
                let now = hemlixfocus_core::dates::now_ms();
                tick(&app, &store, &mut seen, now);
                if seen.len() > 10_000 {
                    seen.clear();
                }
                std::thread::sleep(TICK);
            }
        })
        .ok();
}
