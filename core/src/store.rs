//! The store: owns the database, derived state, undo stacks
//! and file persistence. The Tauri / wasm shells are thin layers over this object (see `bridge.rs`).
use serde::{Deserialize, Serialize};
use crate::dates::now_ms;
use crate::derive::*;
use crate::model::*;
use crate::repeat::{advance_review, next_occurrence, Dates as RepeatDates};
use crate::rows::*;
use crate::seed::*;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum StoreError {
    Io(String),
    Parse(String),
    UnsupportedVersion(u32),
    NotFound(String),
}

impl std::fmt::Display for StoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StoreError::Io(e) => write!(f, "I/O error: {}", e),
            StoreError::Parse(e) => write!(f, "Parse error: {}", e),
            StoreError::UnsupportedVersion(v) => write!(f, "Unsupported database version {}", v),
            StoreError::NotFound(id) => write!(f, "No item with id {}", id),
        }
    }
}
impl std::error::Error for StoreError {}


/// Everything needed to create a task (Quick Entry, forecast + button).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewTaskSpec {
    pub name: String,
    pub note: String,
    /// parent task id; takes precedence over project
    pub parent: Option<Id>,
    /// insert after this sibling id
    pub after: Option<Id>,
    /// assign to a project (becomes a root task of it)
    pub project: Option<Id>,
    pub tag_ids: Vec<Id>,
    pub flagged: bool,
    pub defer_date: Option<i64>,
    pub planned_date: Option<i64>,
    pub due_date: Option<i64>,
    pub estimated_minutes: Option<u32>,
    pub repetition: Option<RepetitionRule>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagListEntry {
    pub tag: Tag,
    pub depth: u32,
    pub effective_status: TagStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectListEntry {
    pub project: Project,
    pub folder_path: String,
    pub info: ProjectInfo,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SearchResultKind {
    Folder,
    Project,
    Tag,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub kind: SearchResultKind,
    pub id: Id,
    pub name: String,
    pub sub: String,
}

struct Inner {
    db: Database,
    undo: Vec<Database>,
    redo: Vec<Database>,
}


pub struct Store {
    inner: Mutex<Inner>,
    revision: std::sync::atomic::AtomicU64,
    /// None = in-memory (tests / previews)
    path: Option<PathBuf>,
}

fn load_from(path: &PathBuf) -> Option<Database> {
    let raw = std::fs::read_to_string(path).ok()?;
    let db: Database = serde_json::from_str(&raw).ok()?;
    if db.version != 1 {
        return None;
    }
    Some(db)
}

impl Store {
    /// Open (or create) the database file at `path`. Seeds the tutorial
    /// database on first launch.
    pub fn open(path: String) -> Result<Arc<Self>, StoreError> {
        let pb = PathBuf::from(&path);
        let db = match load_from(&pb) {
            Some(db) => db,
            None => {
                let db = seed_database();
                let json = serde_json::to_string_pretty(&db).map_err(|e| StoreError::Parse(e.to_string()))?;
                if let Some(parent) = pb.parent() {
                    std::fs::create_dir_all(parent).map_err(|e| StoreError::Io(e.to_string()))?;
                }
                std::fs::write(&pb, json).map_err(|e| StoreError::Io(e.to_string()))?;
                db
            }
        };
        Ok(Arc::new(Self { inner: Mutex::new(Inner { db, undo: Vec::new(), redo: Vec::new() }), revision: std::sync::atomic::AtomicU64::new(0), path: Some(pb) }))
    }

    /// In-memory store: tutorial content when `seed` is true, else empty.
    pub fn in_memory(seed: bool) -> Arc<Self> {
        let db = if seed { seed_database() } else { Database::empty() };
        Arc::new(Self { inner: Mutex::new(Inner { db, undo: Vec::new(), redo: Vec::new() }), revision: std::sync::atomic::AtomicU64::new(0), path: None })
    }

    // ---------------- queries ----------------

    pub fn content(&self, search: String) -> ContentModel {
        let inner = self.inner.lock().unwrap();
        let d = derive_all(&inner.db, now_ms());
        build_content(&inner.db, &d, &search)
    }

    pub fn sidebar(&self) -> SidebarModel {
        let inner = self.inner.lock().unwrap();
        let d = derive_all(&inner.db, now_ms());
        build_sidebar(&inner.db, &d)
    }

    pub fn badges(&self) -> Badges {
        let inner = self.inner.lock().unwrap();
        derive_all(&inner.db, now_ms()).badges
    }

    pub fn perspective(&self) -> Perspective {
        self.inner.lock().unwrap().db.ui.perspective
    }

    pub fn view_options(&self) -> ViewOptions {
        let inner = self.inner.lock().unwrap();
        inner.db.view_options(inner.db.ui.perspective)
    }

    pub fn settings(&self) -> Settings {
        self.inner.lock().unwrap().db.settings.clone()
    }

    pub fn forecast_selected_day(&self) -> Option<String> {
        self.inner.lock().unwrap().db.ui.forecast_selected_day.clone()
    }

    pub fn focus_ids(&self) -> Vec<String> {
        self.inner.lock().unwrap().db.ui.focus_ids.clone()
    }

    pub fn task(&self, id: String) -> Option<Task> {
        self.inner.lock().unwrap().db.tasks.get(&id).cloned()
    }
    pub fn project(&self, id: String) -> Option<Project> {
        self.inner.lock().unwrap().db.projects.get(&id).cloned()
    }
    pub fn tag(&self, id: String) -> Option<Tag> {
        self.inner.lock().unwrap().db.tags.get(&id).cloned()
    }
    pub fn folder(&self, id: String) -> Option<Folder> {
        self.inner.lock().unwrap().db.folders.get(&id).cloned()
    }

    pub fn task_info(&self, id: String) -> Option<TaskInfo> {
        let inner = self.inner.lock().unwrap();
        let d = derive_all(&inner.db, now_ms());
        d.task_info.get(&id).cloned()
    }
    pub fn project_info(&self, id: String) -> Option<ProjectInfo> {
        let inner = self.inner.lock().unwrap();
        let d = derive_all(&inner.db, now_ms());
        d.project_info.get(&id).cloned()
    }

    /// Ancestor names of a task, project first … parent task last.
    pub fn breadcrumb(&self, id: String) -> Vec<String> {
        let inner = self.inner.lock().unwrap();
        let mut out: Vec<String> = ancestors_of(&inner.db, &id)
            .iter()
            .filter_map(|a| inner.db.projects.get(a).map(|p| p.name.clone()).or_else(|| inner.db.tasks.get(a).map(|t| t.name.clone())))
            .collect();
        out.reverse();
        out
    }

    /// All tags in hierarchical order (for pickers).
    pub fn tag_list(&self) -> Vec<TagListEntry> {
        let inner = self.inner.lock().unwrap();
        let db = &inner.db;
        let mut children: HashMap<String, Vec<&Tag>> = HashMap::new();
        for t in db.tags.values() {
            children.entry(t.parent_id.clone().unwrap_or_else(|| "root".into())).or_default().push(t);
        }
        for v in children.values_mut() {
            v.sort_by(|a, b| a.rank.partial_cmp(&b.rank).unwrap_or(std::cmp::Ordering::Equal));
        }
        let mut out = Vec::new();
        fn walk(children: &HashMap<String, Vec<&Tag>>, parent: &str, depth: u32, out: &mut Vec<TagListEntry>, db: &Database) {
            if let Some(tags) = children.get(parent) {
                for t in tags {
                    let mut eff = t.status;
                    let mut cur = t.parent_id.clone();
                    while let Some(c) = cur {
                        match db.tags.get(&c) {
                            None => break,
                            Some(p) => {
                                if p.status == TagStatus::Dropped {
                                    eff = TagStatus::Dropped;
                                    break;
                                }
                                if p.status == TagStatus::OnHold && eff == TagStatus::Active {
                                    eff = TagStatus::OnHold;
                                }
                                cur = p.parent_id.clone();
                            }
                        }
                    }
                    out.push(TagListEntry { tag: (*t).clone(), depth, effective_status: eff });
                    walk(children, &t.id, depth + 1, out, db);
                }
            }
        }
        walk(&children, "root", 0, &mut out, db);
        out
    }

    /// All remaining projects in sidebar order (for pickers and Quick Open).
    pub fn project_list(&self) -> Vec<ProjectListEntry> {
        let inner = self.inner.lock().unwrap();
        let db = &inner.db;
        let d = derive_all(db, now_ms());
        let folder_path = |fid: &Option<Id>| -> String {
            let mut parts = Vec::new();
            let mut cur = fid.clone();
            while let Some(c) = cur {
                match db.folders.get(&c) {
                    None => break,
                    Some(f) => {
                        parts.push(f.name.clone());
                        cur = f.parent_id.clone();
                    }
                }
            }
            parts.reverse();
            parts.join(" : ")
        };
        let mut out = Vec::new();
        // depth-first over folders to mirror sidebar order
        fn collect(db: &Database, d: &Derived, folder_key: &str, out: &mut Vec<ProjectListEntry>, folder_path: &dyn Fn(&Option<Id>) -> String) {
            if let Some(projs) = d.projects_in_folder.get(folder_key) {
                for p in projs {
                    if let Some(info) = d.project_info.get(&p.id) {
                        out.push(ProjectListEntry { project: p.clone(), folder_path: folder_path(&p.folder_id), info: info.clone() });
                    }
                }
            }
            if let Some(folders) = d.folders_in.get(folder_key) {
                for f in folders {
                    collect(db, d, &f.id, out, folder_path);
                }
            }
        }
        collect(db, &d, "root", &mut out, &folder_path);
        out.into_iter().filter(|e| e.info.remaining).collect()
    }

    /// Quick Open: folders, projects and tags matching `q`.
    pub fn search_items(&self, q: String) -> Vec<SearchResult> {
        let inner = self.inner.lock().unwrap();
        let db = &inner.db;
        let lq = q.to_lowercase();
        let mut out = Vec::new();
        let mut folders: Vec<&Folder> = db.folders.values().collect();
        folders.sort_by(|a, b| a.rank.partial_cmp(&b.rank).unwrap_or(std::cmp::Ordering::Equal));
        for f in folders {
            if lq.is_empty() || f.name.to_lowercase().contains(&lq) {
                out.push(SearchResult { kind: SearchResultKind::Folder, id: f.id.clone(), name: f.name.clone(), sub: "Folder".into() });
            }
        }
        let mut projects: Vec<&Project> = db.projects.values().collect();
        projects.sort_by(|a, b| a.rank.partial_cmp(&b.rank).unwrap_or(std::cmp::Ordering::Equal));
        for p in projects {
            if lq.is_empty() || p.name.to_lowercase().contains(&lq) {
                out.push(SearchResult { kind: SearchResultKind::Project, id: p.id.clone(), name: p.name.clone(), sub: "Project".into() });
            }
        }
        let mut tags: Vec<&Tag> = db.tags.values().collect();
        tags.sort_by(|a, b| a.rank.partial_cmp(&b.rank).unwrap_or(std::cmp::Ordering::Equal));
        for t in tags {
            if lq.is_empty() || t.name.to_lowercase().contains(&lq) {
                out.push(SearchResult { kind: SearchResultKind::Tag, id: t.id.clone(), name: t.name.clone(), sub: "Tag".into() });
            }
        }
        out
    }

    // ---------------- UI state (persisted, not undoable) ----------------

    pub fn set_perspective(&self, p: Perspective) {
        self.ui_change(|db| {
            db.ui.perspective = p;
            db.ui.pinned_ids.clear();
        });
    }

    pub fn set_sidebar_selection(&self, ids: Vec<String>) {
        self.ui_change(|db| {
            db.ui.sidebar_selection.insert(db.ui.perspective.key().to_string(), ids);
            db.ui.pinned_ids.clear();
        });
    }

    pub fn set_collapsed(&self, key: String, collapsed: bool) {
        self.ui_change(|db| {
            db.ui.collapsed.insert(key, collapsed);
        });
    }

    /// Sidebar expansion uses "sb:"-prefixed keys; default is expanded.
    pub fn set_sidebar_expanded(&self, key: String, expanded: bool) {
        self.ui_change(|db| {
            db.ui.collapsed.insert(format!("sb:{}", key), !expanded);
        });
    }

    pub fn expand_all_sidebar(&self, expanded: bool) {
        self.ui_change(|db| {
            for id in db.folders.keys().chain(db.tags.keys()) {
                db.ui.collapsed.insert(format!("sb:{}", id), !expanded);
            }
        });
    }

    pub fn set_forecast_selected_day(&self, day: Option<String>) {
        self.ui_change(|db| {
            db.ui.forecast_selected_day = day;
        });
    }

    pub fn set_focus(&self, ids: Vec<String>) {
        self.ui_change(|db| {
            db.ui.focus_ids = ids;
        });
    }

    /// Clean Up (Cmd-K): compact completed rows kept visible.
    pub fn clean_up(&self) {
        self.ui_change(|db| {
            db.ui.pinned_ids.clear();
        });
    }

    /// Re-emit so time-dependent display (due soon / deferred) refreshes.
    pub fn tick(&self) {
        self.emit();
    }

    // ---------------- model mutations (undoable) ----------------

    pub fn set_view_options(&self, vo: ViewOptions) {
        self.mutate(|db| {
            db.view_options.insert(db.ui.perspective.key().to_string(), vo);
        });
    }

    pub fn update_settings(&self, s: Settings) {
        self.mutate(|db| db.settings = s);
    }

    pub fn rename(&self, id: String, name: String) {
        self.mutate(|db| {
            let now = now_ms();
            if let Some(t) = db.tasks.get_mut(&id) {
                t.name = name.clone();
                t.modified_at = now;
            } else if let Some(p) = db.projects.get_mut(&id) {
                p.name = name.clone();
                p.modified_at = now;
            } else if let Some(t) = db.tags.get_mut(&id) {
                t.name = name.clone();
                t.modified_at = now;
            } else if let Some(f) = db.folders.get_mut(&id) {
                f.name = name;
                f.modified_at = now;
            }
        });
    }

    pub fn set_note(&self, id: String, note: String) {
        self.mutate(|db| {
            let now = now_ms();
            if let Some(t) = db.tasks.get_mut(&id) {
                t.note = note.clone();
                t.modified_at = now;
            } else if let Some(p) = db.projects.get_mut(&id) {
                p.note = note.clone();
                p.modified_at = now;
            } else if let Some(t) = db.tags.get_mut(&id) {
                t.note = note.clone();
                t.modified_at = now;
            } else if let Some(f) = db.folders.get_mut(&id) {
                f.note = note;
                f.modified_at = now;
            }
        });
    }

    pub fn set_item_dates(&self, id: String, defer: Option<i64>, planned: Option<i64>, due: Option<i64>) {
        self.mutate(|db| {
            let now = now_ms();
            if let Some(t) = db.tasks.get_mut(&id) {
                t.defer_date = defer;
                t.planned_date = planned;
                t.due_date = due;
                t.modified_at = now;
            } else if let Some(p) = db.projects.get_mut(&id) {
                p.defer_date = defer;
                p.planned_date = planned;
                p.due_date = due;
                p.modified_at = now;
            }
        });
    }

    pub fn set_item_tags(&self, id: String, tag_ids: Vec<String>) {
        self.mutate(|db| {
            let now = now_ms();
            if let Some(t) = db.tasks.get_mut(&id) {
                t.tag_ids = tag_ids.clone();
                t.modified_at = now;
            } else if let Some(p) = db.projects.get_mut(&id) {
                p.tag_ids = tag_ids;
                p.modified_at = now;
            }
        });
    }

    pub fn add_tag_to_items(&self, ids: Vec<String>, tag_id: String) {
        self.mutate(|db| {
            for id in &ids {
                if let Some(t) = db.tasks.get_mut(id) {
                    if !t.tag_ids.contains(&tag_id) {
                        t.tag_ids.push(tag_id.clone());
                    }
                }
                if let Some(p) = db.projects.get_mut(id) {
                    if !p.tag_ids.contains(&tag_id) {
                        p.tag_ids.push(tag_id.clone());
                    }
                }
            }
        });
    }

    pub fn set_estimate(&self, id: String, minutes: Option<u32>) {
        self.mutate(|db| {
            if let Some(t) = db.tasks.get_mut(&id) {
                t.estimated_minutes = minutes;
            } else if let Some(p) = db.projects.get_mut(&id) {
                p.estimated_minutes = minutes;
            }
        });
    }

    pub fn set_repetition(&self, id: String, rule: Option<RepetitionRule>) {
        self.mutate(|db| {
            if let Some(t) = db.tasks.get_mut(&id) {
                t.repetition = rule;
            } else if let Some(p) = db.projects.get_mut(&id) {
                p.repetition = rule;
            }
        });
    }

    pub fn set_sequential(&self, id: String, sequential: bool) {
        self.mutate(|db| {
            if let Some(t) = db.tasks.get_mut(&id) {
                t.sequential = sequential;
            }
        });
    }

    pub fn set_completed_by_children(&self, id: String, v: bool) {
        self.mutate(|db| {
            if let Some(t) = db.tasks.get_mut(&id) {
                t.completed_by_children = v;
            } else if let Some(p) = db.projects.get_mut(&id) {
                p.completed_by_children = v;
            }
        });
    }

    pub fn toggle_flag(&self, ids: Vec<String>) {
        let all_flagged = {
            let inner = self.inner.lock().unwrap();
            ids.iter()
                .filter_map(|id| inner.db.tasks.get(id).map(|t| t.flagged).or_else(|| inner.db.projects.get(id).map(|p| p.flagged)))
                .all(|f| f)
        };
        self.mutate(|db| {
            for id in &ids {
                if let Some(t) = db.tasks.get_mut(id) {
                    t.flagged = !all_flagged;
                } else if let Some(p) = db.projects.get_mut(id) {
                    p.flagged = !all_flagged;
                }
            }
        });
    }

    /// Mark complete (creating the next repetition when applicable).
    /// Toggles back to incomplete if already complete.
    pub fn toggle_complete(&self, ids: Vec<String>) {
        let now = now_ms();
        self.mutate(|db| {
            pin(db, &ids);
            for id in &ids {
                if let Some(t) = db.tasks.get(id).cloned() {
                    if t.completed_at.is_some() {
                        if let Some(x) = db.tasks.get_mut(id) {
                            x.completed_at = None;
                            x.modified_at = now;
                        }
                        continue;
                    }
                    if let Some(x) = db.tasks.get_mut(id) {
                        x.completed_at = Some(now);
                        x.dropped_at = None;
                        x.modified_at = now;
                    }
                    if let Some(rule) = t.repetition.clone() {
                        let dates = next_occurrence(&rule, RepeatDates { defer: t.defer_date, planned: t.planned_date, due: t.due_date }, now);
                        let mut nt = make_task(&t.name, now);
                        nt.note = t.note.clone();
                        nt.parent_id = t.parent_id.clone();
                        nt.sequential = t.sequential;
                        nt.completed_by_children = t.completed_by_children;
                        nt.flagged = t.flagged;
                        nt.tag_ids = t.tag_ids.clone();
                        nt.defer_date = dates.defer;
                        nt.planned_date = dates.planned;
                        nt.due_date = dates.due;
                        nt.estimated_minutes = t.estimated_minutes;
                        nt.repetition = Some(rule);
                        nt.rank = t.rank + 0.5;
                        nt.created_at = now;
                        nt.modified_at = now;
                        db.tasks.insert(nt.id.clone(), nt);
                        // completed copy loses the repetition so it does not spawn again
                        if let Some(x) = db.tasks.get_mut(id) {
                            x.repetition = None;
                        }
                    }
                    // complete parent group/project when "completed by children"
                    if let Some(pid) = t.parent_id.clone() {
                        if let Some(parent) = db.tasks.get(&pid).cloned() {
                            if parent.completed_by_children {
                                let all_done = db.tasks.values().filter(|x| x.parent_id.as_ref() == Some(&pid)).all(|s| s.completed_at.is_some() || s.dropped_at.is_some());
                                if all_done {
                                    if let Some(x) = db.tasks.get_mut(&pid) {
                                        x.completed_at = Some(now);
                                    }
                                }
                            }
                        }
                        if let Some(proj) = db.projects.get(&pid).cloned() {
                            if proj.completed_by_children {
                                let all_done = db.tasks.values().filter(|x| x.parent_id.as_ref() == Some(&pid)).all(|s| s.completed_at.is_some() || s.dropped_at.is_some());
                                if all_done {
                                    if let Some(x) = db.projects.get_mut(&pid) {
                                        x.status = ProjectStatus::Done;
                                        x.completed_at = Some(now);
                                    }
                                }
                            }
                        }
                    }
                } else if let Some(p) = db.projects.get(id).cloned() {
                    let done = p.status == ProjectStatus::Done;
                    if let Some(x) = db.projects.get_mut(id) {
                        if done {
                            x.status = ProjectStatus::Active;
                            x.completed_at = None;
                        } else {
                            x.status = ProjectStatus::Done;
                            x.completed_at = Some(now);
                            x.dropped_at = None;
                        }
                        x.modified_at = now;
                    }
                }
            }
        });
    }

    /// Mark dropped (toggles; Option-Space in Focusd).
    pub fn drop_items(&self, ids: Vec<String>) {
        let now = now_ms();
        self.mutate(|db| {
            pin(db, &ids);
            for id in &ids {
                if let Some(t) = db.tasks.get(id).cloned() {
                    if let Some(x) = db.tasks.get_mut(id) {
                        x.dropped_at = if t.dropped_at.is_some() { None } else { Some(now) };
                        x.completed_at = None;
                        x.modified_at = now;
                    }
                } else if let Some(p) = db.projects.get(id).cloned() {
                    if let Some(x) = db.projects.get_mut(id) {
                        if p.status == ProjectStatus::Dropped {
                            x.status = ProjectStatus::Active;
                            x.dropped_at = None;
                        } else {
                            x.status = ProjectStatus::Dropped;
                            x.dropped_at = Some(now);
                        }
                        x.modified_at = now;
                    }
                }
            }
        });
    }

    pub fn set_project_status(&self, id: String, status: ProjectStatus) {
        let now = now_ms();
        self.mutate(|db| {
            if let Some(p) = db.projects.get_mut(&id) {
                if p.status != status {
                    p.status = status;
                    p.completed_at = if status == ProjectStatus::Done { Some(now) } else { None };
                    p.dropped_at = if status == ProjectStatus::Dropped { Some(now) } else { None };
                    p.modified_at = now;
                }
            }
        });
    }

    pub fn set_project_type(&self, id: String, t: ProjectType) {
        self.mutate(|db| {
            if let Some(p) = db.projects.get_mut(&id) {
                p.project_type = t;
            }
        });
    }

    pub fn set_review_interval(&self, id: String, iv: ReviewInterval) {
        self.mutate(|db| {
            if let Some(p) = db.projects.get_mut(&id) {
                p.review_interval = iv.clone();
                if let Some(last) = p.last_reviewed_at {
                    p.next_review_at = Some(advance_review(last, &iv));
                }
            }
        });
    }

    pub fn set_tag_status(&self, id: String, status: TagStatus) {
        self.mutate(|db| {
            if let Some(t) = db.tags.get_mut(&id) {
                t.status = status;
            }
        });
    }

    pub fn set_tag_allows_next_action(&self, id: String, v: bool) {
        self.mutate(|db| {
            if let Some(t) = db.tags.get_mut(&id) {
                t.allows_next_action = v;
            }
        });
    }

    pub fn set_folder_status(&self, id: String, status: FolderStatus) {
        self.mutate(|db| {
            if let Some(f) = db.folders.get_mut(&id) {
                f.status = status;
            }
        });
    }

    // ---------------- creation ----------------

    pub fn add_task(&self, spec: NewTaskSpec) -> String {
        let now = now_ms();
        let mut t = make_task(&spec.name, now);
        t.note = spec.note.clone();
        t.parent_id = spec.parent.clone().or_else(|| spec.project.clone());
        t.tag_ids = spec.tag_ids.clone();
        t.flagged = spec.flagged;
        t.defer_date = spec.defer_date;
        t.planned_date = spec.planned_date;
        t.due_date = spec.due_date;
        t.estimated_minutes = spec.estimated_minutes;
        t.repetition = spec.repetition.clone();
        let id = t.id.clone();
        self.mutate(|db| {
            t.rank = next_rank(db, t.parent_id.clone(), spec.after.clone());
            db.tasks.insert(t.id.clone(), t.clone());
        });
        id
    }

    pub fn add_project(&self, name: String, folder: Option<String>) -> String {
        let now = now_ms();
        let mut p = make_project(&name, now);
        p.folder_id = folder;
        let id = p.id.clone();
        self.mutate(|db| {
            p.rank = last_rank(db.projects.values().filter(|x| x.folder_id == p.folder_id).map(|x| x.rank));
            db.projects.insert(p.id.clone(), p.clone());
        });
        id
    }

    pub fn add_folder(&self, name: String, parent: Option<String>) -> String {
        let now = now_ms();
        let mut f = make_folder(&name, now);
        f.parent_id = parent;
        let id = f.id.clone();
        self.mutate(|db| {
            f.rank = last_rank(db.folders.values().filter(|x| x.parent_id == f.parent_id).map(|x| x.rank));
            db.folders.insert(f.id.clone(), f.clone());
        });
        id
    }

    pub fn add_tag(&self, name: String, parent: Option<String>) -> String {
        let now = now_ms();
        let mut t = make_tag(&name, now);
        t.parent_id = parent;
        let id = t.id.clone();
        self.mutate(|db| {
            t.rank = last_rank(db.tags.values().filter(|x| x.parent_id == t.parent_id).map(|x| x.rank));
            db.tags.insert(t.id.clone(), t.clone());
        });
        id
    }

    // ---------------- structure ----------------

    pub fn delete_items(&self, ids: Vec<String>) {
        self.mutate(|db| {
            let d = derive_all(db, now_ms());
            let mut del: Vec<Id> = Vec::new();
            for id in &ids {
                if db.tasks.contains_key(id) {
                    del.push(id.clone());
                    del.extend(descendant_task_ids(&d, id));
                } else if db.projects.contains_key(id) {
                    for k in descendant_task_ids(&d, id) {
                        del.push(k);
                    }
                    db.projects.remove(id);
                } else if db.tags.contains_key(id) {
                    let parent = db.tags.get(id).and_then(|t| t.parent_id.clone());
                    let kids: Vec<Id> = db.tags.values().filter(|t| t.parent_id.as_ref() == Some(id)).map(|t| t.id.clone()).collect();
                    for k in kids {
                        if let Some(x) = db.tags.get_mut(&k) {
                            x.parent_id = parent.clone();
                        }
                    }
                    db.tags.remove(id);
                    let task_ids: Vec<Id> = db.tasks.values().filter(|t| t.tag_ids.contains(id)).map(|t| t.id.clone()).collect();
                    for tid in task_ids {
                        if let Some(x) = db.tasks.get_mut(&tid) {
                            x.tag_ids.retain(|x| x != id);
                        }
                    }
                    let proj_ids: Vec<Id> = db.projects.values().filter(|p| p.tag_ids.contains(id)).map(|p| p.id.clone()).collect();
                    for pid in proj_ids {
                        if let Some(x) = db.projects.get_mut(&pid) {
                            x.tag_ids.retain(|x| x != id);
                        }
                    }
                } else if db.folders.contains_key(id) {
                    let parent = db.folders.get(id).and_then(|f| f.parent_id.clone());
                    let proj_ids: Vec<Id> = db.projects.values().filter(|p| p.folder_id.as_ref() == Some(id)).map(|p| p.id.clone()).collect();
                    for pid in proj_ids {
                        if let Some(x) = db.projects.get_mut(&pid) {
                            x.folder_id = parent.clone();
                        }
                    }
                    let kids: Vec<Id> = db.folders.values().filter(|f| f.parent_id.as_ref() == Some(id)).map(|f| f.id.clone()).collect();
                    for k in kids {
                        if let Some(x) = db.folders.get_mut(&k) {
                            x.parent_id = parent.clone();
                        }
                    }
                    db.folders.remove(id);
                }
            }
            for id in del {
                db.tasks.remove(&id);
            }
            db.ui.pinned_ids.retain(|x| !ids.contains(x));
        });
    }

    /// Move task(s) under a new parent (project/task/null=inbox) at the end,
    /// or after a sibling.
    pub fn move_tasks(&self, ids: Vec<String>, parent: Option<String>, after: Option<String>) {
        self.mutate(|db| {
            let mut prev = after;
            for id in &ids {
                if !db.tasks.contains_key(id) {
                    continue;
                }
                // prevent moving under own descendant
                let mut cur = parent.clone();
                let mut cycle = false;
                while let Some(c) = cur {
                    if &c == id {
                        cycle = true;
                        break;
                    }
                    cur = db.tasks.get(&c).and_then(|t| t.parent_id.clone());
                }
                if cycle {
                    continue;
                }
                let rank = next_rank(db, parent.clone(), prev.clone());
                if let Some(t) = db.tasks.get_mut(id) {
                    t.parent_id = parent.clone();
                    t.rank = rank;
                    t.modified_at = now_ms();
                }
                prev = Some(id.clone());
            }
        });
    }

    pub fn move_project(&self, id: String, folder: Option<String>, after: Option<String>) {
        self.mutate(|db| {
            if !db.projects.contains_key(&id) {
                return;
            }
            let mut siblings: Vec<(Id, f64)> = db.projects.values().filter(|x| x.folder_id == folder && x.id != id).map(|x| (x.id.clone(), x.rank)).collect();
            siblings.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));
            let rank = rank_after(&siblings, after);
            if let Some(p) = db.projects.get_mut(&id) {
                p.folder_id = folder;
                p.rank = rank;
            }
        });
    }

    pub fn move_tag(&self, id: String, parent: Option<String>, after: Option<String>) {
        self.mutate(|db| {
            // prevent cycles
            let mut cur = parent.clone();
            while let Some(c) = cur {
                if c == id {
                    return;
                }
                cur = db.tags.get(&c).and_then(|t| t.parent_id.clone());
            }
            if !db.tags.contains_key(&id) {
                return;
            }
            let mut siblings: Vec<(Id, f64)> = db.tags.values().filter(|x| x.parent_id == parent && x.id != id).map(|x| (x.id.clone(), x.rank)).collect();
            siblings.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));
            let rank = rank_after(&siblings, after);
            if let Some(t) = db.tags.get_mut(&id) {
                t.parent_id = parent;
                t.rank = rank;
            }
        });
    }

    pub fn move_folder(&self, id: String, parent: Option<String>, after: Option<String>) {
        self.mutate(|db| {
            let mut cur = parent.clone();
            while let Some(c) = cur {
                if c == id {
                    return;
                }
                cur = db.folders.get(&c).and_then(|f| f.parent_id.clone());
            }
            if !db.folders.contains_key(&id) {
                return;
            }
            let mut siblings: Vec<(Id, f64)> = db.folders.values().filter(|x| x.parent_id == parent && x.id != id).map(|x| (x.id.clone(), x.rank)).collect();
            siblings.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));
            let rank = rank_after(&siblings, after);
            if let Some(f) = db.folders.get_mut(&id) {
                f.parent_id = parent;
                f.rank = rank;
            }
        });
    }

    /// Indent: make each task the last child of its previous sibling (Cmd-]).
    pub fn indent(&self, ids: Vec<String>) {
        self.mutate(|db| {
            for id in &ids {
                let t = match db.tasks.get(id) {
                    Some(t) => t.clone(),
                    None => continue,
                };
                let mut siblings: Vec<&Task> = db.tasks.values().filter(|x| x.parent_id == t.parent_id && x.id != *id).collect();
                siblings.sort_by(|a, b| a.rank.partial_cmp(&b.rank).unwrap_or(std::cmp::Ordering::Equal));
                let prev = siblings.iter().filter(|s| s.rank < t.rank).last().map(|s| s.id.clone());
                if let Some(new_parent) = prev {
                    let rank = next_rank(db, Some(new_parent.clone()), None);
                    if let Some(x) = db.tasks.get_mut(id) {
                        x.parent_id = Some(new_parent.clone());
                        x.rank = rank;
                        x.modified_at = now_ms();
                    }
                    db.ui.collapsed.insert(new_parent, false);
                }
            }
        });
    }

    /// Outdent: move a task after its parent, under the grandparent (Cmd-[).
    pub fn outdent(&self, ids: Vec<String>) {
        self.mutate(|db| {
            for id in &ids {
                let t = match db.tasks.get(id) {
                    Some(t) => t.clone(),
                    None => continue,
                };
                let parent_id = match t.parent_id {
                    Some(p) => p,
                    None => continue,
                };
                // only when the parent is a task (cannot outdent out of a project)
                let parent = match db.tasks.get(&parent_id) {
                    Some(p) => p.clone(),
                    None => continue,
                };
                let grand = parent.parent_id.clone();
                let rank = next_rank(db, grand.clone(), Some(parent_id));
                if let Some(x) = db.tasks.get_mut(id) {
                    x.parent_id = grand;
                    x.rank = rank;
                    x.modified_at = now_ms();
                }
            }
        });
    }

    /// Move tasks to a project root (or the inbox when None), at the end.
    pub fn assign_project(&self, ids: Vec<String>, project: Option<String>) {
        self.move_tasks(ids, project, None);
    }

    pub fn mark_reviewed(&self, ids: Vec<String>) {
        let now = now_ms();
        self.mutate(|db| {
            for id in &ids {
                if let Some(p) = db.projects.get_mut(id) {
                    p.last_reviewed_at = Some(now);
                    p.next_review_at = Some(advance_review(now, &p.review_interval));
                    p.modified_at = now;
                }
            }
        });
    }

    // ---------------- undo / persistence ----------------

    pub fn undo(&self) -> bool {
        let mut inner = self.inner.lock().unwrap();
        let Some(prev) = inner.undo.pop() else { return false };
        let current = inner.db.clone();
        inner.redo.push(current);
        let ui = inner.db.ui.clone();
        inner.db = prev;
        inner.db.ui = ui;
        drop(inner);
        self.save();
        self.emit();
        true
    }

    pub fn redo(&self) -> bool {
        let mut inner = self.inner.lock().unwrap();
        let Some(next) = inner.redo.pop() else { return false };
        let current = inner.db.clone();
        inner.undo.push(current);
        let ui = inner.db.ui.clone();
        inner.db = next;
        inner.db.ui = ui;
        drop(inner);
        self.save();
        self.emit();
        true
    }

    pub fn can_undo(&self) -> bool {
        !self.inner.lock().unwrap().undo.is_empty()
    }
    pub fn can_redo(&self) -> bool {
        !self.inner.lock().unwrap().redo.is_empty()
    }

    pub fn reset_to_tutorial(&self) {
        self.mutate(|db| *db = seed_database());
    }

    pub fn reset_empty(&self) {
        self.mutate(|db| *db = Database::empty());
    }

    pub fn export_json(&self) -> String {
        let inner = self.inner.lock().unwrap();
        serde_json::to_string_pretty(&inner.db).unwrap_or_default()
    }

    pub fn import_json(&self, text: String) -> Result<(), StoreError> {
        let parsed: Database = serde_json::from_str(&text).map_err(|e| StoreError::Parse(e.to_string()))?;
        if parsed.version != 1 {
            return Err(StoreError::UnsupportedVersion(parsed.version));
        }
        self.mutate(|db| *db = parsed);
        Ok(())
    }
}

