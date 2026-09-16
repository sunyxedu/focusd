//! JSON dispatch layer shared by every shell (Tauri desktop/mobile, wasm web).
//!
//! The UI calls `dispatch(store, method, args)` where `args` is a JSON object
//! keyed by parameter name. Every `Store` method is reachable here, plus the
//! date helpers the UI needs, so shells never contain behaviour of their own.
use crate::dates::*;
use crate::model::*;
use crate::rows::*;
use crate::repeat::describe_rule;
use crate::store::*;
use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;

fn arg<T: DeserializeOwned>(args: &Value, key: &str) -> Result<T, String> {
    let v = args.get(key).cloned().unwrap_or(Value::Null);
    serde_json::from_value(v).map_err(|e| format!("bad argument `{}`: {}", key, e))
}

fn opt<T: DeserializeOwned>(args: &Value, key: &str) -> Result<Option<T>, String> {
    match args.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(v) => serde_json::from_value(v.clone()).map(Some).map_err(|e| format!("bad argument `{}`: {}", key, e)),
    }
}

fn ok<T: Serialize>(v: T) -> Result<Value, String> {
    serde_json::to_value(v).map_err(|e| e.to_string())
}

/// A full UI snapshot: everything the shell needs to render one frame.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub revision: u64,
    pub perspective: Perspective,
    pub content: ContentModel,
    pub sidebar: SidebarModel,
    pub badges: crate::derive::Badges,
    pub view_options: ViewOptions,
    pub settings: Settings,
    pub focus_ids: Vec<Id>,
    pub focus_label: String,
    pub can_undo: bool,
    pub can_redo: bool,
    pub now: i64,
    /// Raw entities so the UI can look anything up by id without a call.
    pub tasks: HashMap<Id, Task>,
    pub projects: HashMap<Id, Project>,
    pub folders: HashMap<Id, Folder>,
    pub tags: HashMap<Id, Tag>,
    pub tag_list: Vec<TagListEntry>,
    pub project_list: Vec<ProjectListEntry>,
    pub ui: UiState,
}

impl Store {
    pub fn snapshot(&self, search: &str) -> Snapshot {
        let focus_ids = self.focus_ids();
        let focus_label = focus_ids
            .iter()
            .filter_map(|id| self.project(id.clone()).map(|p| p.name).or_else(|| self.folder(id.clone()).map(|f| f.name)))
            .collect::<Vec<_>>()
            .join(", ");
        Snapshot {
            revision: self.revision(),
            perspective: self.perspective(),
            content: self.content(search.to_string()),
            sidebar: self.sidebar(),
            badges: self.badges(),
            view_options: self.view_options(),
            settings: self.settings(),
            focus_ids,
            focus_label,
            can_undo: self.can_undo(),
            can_redo: self.can_redo(),
            now: now_ms(),
            tasks: self.with_db(|db| db.tasks.clone()),
            projects: self.with_db(|db| db.projects.clone()),
            folders: self.with_db(|db| db.folders.clone()),
            tags: self.with_db(|db| db.tags.clone()),
            tag_list: self.tag_list(),
            project_list: self.project_list(),
            ui: self.with_db(|db| db.ui.clone()),
        }
    }
}

