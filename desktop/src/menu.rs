//! Native menu bar mirroring Focusd for Mac. Every item emits a
//! `menu` event with its id; the web layer performs the action so behaviour
//! stays in one place (and identical to the keyboard shortcuts there).
use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Runtime};

fn item<R: Runtime>(app: &AppHandle<R>, id: &str, label: &str, accel: Option<&str>) -> tauri::Result<MenuItem<R>> {
    MenuItem::with_id(app, id, label, true, accel)
}

pub fn install<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let app_name = "Focus";
    let about = AboutMetadata { name: Some(app_name.into()), ..Default::default() };

    let app_menu = Submenu::with_items(app, app_name, true, &[
        &PredefinedMenuItem::about(app, Some(&format!("About {}", app_name)), Some(about))?,
        &PredefinedMenuItem::separator(app)?,
        &item(app, "settings", "Settings…", Some("CmdOrCtrl+,"))?,
        &PredefinedMenuItem::separator(app)?,
        &PredefinedMenuItem::services(app, None)?,
        &PredefinedMenuItem::separator(app)?,
        &PredefinedMenuItem::hide(app, None)?,
        &PredefinedMenuItem::hide_others(app, None)?,
        &PredefinedMenuItem::show_all(app, None)?,
        &PredefinedMenuItem::separator(app)?,
        &PredefinedMenuItem::quit(app, None)?,
    ])?;

    let file = Submenu::with_items(app, "File", true, &[
        &item(app, "newAction", "New Action", Some("CmdOrCtrl+N"))?,
        &item(app, "newProject", "New Project", Some("CmdOrCtrl+Shift+N"))?,
        &item(app, "newFolder", "New Folder", Some("CmdOrCtrl+Alt+N"))?,
        &item(app, "newTag", "New Tag", Some("CmdOrCtrl+Ctrl+N"))?,
        &PredefinedMenuItem::separator(app)?,
        &item(app, "quickEntry", "Quick Entry", Some("Ctrl+Alt+Space"))?,
        &item(app, "quickOpen", "Quick Open…", Some("CmdOrCtrl+O"))?,
        &PredefinedMenuItem::separator(app)?,
        &item(app, "import", "Import Database…", None)?,
        &item(app, "export", "Export Database…", None)?,
        &PredefinedMenuItem::separator(app)?,
        &item(app, "cleanUp", "Clean Up", Some("CmdOrCtrl+K"))?,
        &PredefinedMenuItem::separator(app)?,
        &PredefinedMenuItem::close_window(app, None)?,
    ])?;

    let edit = Submenu::with_items(app, "Edit", true, &[
        &item(app, "undo", "Undo", Some("CmdOrCtrl+Z"))?,
        &item(app, "redo", "Redo", Some("CmdOrCtrl+Shift+Z"))?,
        &PredefinedMenuItem::separator(app)?,
        &PredefinedMenuItem::cut(app, None)?,
        &PredefinedMenuItem::copy(app, None)?,
        &PredefinedMenuItem::paste(app, None)?,
        &item(app, "selectAll", "Select All", Some("CmdOrCtrl+A"))?,
        &PredefinedMenuItem::separator(app)?,
        &item(app, "delete", "Delete", None)?,
        &item(app, "duplicate", "Duplicate", Some("CmdOrCtrl+D"))?,
        &PredefinedMenuItem::separator(app)?,
        &item(app, "editNote", "Edit Note", Some("CmdOrCtrl+'"))?,
        &item(app, "find", "Find…", Some("CmdOrCtrl+Alt+F"))?,
    ])?;

    let view = Submenu::with_items(app, "View", true, &[
        &item(app, "toggleSidebar", "Show/Hide Sidebar", Some("CmdOrCtrl+Alt+S"))?,
        &item(app, "toggleInspector", "Show/Hide Inspector", Some("CmdOrCtrl+Alt+I"))?,
        &item(app, "viewOptions", "Show View Options", Some("CmdOrCtrl+Shift+V"))?,
        &PredefinedMenuItem::separator(app)?,
        &item(app, "expandAll", "Expand All", Some("Ctrl+CmdOrCtrl+9"))?,
        &item(app, "collapseAll", "Collapse All", Some("Ctrl+CmdOrCtrl+0"))?,
        &PredefinedMenuItem::separator(app)?,
        &item(app, "goBack", "Go Back", Some("CmdOrCtrl+["))?,
        &item(app, "goForward", "Go Forward", Some("CmdOrCtrl+]"))?,
        &PredefinedMenuItem::separator(app)?,
        &item(app, "focus", "Focus", Some("CmdOrCtrl+Shift+F"))?,
        &item(app, "unfocus", "Unfocus", Some("CmdOrCtrl+Shift+U"))?,
        &PredefinedMenuItem::separator(app)?,
        &PredefinedMenuItem::fullscreen(app, None)?,
    ])?;

    let organize = Submenu::with_items(app, "Organize", true, &[
        &item(app, "complete", "Complete", Some("Space"))?,
        &item(app, "flag", "Flag / Unflag", Some("CmdOrCtrl+Shift+L"))?,
        &item(app, "drop", "Drop", None)?,
        &PredefinedMenuItem::separator(app)?,
        &item(app, "indent", "Indent", Some("CmdOrCtrl+]"))?,
        &item(app, "outdent", "Outdent", Some("CmdOrCtrl+["))?,
        &item(app, "moveUp", "Move Up", Some("Ctrl+CmdOrCtrl+Up"))?,
        &item(app, "moveDown", "Move Down", Some("Ctrl+CmdOrCtrl+Down"))?,
        &PredefinedMenuItem::separator(app)?,
        &item(app, "convertToProject", "Convert to Project", Some("CmdOrCtrl+!"))?,
        &item(app, "markReviewed", "Mark Reviewed", Some("CmdOrCtrl+Shift+R"))?,
    ])?;

    let perspectives = Submenu::with_items(app, "Perspectives", true, &[
        &item(app, "p:inbox", "Inbox", Some("CmdOrCtrl+1"))?,
        &item(app, "p:projects", "Projects", Some("CmdOrCtrl+2"))?,
        &item(app, "p:tags", "Tags", Some("CmdOrCtrl+3"))?,
        &item(app, "p:forecast", "Forecast", Some("CmdOrCtrl+4"))?,
        &item(app, "p:flagged", "Flagged", Some("CmdOrCtrl+5"))?,
        &item(app, "p:nearby", "Nearby", Some("CmdOrCtrl+6"))?,
        &item(app, "p:review", "Review", Some("CmdOrCtrl+7"))?,
    ])?;

    let window = Submenu::with_items(app, "Window", true, &[
        &PredefinedMenuItem::minimize(app, None)?,
        &PredefinedMenuItem::maximize(app, None)?,
        &PredefinedMenuItem::separator(app)?,
        &PredefinedMenuItem::close_window(app, None)?,
    ])?;

    let help = Submenu::with_items(app, "Help", true, &[
        &item(app, "help", "Keyboard Shortcuts", None)?,
        &item(app, "resetTutorial", "Restore Tutorial Database", None)?,
    ])?;

    let menu = Menu::with_items(app, &[&app_menu, &file, &edit, &view, &organize, &perspectives, &window, &help])?;
    app.set_menu(menu)?;
    app.on_menu_event(|app, event| {
        let _ = app.emit("menu", event.id().0.clone());
    });
    Ok(())
}