fn pin(db: &mut Database, ids: &[String]) {
    for id in ids {
        if !db.ui.pinned_ids.contains(id) {
            db.ui.pinned_ids.push(id.clone());
        }
    }
}

fn last_rank<I: Iterator<Item = f64>>(ranks: I) -> f64 {
    ranks.fold(0.0f64, f64::max) + 1000.0
}

fn next_rank(db: &Database, parent: Option<Id>, after: Option<Id>) -> f64 {
    let mut siblings: Vec<&Task> = db.tasks.values().filter(|t| t.parent_id == parent).collect();
    siblings.sort_by(|a, b| a.rank.partial_cmp(&b.rank).unwrap_or(std::cmp::Ordering::Equal));
    if let Some(after) = after {
        if let Some(idx) = siblings.iter().position(|s| s.id == after) {
            let a = siblings[idx].rank;
            return match siblings.get(idx + 1) {
                Some(b) => (a + b.rank) / 2.0,
                None => a + 1000.0,
            };
        }
    }
    siblings.last().map(|s| s.rank + 1000.0).unwrap_or(1000.0)
}

/// Rank placing the item after `after` within sorted `siblings` (id, rank).
fn rank_after(siblings: &[(Id, f64)], after: Option<Id>) -> f64 {
    if let Some(after) = after {
        if let Some(i) = siblings.iter().position(|(id, _)| *id == after) {
            let a = siblings[i].1;
            return match siblings.get(i + 1) {
                Some((_, b)) => (a + b) / 2.0,
                None => a + 1000.0,
            };
        }
    }
    siblings.last().map(|(_, r)| r + 1000.0).unwrap_or(1000.0)
}