pub fn dispatch(store: &Store, method: &str, args: &Value) -> Result<Value, String> {
    let a = args;
    match method {
        // ---- snapshots / queries ----
        "snapshot" => ok(store.snapshot(&arg::<Option<String>>(a, "search")?.unwrap_or_default())),
        "revision" => ok(store.revision()),
        "content" => ok(store.content(arg::<Option<String>>(a, "search")?.unwrap_or_default())),
        "sidebar" => ok(store.sidebar()),
        "badges" => ok(store.badges()),
        "perspective" => ok(store.perspective()),
        "viewOptions" => ok(store.view_options()),
        "settings" => ok(store.settings()),
        "forecastSelectedDay" => ok(store.forecast_selected_day()),
        "focusIds" => ok(store.focus_ids()),
        "task" => ok(store.task(arg(a, "id")?)),
        "project" => ok(store.project(arg(a, "id")?)),
        "tag" => ok(store.tag(arg(a, "id")?)),
        "folder" => ok(store.folder(arg(a, "id")?)),
        "taskInfo" => ok(store.task_info(arg(a, "id")?)),
        "projectInfo" => ok(store.project_info(arg(a, "id")?)),
        "breadcrumb" => ok(store.breadcrumb(arg(a, "id")?)),
        "tagList" => ok(store.tag_list()),
        "projectList" => ok(store.project_list()),
        "searchItems" => ok(store.search_items(arg(a, "q")?)),
        "canUndo" => ok(store.can_undo()),
        "canRedo" => ok(store.can_redo()),
        "exportJson" => ok(store.export_json()),

        // ---- UI state (not undoable) ----
        "setPerspective" => ok(store.set_perspective(arg(a, "perspective")?)),
        "setSidebarSelection" => ok(store.set_sidebar_selection(arg(a, "ids")?)),
        "setCollapsed" => ok(store.set_collapsed(arg(a, "key")?, arg(a, "collapsed")?)),
        "setSidebarExpanded" => ok(store.set_sidebar_expanded(arg(a, "key")?, arg(a, "expanded")?)),
        "expandAllSidebar" => ok(store.expand_all_sidebar(arg(a, "expanded")?)),
        "setForecastSelectedDay" => ok(store.set_forecast_selected_day(opt(a, "day")?)),
        "setFocus" => ok(store.set_focus(arg(a, "ids")?)),
        "cleanUp" => ok(store.clean_up()),
        "tick" => ok(store.tick()),
        "setViewOptions" => ok(store.set_view_options(arg(a, "viewOptions")?)),
        "updateSettings" => ok(store.update_settings(arg(a, "settings")?)),

        // ---- mutations (undoable) ----
        "rename" => ok(store.rename(arg(a, "id")?, arg(a, "name")?)),
        "setNote" => ok(store.set_note(arg(a, "id")?, arg(a, "note")?)),
        "setItemDates" => ok(store.set_item_dates(arg(a, "id")?, opt(a, "defer")?, opt(a, "planned")?, opt(a, "due")?)),
        "setItemTags" => ok(store.set_item_tags(arg(a, "id")?, arg(a, "tagIds")?)),
        "addTagToItems" => ok(store.add_tag_to_items(arg(a, "ids")?, arg(a, "tagId")?)),
        "setEstimate" => ok(store.set_estimate(arg(a, "id")?, opt(a, "minutes")?)),
        "setRepetition" => ok(store.set_repetition(arg(a, "id")?, opt(a, "rule")?)),
        "setSequential" => ok(store.set_sequential(arg(a, "id")?, arg(a, "sequential")?)),
        "setCompletedByChildren" => ok(store.set_completed_by_children(arg(a, "id")?, arg(a, "value")?)),
        "toggleFlag" => ok(store.toggle_flag(arg(a, "ids")?)),
        "toggleComplete" => ok(store.toggle_complete(arg(a, "ids")?)),
        "dropItems" => ok(store.drop_items(arg(a, "ids")?)),
        "setProjectStatus" => ok(store.set_project_status(arg(a, "id")?, arg(a, "status")?)),
        "setProjectType" => ok(store.set_project_type(arg(a, "id")?, arg(a, "projectType")?)),
        "setReviewInterval" => ok(store.set_review_interval(arg(a, "id")?, arg(a, "interval")?)),
        "setTagStatus" => ok(store.set_tag_status(arg(a, "id")?, arg(a, "status")?)),
        "setTagAllowsNextAction" => ok(store.set_tag_allows_next_action(arg(a, "id")?, arg(a, "value")?)),
        "setFolderStatus" => ok(store.set_folder_status(arg(a, "id")?, arg(a, "status")?)),
        "addTask" => ok(store.add_task(arg(a, "spec")?)),
        "addProject" => ok(store.add_project(arg(a, "name")?, opt(a, "folder")?)),
        "addFolder" => ok(store.add_folder(arg(a, "name")?, opt(a, "parent")?)),
        "addTag" => ok(store.add_tag(arg(a, "name")?, opt(a, "parent")?)),
        "deleteItems" => ok(store.delete_items(arg(a, "ids")?)),
        "moveTasks" => ok(store.move_tasks(arg(a, "ids")?, opt(a, "parent")?, opt(a, "after")?)),
        "moveProject" => ok(store.move_project(arg(a, "id")?, opt(a, "folder")?, opt(a, "after")?)),
        "moveTag" => ok(store.move_tag(arg(a, "id")?, opt(a, "parent")?, opt(a, "after")?)),
        "moveFolder" => ok(store.move_folder(arg(a, "id")?, opt(a, "parent")?, opt(a, "after")?)),
        "indent" => ok(store.indent(arg(a, "ids")?)),
        "outdent" => ok(store.outdent(arg(a, "ids")?)),
        "assignProject" => ok(store.assign_project(arg(a, "ids")?, opt(a, "project")?)),
        "markReviewed" => ok(store.mark_reviewed(arg(a, "ids")?)),
        "duplicateItems" => ok(store.duplicate_items(arg(a, "ids")?)),
        "convertToProject" => ok(store.convert_to_project(arg(a, "id")?)),
        "setCalendarEvents" => ok(store.set_calendar_events(arg(a, "events")?)),
        "calendarEvents" => ok(store.calendar_events()),
        "dueBetween" => ok(store.due_between(arg(a, "from")?, arg(a, "to")?)),
        "undo" => ok(store.undo()),
        "redo" => ok(store.redo()),
        "resetToTutorial" => ok(store.reset_to_tutorial()),
        "resetEmpty" => ok(store.reset_empty()),
        "importJson" => store.import_json(arg(a, "text")?).map(|_| Value::Null).map_err(|e| e.to_string()),

        // ---- pure date helpers (so the UI never re-implements them) ----
        "now" => ok(now_ms()),
        "parseDate" => ok(parse_natural_date(&arg::<String>(a, "input")?, arg::<Option<u32>>(a, "defaultHour")?.unwrap_or(17), now_ms())),
        "parseDuration" => ok(parse_duration(&arg::<String>(a, "input")?)),
        "formatDuration" => ok(format_duration(arg(a, "minutes")?)),
        "relativeDateLabel" => ok(relative_date_label(arg(a, "ms")?, now_ms())),
        "relativeDateTimeLabel" => ok(relative_date_time_label(arg(a, "ms")?, now_ms())),
        "fullDateLabel" => ok(full_date_label(arg(a, "ms")?)),
        "longDateLabel" => ok(long_date_label(arg(a, "ms")?)),
        "timeLabel" => ok(time_label(arg(a, "ms")?)),
        "dayKey" => ok(day_key(arg(a, "ms")?)),
        "startOfDay" => ok(start_of_day(arg(a, "ms")?)),
        "addDays" => ok(add_days(arg(a, "ms")?, arg(a, "n")?)),
        "describeRepetition" => ok(describe_rule(&arg::<RepetitionRule>(a, "rule")?)),
        "version" => ok(json!({ "core": env!("CARGO_PKG_VERSION") })),
        _ => Err(format!("unknown method `{}`", method)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshot_roundtrip() {
        let store = Store::in_memory(true);
        let snap = dispatch(&store, "snapshot", &json!({})).unwrap();
        assert_eq!(snap["perspective"], "inbox");
        assert!(snap["sidebar"]["rows"].is_array());
        let id = dispatch(&store, "addTask", &json!({ "spec": {
            "name": "Buy milk", "note": "", "parent": null, "after": null, "project": null,
            "tagIds": [], "flagged": true, "deferDate": null, "plannedDate": null, "dueDate": null,
            "estimatedMinutes": null, "repetition": null } })).unwrap();
        let task = dispatch(&store, "task", &json!({ "id": id })).unwrap();
        assert_eq!(task["name"], "Buy milk");
        assert_eq!(task["flagged"], true);
        let snap = dispatch(&store, "snapshot", &json!({ "search": "" })).unwrap();
        assert_eq!(snap["badges"]["inbox"], 1);
        assert!(dispatch(&store, "nope", &json!({})).is_err());
    }
}