impl Store {
    fn emit(&self) {
        self.revision.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    }

    /// Monotonic counter bumped on every change; shells poll/compare it to
    /// know when to refresh their snapshot and persist.
    pub fn revision(&self) -> u64 {
        self.revision.load(std::sync::atomic::Ordering::SeqCst)
    }

    fn save(&self) {
        let Some(path) = &self.path else { return };
        let inner = self.inner.lock().unwrap();
        if let Ok(json) = serde_json::to_string_pretty(&inner.db) {
            let tmp = path.with_extension("tmp");
            if std::fs::write(&tmp, json).is_ok() {
                let _ = std::fs::rename(&tmp, path);
            }
        }
    }

    /// UI-only change: not undoable, persisted.
    fn ui_change(&self, f: impl FnOnce(&mut Database)) {
        {
            let mut inner = self.inner.lock().unwrap();
            f(&mut inner.db);
        }
        self.save();
        self.emit();
    }

    /// Model change: undoable.
    fn mutate(&self, f: impl FnOnce(&mut Database)) {
        {
            let mut inner = self.inner.lock().unwrap();
            let before = inner.db.clone();
            f(&mut inner.db);
            inner.undo.push(before);
            if inner.undo.len() > 200 {
                inner.undo.remove(0);
            }
            inner.redo.clear();
        }
        self.save();
        self.emit();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dates::{add_days, day_key, start_of_day};

    fn row_ids(m: &ContentModel) -> Vec<String> {
        m.rows.iter().filter_map(|r| r.item_id().cloned()).collect()
    }

    #[test]
    fn seed_has_tutorial_project_and_tags() {
        let s = Store::in_memory(true);
        let inbox = s.content("".into());
        assert_eq!(inbox.title, "Inbox");
        assert_eq!(inbox.action_count, 0);
        s.set_perspective(Perspective::Projects);
        let c = s.content("".into());
        assert!(c.rows.iter().any(|r| matches!(r, RowData::Project(p) if p.project.name.contains("Get to know Focusd"))));
        assert_eq!(s.tag_list().len(), 12);
    }

    #[test]
    fn complete_with_repetition_spawns_next() {
        let s = Store::in_memory(false);
        let rule = RepetitionRule { every: 1, unit: RepeatUnit::Day, method: RepeatMethod::Fixed, weekdays: vec![] };
        let now = now_ms();
        let id = s.add_task(NewTaskSpec { name: "Water plants".into(), note: String::new(), parent: None, after: None, project: None, tag_ids: vec![], flagged: false, defer_date: None, planned_date: None, due_date: Some(now), estimated_minutes: None, repetition: Some(rule) });
        s.toggle_complete(vec![id.clone()]);
        let orig = s.task(id).unwrap();
        assert!(orig.completed_at.is_some());
        assert!(orig.repetition.is_none());
        let tasks: Vec<Task> = { let inner = s.inner.lock().unwrap(); inner.db.tasks.values().cloned().collect() };
        let next = tasks.iter().find(|t| t.completed_at.is_none()).expect("next occurrence");
        assert_eq!(day_key(next.due_date.unwrap()), day_key(add_days(now, 1)));
        assert!(next.repetition.is_some());
    }

    #[test]
    fn sequential_project_blocks_second_action() {
        let s = Store::in_memory(false);
        let pid = s.add_project("Seq".into(), None);
        s.set_project_type(pid.clone(), ProjectType::Sequential);
        let a = s.add_task(NewTaskSpec { name: "first".into(), note: String::new(), parent: None, after: None, project: Some(pid.clone()), tag_ids: vec![], flagged: false, defer_date: None, planned_date: None, due_date: None, estimated_minutes: None, repetition: None });
        let b = s.add_task(NewTaskSpec { name: "second".into(), note: String::new(), parent: None, after: Some(a.clone()), project: Some(pid.clone()), tag_ids: vec![], flagged: false, defer_date: None, planned_date: None, due_date: None, estimated_minutes: None, repetition: None });
        let ia = s.task_info(a.clone()).unwrap();
        let ib = s.task_info(b.clone()).unwrap();
        assert!(ia.available && ia.is_next);
        assert!(!ib.available && ib.blocked);
        s.toggle_complete(vec![a]);
        assert!(s.task_info(b).unwrap().available);
    }

    #[test]
    fn group_greys_until_children_done_and_completed_by_children() {
        let s = Store::in_memory(false);
        let pid = s.add_project("P".into(), None);
        let g = s.add_task(NewTaskSpec { name: "group".into(), note: String::new(), parent: None, after: None, project: Some(pid.clone()), tag_ids: vec![], flagged: false, defer_date: None, planned_date: None, due_date: None, estimated_minutes: None, repetition: None });
        s.set_completed_by_children(g.clone(), true);
        let c = s.add_task(NewTaskSpec { name: "child".into(), note: String::new(), parent: Some(g.clone()), after: None, project: None, tag_ids: vec![], flagged: false, defer_date: None, planned_date: None, due_date: None, estimated_minutes: None, repetition: None });
        assert!(!s.task_info(g.clone()).unwrap().available, "group with open child is not available");
        s.toggle_complete(vec![c]);
        assert!(s.task_info(g.clone()).unwrap().effective_completed, "completed-by-children group auto-completes");
    }

    #[test]
    fn indent_outdent_moves_between_levels() {
        let s = Store::in_memory(false);
        let pid = s.add_project("P".into(), None);
        let spec = |name: &str, after: Option<String>| NewTaskSpec { name: name.into(), note: String::new(), parent: None, after, project: Some(pid.clone()), tag_ids: vec![], flagged: false, defer_date: None, planned_date: None, due_date: None, estimated_minutes: None, repetition: None };
        let a = s.add_task(spec("a", None));
        let b = s.add_task(spec("b", Some(a.clone())));
        s.indent(vec![b.clone()]);
        assert_eq!(s.task(b.clone()).unwrap().parent_id, Some(a.clone()));
        s.outdent(vec![b.clone()]);
        assert_eq!(s.task(b.clone()).unwrap().parent_id, Some(pid.clone()));
        let info_a = s.task_info(a.clone()).unwrap();
        let info_b = s.task_info(b.clone()).unwrap();
        assert!(info_a.task.rank < info_b.task.rank, "outdented task lands after its old parent");
    }

    #[test]
    fn delete_project_cascades_and_undo_restores() {
        let s = Store::in_memory(false);
        let pid = s.add_project("P".into(), None);
        let t = s.add_task(NewTaskSpec { name: "x".into(), note: String::new(), parent: None, after: None, project: Some(pid.clone()), tag_ids: vec![], flagged: false, defer_date: None, planned_date: None, due_date: None, estimated_minutes: None, repetition: None });
        s.delete_items(vec![pid.clone()]);
        assert!(s.project(pid.clone()).is_none());
        assert!(s.task(t.clone()).is_none());
        assert!(s.undo());
        assert!(s.project(pid.clone()).is_some());
        assert!(s.task(t).is_some());
        assert!(s.redo());
        assert!(s.project(pid.clone()).is_none(), "redo deletes again");
        let remaining = { let inner = s.inner.lock().unwrap(); inner.db.projects.len() };
        assert_eq!(remaining, 0);
    }

    #[test]
    fn forecast_buckets_due_today() {
        let s = Store::in_memory(false);
        let now = now_ms();
        let id = s.add_task(NewTaskSpec { name: "due today".into(), note: String::new(), parent: None, after: None, project: None, tag_ids: vec![], flagged: false, defer_date: None, planned_date: None, due_date: Some(now), estimated_minutes: None, repetition: None });
        s.set_perspective(Perspective::Forecast);
        let sb = s.sidebar();
        let fm = sb.forecast.unwrap();
        let today_key = day_key(start_of_day(now));
        let today_items = fm.items.get(&today_key).unwrap();
        assert!(today_items.iter().any(|x| x.id() == &id));
        let today = fm.days.iter().find(|d| d.key == today_key).unwrap();
        assert_eq!(today.count, 1);
        let c = s.content("".into());
        assert!(row_ids(&c).contains(&id));
    }

    #[test]
    fn review_marks_and_advances() {
        let s = Store::in_memory(false);
        let pid = s.add_project("P".into(), None);
        let before = s.project(pid.clone()).unwrap().next_review_at.unwrap();
        s.set_review_interval(pid.clone(), ReviewInterval { steps: 2, unit: ReviewUnit::Week });
        let after_interval_change = s.project(pid.clone()).unwrap().next_review_at.unwrap();
        assert!(after_interval_change > before, "interval change reschedules from last review");
        s.mark_reviewed(vec![pid.clone()]);
        let after = s.project(pid).unwrap();
        let last = after.last_reviewed_at.unwrap();
        let next = after.next_review_at.unwrap();
        assert_eq!(day_key(next), day_key(crate::dates::add_weeks(last, 2)), "next review = last reviewed + interval");
        s.set_perspective(Perspective::Review);
        let c = s.content("".into());
        assert_eq!(c.review_total, 1);
        assert_eq!(c.review_index, Some(1));
    }

    #[test]
    fn clean_up_unpins_completed() {
        let s = Store::in_memory(false);
        let id = s.add_task(NewTaskSpec { name: "x".into(), note: String::new(), parent: None, after: None, project: None, tag_ids: vec![], flagged: false, defer_date: None, planned_date: None, due_date: None, estimated_minutes: None, repetition: None });
        s.toggle_complete(vec![id.clone()]);
        // completed item stays visible (pinned) under "remaining"
        let c = s.content("".into());
        assert!(row_ids(&c).contains(&id));
        s.clean_up();
        let c = s.content("".into());
        assert!(!row_ids(&c).contains(&id));
    }

    #[test]
    fn persistence_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("db.json").to_string_lossy().to_string();
        let id;
        {
            let s = Store::open(path.clone()).unwrap();
            id = s.add_task(NewTaskSpec { name: "persist me".into(), note: String::new(), parent: None, after: None, project: None, tag_ids: vec![], flagged: false, defer_date: None, planned_date: None, due_date: None, estimated_minutes: None, repetition: None });
        }
        let s2 = Store::open(path).unwrap();
        assert_eq!(s2.task(id).unwrap().name, "persist me");
        // tutorial seed was written on first open
        assert!(s2.project_list().iter().any(|p| p.project.name.contains("Get to know Focusd")));
    }

    #[test]
    fn tag_on_hold_blocks_and_hides_from_available() {
        let s = Store::in_memory(false);
        let tag = s.add_tag("Waiting".into(), None);
        s.set_tag_status(tag.clone(), TagStatus::OnHold);
        let id = s.add_task(NewTaskSpec { name: "x".into(), note: String::new(), parent: None, after: None, project: None, tag_ids: vec![tag], flagged: false, defer_date: None, planned_date: None, due_date: None, estimated_minutes: None, repetition: None });
        let info = s.task_info(id).unwrap();
        assert!(!info.available && info.blocked && info.on_hold);
    }
}
