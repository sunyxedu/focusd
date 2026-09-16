//! Builds the rows shown in the content outline for the current perspective,
//! applying view options, sidebar selection, focus, search and collapse state.
//! Also builds the sidebar model for each perspective.
use crate::dates::{add_days, day_key, end_of_day, long_date_label, start_of_day, weekday_short, day_of_month};
use crate::derive::*;
use crate::model::*;
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, uniffi::Record)]
pub struct TaskRow {
    pub key: String,
    pub id: Id,
    pub depth: u32,
    pub task: Task,
    pub info: TaskInfo,
    pub show_project: bool,
    pub flat: bool,
    pub collapsed: bool,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct ProjectRow {
    pub key: String,
    pub id: Id,
    pub depth: u32,
    pub project: Project,
    pub info: ProjectInfo,
    pub collapsed: bool,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct FolderRow {
    pub key: String,
    pub id: Id,
    pub depth: u32,
    pub folder: Folder,
    pub collapsed: bool,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct HeaderRow {
    pub key: String,
    pub id: Id,
    pub depth: u32,
    pub title: String,
    pub count: Option<u32>,
    pub sub: Option<String>,
    pub day_key: Option<String>,
    pub collapsed: bool,
}

#[derive(Debug, Clone, uniffi::Enum)]
pub enum RowData {
    Task(TaskRow),
    Project(ProjectRow),
    Folder(FolderRow),
    Header(HeaderRow),
}

impl RowData {
    pub fn key(&self) -> &str {
        match self {
            RowData::Task(r) => &r.key,
            RowData::Project(r) => &r.key,
            RowData::Folder(r) => &r.key,
            RowData::Header(r) => &r.key,
        }
    }
    pub fn item_id(&self) -> Option<&Id> {
        match self {
            RowData::Task(r) => Some(&r.id),
            RowData::Project(r) => Some(&r.id),
            RowData::Folder(r) => Some(&r.id),
            RowData::Header(_) => None,
        }
    }
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct ContentModel {
    pub rows: Vec<RowData>,
    pub title: String,
    pub subtitle: String,
    pub perspective: Perspective,
    pub empty_message: String,
    pub action_count: u32,
    pub project_count: u32,
    /// Review perspective: "Project 2 of 5" context
    pub review_index: Option<u32>,
    pub review_total: u32,
}

fn matches(q: &str, texts: &[&str]) -> bool {
    if q.is_empty() {
        return true;
    }
    let l = q.to_lowercase();
    texts.iter().any(|t| t.to_lowercase().contains(&l))
}

pub struct Ctx<'a> {
    pub db: &'a Database,
    pub d: &'a Derived,
    pub vo: ViewOptions,
    pub q: String,
    pub pinned: HashSet<Id>,
}

impl<'a> Ctx<'a> {
    fn avail_ok(&self, i: &TaskInfo) -> bool {
        if self.pinned.contains(&i.task.id) {
            return true;
        }
        match self.vo.availability {
            Availability::FirstAvailable => i.is_next,
            Availability::Available => i.available,
            Availability::Remaining => i.remaining,
            Availability::Everything => true,
        }
    }
    fn project_avail_ok(&self, p: &ProjectInfo) -> bool {
        if self.pinned.contains(&p.project.id) {
            return true;
        }
        match self.vo.availability {
            Availability::FirstAvailable | Availability::Available => p.available,
            Availability::Remaining => p.remaining,
            Availability::Everything => true,
        }
    }
    fn collapsed(&self, key: &str) -> bool {
        self.db.ui.collapsed.get(key).copied().unwrap_or(false)
    }
}

/// Nested task tree under a container, filtered by availability + search.
/// Keeps a matching item's ancestors. Returns number of visible tasks.
fn task_tree(ctx: &Ctx, parent_id: &Id, depth: u32, show_project: bool, out: &mut Vec<RowData>, key_prefix: &str) -> u32 {
    let mut n = 0;
    let kids = ctx.d.children_of.get(parent_id).cloned().unwrap_or_default();
    for t in &kids {
        let info = match ctx.d.task_info.get(&t.id) {
            Some(i) => i,
            None => continue,
        };
        let self_ok = ctx.avail_ok(info) && matches(&ctx.q, &[&t.name, &t.note]);
        let mut kids_rows: Vec<RowData> = Vec::new();
        let kids_n = task_tree(ctx, &t.id, depth + 1, show_project, &mut kids_rows, key_prefix);
        let group_visible = info.is_group && (kids_n > 0 || (self_ok && ctx.vo.availability != Availability::FirstAvailable));
        if self_ok || group_visible {
            let key = format!("{}{}", key_prefix, t.id);
            let collapsed = ctx.collapsed(&key);
            out.push(RowData::Task(TaskRow { key, id: t.id.clone(), depth, task: t.clone(), info: info.clone(), show_project, flat: false, collapsed }));
            n += 1;
            if !collapsed {
                out.extend(kids_rows);
            }
            n += kids_n;
        }
    }
    n
}

fn count_rows(rows: &[RowData]) -> (u32, u32) {
    let mut a = 0;
    let mut p = 0;
    for r in rows {
        match r {
            RowData::Task(_) => a += 1,
            RowData::Project(_) => p += 1,
            _ => {}
        }
    }
    (a, p)
}

fn summary(a: u32, p: u32, unit: &str) -> String {
    let mut parts = vec![format!("{} {}{}", a, unit, if a == 1 { "" } else { "s" })];
    if p > 0 {
        parts.push(format!("{} project{}", p, if p == 1 { "" } else { "s" }));
    }
    parts.join(", ")
}

pub fn build_content(db: &Database, d: &Derived, search: &str) -> ContentModel {
    let p = db.ui.perspective;
    let vo = db.view_options(p);
    let ctx = Ctx { db, d, vo, q: search.trim().to_string(), pinned: db.ui.pinned_ids.iter().cloned().collect() };
    let sel = db.sidebar_selection();
    match p {
        Perspective::Inbox => build_inbox(&ctx),
        Perspective::Projects => build_projects(&ctx, &sel),
        Perspective::Tags => build_tags(&ctx, &sel),
        Perspective::Forecast => build_forecast(&ctx),
        Perspective::Flagged => build_flagged(&ctx),
        Perspective::Review => build_review(&ctx, &sel),
        Perspective::Nearby => ContentModel {
            rows: vec![],
            title: "Nearby".into(),
            subtitle: String::new(),
            perspective: p,
            empty_message: "Nearby shows items with tags that have a location. Location services are not available in this build.".into(),
            action_count: 0,
            project_count: 0,
            review_index: None,
            review_total: 0,
        },
    }
}

fn base_model(p: Perspective, rows: Vec<RowData>, title: String, subtitle: String, empty: String) -> ContentModel {
    let (a, pr) = count_rows(&rows);
    ContentModel { rows, title, subtitle, perspective: p, empty_message: empty, action_count: a, project_count: pr, review_index: None, review_total: 0 }
}

fn build_inbox(ctx: &Ctx) -> ContentModel {
    let mut rows = Vec::new();
    for t in &ctx.d.inbox {
        let info = match ctx.d.task_info.get(&t.id) {
            Some(i) => i,
            None => continue,
        };
        let mut kids = Vec::new();
        let kn = task_tree(ctx, &t.id, 1, false, &mut kids, "");
        if (ctx.avail_ok(info) && matches(&ctx.q, &[&t.name, &t.note])) || kn > 0 {
            let collapsed = ctx.collapsed(&t.id);
            rows.push(RowData::Task(TaskRow { key: t.id.clone(), id: t.id.clone(), depth: 0, task: t.clone(), info: info.clone(), show_project: false, flat: false, collapsed }));
            if !collapsed {
                rows.extend(kids);
            }
        }
    }
    let (a, _) = count_rows(&rows);
    let subtitle = if a == 0 { "no items".into() } else { format!("{} inbox item{}", a, if a == 1 { "" } else { "s" }) };
    let empty = match ctx.vo.availability {
        Availability::Available => "No available items",
        Availability::Remaining => "No remaining items",
        _ => "No items",
    };
    base_model(Perspective::Inbox, rows, "Inbox".into(), subtitle, empty.into())
}

fn project_block(ctx: &Ctx, proj: &Project, depth: u32, rows: &mut Vec<RowData>) {
    let info = match ctx.d.project_info.get(&proj.id) {
        Some(i) => i,
        None => return,
    };
    let mut kids = Vec::new();
    let kn = task_tree(ctx, &proj.id, depth + 1, false, &mut kids, "");
    let self_ok = ctx.project_avail_ok(info) && matches(&ctx.q, &[&proj.name, &proj.note]);
    let visible = if !ctx.q.is_empty() {
        self_ok || kn > 0
    } else {
        self_ok || (ctx.vo.availability == Availability::Everything || (kn > 0 && info.remaining))
    };
    if visible {
        let collapsed = ctx.collapsed(&proj.id);
        rows.push(RowData::Project(ProjectRow { key: proj.id.clone(), id: proj.id.clone(), depth, project: proj.clone(), info: info.clone(), collapsed }));
        if !collapsed {
            rows.extend(kids);
        }
    }
}

fn folder_block(ctx: &Ctx, folder_id: &str, depth: u32, rows: &mut Vec<RowData>, show_folders: bool) {
    let folders = ctx.d.folders_in.get(folder_id).cloned().unwrap_or_default();
    for f in &folders {
        if f.status == FolderStatus::Dropped && ctx.vo.availability != Availability::Everything {
            continue;
        }
        let start = rows.len();
        if show_folders {
            rows.push(RowData::Folder(FolderRow { key: f.id.clone(), id: f.id.clone(), depth, folder: f.clone(), collapsed: ctx.collapsed(&f.id) }));
        }
        let inner = rows.len();
        if !(show_folders && ctx.collapsed(&f.id)) {
            folder_block(ctx, &f.id, if show_folders { depth + 1 } else { depth }, rows, show_folders);
            let projs = ctx.d.projects_in_folder.get(&f.id).cloned().unwrap_or_default();
            for p in &projs {
                project_block(ctx, p, if show_folders { depth + 1 } else { depth }, rows);
            }
        }
        if show_folders && rows.len() == inner && !ctx.q.is_empty() {
            rows.truncate(start);
        }
    }
}

fn build_projects(ctx: &Ctx, sel: &[Id]) -> ContentModel {
    let mut rows = Vec::new();
    let focus = &ctx.db.ui.focus_ids;
    let scope: Vec<Id> = if !sel.is_empty() { sel.to_vec() } else { focus.clone() };
    let show_folders = ctx.vo.show_folders_in_outline;
    if ctx.vo.show_inbox && scope.is_empty() {
        let mut inbox_rows = Vec::new();
        for t in &ctx.d.inbox {
            if let Some(info) = ctx.d.task_info.get(&t.id) {
                if ctx.avail_ok(info) && matches(&ctx.q, &[&t.name, &t.note]) {
                    inbox_rows.push(RowData::Task(TaskRow { key: t.id.clone(), id: t.id.clone(), depth: 1, task: t.clone(), info: info.clone(), show_project: false, flat: false, collapsed: false }));
                }
            }
        }
        if !inbox_rows.is_empty() || ctx.q.is_empty() {
            let n = inbox_rows.len() as u32;
            let collapsed = ctx.collapsed("__inbox");
            rows.push(RowData::Header(HeaderRow { key: "__inbox".into(), id: "__inbox".into(), depth: 0, title: "Inbox".into(), count: Some(n), sub: None, day_key: None, collapsed }));
            if !collapsed {
                rows.extend(inbox_rows);
            }
        }
    }
    if scope.is_empty() {
        folder_block(ctx, "root", 0, &mut rows, show_folders);
        let projs = ctx.d.projects_in_folder.get("root").cloned().unwrap_or_default();
        for p in &projs {
            project_block(ctx, p, 0, &mut rows);
        }
    } else {
        for id in &scope {
            if let Some(p) = ctx.db.projects.get(id).cloned() {
                project_block(ctx, &p, 0, &mut rows);
            } else if let Some(f) = ctx.db.folders.get(id).cloned() {
                let mut depth = 0;
                if show_folders {
                    let collapsed = ctx.collapsed(&f.id);
                    rows.push(RowData::Folder(FolderRow { key: f.id.clone(), id: f.id.clone(), depth: 0, folder: f.clone(), collapsed }));
                    if collapsed {
                        continue;
                    }
                    depth = 1;
                }
                folder_block(ctx, &f.id, depth, &mut rows, show_folders);
                let projs = ctx.d.projects_in_folder.get(&f.id).cloned().unwrap_or_default();
                for p in &projs {
                    project_block(ctx, p, depth, &mut rows);
                }
            }
        }
    }
    let (a, pr) = count_rows(&rows);
    let title = if scope.len() == 1 {
        ctx.db.projects.get(&scope[0]).map(|p| p.name.clone()).or_else(|| ctx.db.folders.get(&scope[0]).map(|f| f.name.clone())).filter(|n| !n.is_empty()).unwrap_or_else(|| "Projects".into())
    } else if scope.len() > 1 {
        format!("{} Items", scope.len())
    } else {
        "Projects".into()
    };
    let empty = match ctx.vo.availability {
        Availability::Available => "No available projects",
        Availability::Remaining => "No remaining projects",
        _ => "No projects",
    };
    base_model(Perspective::Projects, rows, title, summary(a, pr, "action"), empty.into())
}

fn sort_due_flag(a: &TaskInfo, b: &TaskInfo) -> std::cmp::Ordering {
    let ad = a.effective_due_date.unwrap_or(i64::MAX);
    let bd = b.effective_due_date.unwrap_or(i64::MAX);
    ad.cmp(&bd).then(b.effective_flagged.cmp(&a.effective_flagged)).then(a.task.rank.partial_cmp(&b.task.rank).unwrap_or(std::cmp::Ordering::Equal))
}

fn tag_descendants(d: &Derived, id: &Id) -> Vec<Id> {
    let mut out = vec![id.clone()];
    if let Some(kids) = d.tag_children.get(id) {
        for k in kids {
            out.extend(tag_descendants(d, &k.id));
        }
    }
    out
}

fn build_tags(ctx: &Ctx, sel: &[Id]) -> ContentModel {
    let mut rows = Vec::new();
    let all: Vec<&TaskInfo> = ctx.d.task_info.values().collect();
    let mut tags_ordered: Vec<String> = Vec::new();
    fn walk(d: &Derived, parent: &str, out: &mut Vec<String>) {
        if let Some(tags) = d.tag_children.get(parent) {
            for t in tags {
                out.push(t.id.clone());
                walk(d, &t.id, out);
            }
        }
    }
    if !sel.is_empty() {
        tags_ordered = sel.to_vec();
    } else {
        walk(ctx.d, "root", &mut tags_ordered);
        tags_ordered.push("__untagged".into());
    }
    for tid in &tags_ordered {
        let is_untagged = tid == "__untagged";
        let id_set: HashSet<Id> = if is_untagged { HashSet::new() } else { tag_descendants(ctx.d, tid).into_iter().collect() };
        let mut items: Vec<&TaskInfo> = all
            .iter()
            .copied()
            .filter(|i| if is_untagged { i.task.tag_ids.is_empty() } else { i.task.tag_ids.iter().any(|x| id_set.contains(x)) })
            .filter(|i| ctx.avail_ok(i) && matches(&ctx.q, &[&i.task.name, &i.task.note]))
            .collect();
        if ctx.vo.sort_by_due_and_flagged {
            items.sort_by(|a, b| sort_due_flag(a, b));
        } else {
            items.sort_by_key(|i| ctx.d.flat_order.get(&i.task.id).copied().unwrap_or(0));
        }
        if items.is_empty() && (!ctx.q.is_empty() || (sel.is_empty() && !is_untagged)) {
            continue;
        }
        let title = if is_untagged { "Untagged".to_string() } else { ctx.db.tags.get(tid).map(|t| t.name.clone()).unwrap_or_default() };
        let key = format!("tag:{}", tid);
        let collapsed = ctx.collapsed(&key);
        rows.push(RowData::Header(HeaderRow { key: key.clone(), id: key.clone(), depth: 0, title, count: Some(items.len() as u32), sub: None, day_key: None, collapsed }));
        if collapsed {
            continue;
        }
        for i in items {
            rows.push(RowData::Task(TaskRow { key: format!("{}:{}", key, i.task.id), id: i.task.id.clone(), depth: 1, task: i.task.clone(), info: i.clone(), show_project: true, flat: true, collapsed: false }));
        }
    }
    let (a, pr) = count_rows(&rows);
    let title = if sel.len() == 1 {
        if sel[0] == "__untagged" {
            "Untagged".into()
        } else {
            ctx.db.tags.get(&sel[0]).map(|t| t.name.clone()).filter(|n| !n.is_empty()).unwrap_or_else(|| "Tags".into())
        }
    } else if sel.len() > 1 {
        format!("{} Tags", sel.len())
    } else {
        "Tags".into()
    };
    let empty = match ctx.vo.availability {
        Availability::Available => "No available items",
        _ => "No remaining items",
    };
    base_model(Perspective::Tags, rows, title, summary(a, pr, "action"), empty.into())
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct ForecastDay {
    /// 'past' | 'future' | YYYY-MM-DD
    pub key: String,
    pub label: String,
    pub short: String,
    pub count: u32,
    pub overdue: bool,
    pub start: i64,
    pub end: i64,
    pub is_today: bool,
}

#[derive(Debug, Clone, uniffi::Enum)]
pub enum ForecastItem {
    Task(TaskInfo),
    Project(ProjectInfo),
}

impl ForecastItem {
    pub fn id(&self) -> &Id {
        match self {
            ForecastItem::Task(t) => &t.task.id,
            ForecastItem::Project(p) => &p.project.id,
        }
    }
    /// The date that placed this item in its bucket.
    pub fn date(&self) -> Option<i64> {
        match self {
            ForecastItem::Task(t) => t.effective_due_date.or(t.effective_planned_date).or(t.effective_defer_date),
            ForecastItem::Project(p) => p.project.due_date.or(p.project.planned_date).or(p.project.defer_date),
        }
    }
    pub fn name(&self) -> &str {
        match self {
            ForecastItem::Task(t) => &t.task.name,
            ForecastItem::Project(p) => &p.project.name,
        }
    }
    pub fn note(&self) -> &str {
        match self {
            ForecastItem::Task(t) => &t.task.note,
            ForecastItem::Project(p) => &p.project.note,
        }
    }
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct ForecastModel {
    pub days: Vec<ForecastDay>,
    pub items: HashMap<String, Vec<ForecastItem>>,
}

/// Items belonging to forecast, keyed by day; used by both sidebar and content.
pub fn forecast_buckets(_db: &Database, d: &Derived, vo: &ViewOptions) -> ForecastModel {
    let now = d.now;
    let today = start_of_day(now);
    let mut days: Vec<ForecastDay> = Vec::new();
    days.push(ForecastDay { key: "past".into(), label: "Past".into(), short: "Past".into(), count: 0, overdue: true, start: i64::MIN / 2, end: today - 1, is_today: false });
    for i in 0..14i64 {
        let s = add_days(today, i);
        let label = match i {
            0 => "Today".into(),
            1 => "Tomorrow".into(),
            _ => format!("{} {}", weekday_short(s), day_of_month(s)),
        };
        let short = if i == 0 { "Today".into() } else { format!("{} {}", weekday_short(s), day_of_month(s)) };
        days.push(ForecastDay { key: day_key(s), label, short, count: 0, overdue: false, start: s, end: end_of_day(s), is_today: i == 0 });
    }
    days.push(ForecastDay { key: "future".into(), label: "Future".into(), short: "Future".into(), count: 0, overdue: false, start: add_days(today, 14), end: i64::MAX / 2, is_today: false });

    let mut items: HashMap<String, Vec<ForecastItem>> = days.iter().map(|d| (d.key.clone(), Vec::new())).collect();
    let bucket_for = |t: i64| -> String {
        if t < today {
            return "past".into();
        }
        if t >= add_days(today, 14) {
            return "future".into();
        }
        day_key(t)
    };
    fn add(items: &mut HashMap<String, Vec<ForecastItem>>, bucket: &str, it: ForecastItem) {
        let list = items.entry(bucket.to_string()).or_default();
        if !list.iter().any(|x| x.id() == it.id() && std::mem::discriminant(x) == std::mem::discriminant(&it)) {
            list.push(it);
        }
    }
    for i in d.task_info.values().filter(|i| i.remaining) {
        if i.effective_due_date.is_some() && i.task.due_date.is_some() {
            add(&mut items, &bucket_for(i.task.due_date.unwrap()), ForecastItem::Task(i.clone()));
        }
        if vo.forecast_include_planned && i.task.planned_date.is_some() {
            add(&mut items, &bucket_for(i.task.planned_date.unwrap()), ForecastItem::Task(i.clone()));
        }
        if vo.forecast_include_deferred && i.task.defer_date.is_some() {
            add(&mut items, &bucket_for(i.task.defer_date.unwrap()), ForecastItem::Task(i.clone()));
        }
        if vo.forecast_today_flagged && i.effective_flagged && i.available {
            add(&mut items, &days[1].key.clone(), ForecastItem::Task(i.clone()));
        }
        if let Some(tag) = &vo.forecast_tag_id {
            if i.task.tag_ids.contains(tag) && i.available {
                add(&mut items, &days[1].key.clone(), ForecastItem::Task(i.clone()));
            }
        }
    }
    for p in d.project_info.values().filter(|p| p.remaining) {
        if let Some(due) = p.project.due_date {
            add(&mut items, &bucket_for(due), ForecastItem::Project(p.clone()));
        }
        if vo.forecast_include_planned {
            if let Some(pl) = p.project.planned_date {
                add(&mut items, &bucket_for(pl), ForecastItem::Project(p.clone()));
            }
        }
        if vo.forecast_include_deferred {
            if let Some(df) = p.project.defer_date {
                add(&mut items, &bucket_for(df), ForecastItem::Project(p.clone()));
            }
        }
    }
    let mut days = days;
    for day in &mut days {
        if let Some(list) = items.get_mut(&day.key) {
            list.sort_by_key(|x| x.date().unwrap_or(i64::MAX));
            day.count = list.len() as u32;
        }
    }
    ForecastModel { days, items }
}

fn build_forecast(ctx: &Ctx) -> ContentModel {
    let fm = forecast_buckets(ctx.db, ctx.d, &ctx.vo);
    let mut rows = Vec::new();
    let selected_day = ctx.db.ui.forecast_selected_day.clone();
    for day in &fm.days {
        if let Some(sel) = &selected_day {
            if &day.key != sel {
                continue;
            }
        }
        let list: Vec<&ForecastItem> = fm
            .items
            .get(&day.key)
            .map(|v| {
                v.iter()
                    .filter(|x| matches(&ctx.q, &[x.name(), x.note()]))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        if list.is_empty() && selected_day.as_deref() != Some(&day.key) {
            continue;
        }
        let key = format!("day:{}", day.key);
        let sub = if day.key == "past" || day.key == "future" { None } else { Some(long_date_label(day.start)) };
        let collapsed = ctx.collapsed(&key);
        rows.push(RowData::Header(HeaderRow { key: key.clone(), id: key.clone(), depth: 0, title: day.label.clone(), count: Some(list.len() as u32), sub, day_key: Some(day.key.clone()), collapsed }));
        if collapsed {
            continue;
        }
        for x in list {
            match x {
                ForecastItem::Task(t) => rows.push(RowData::Task(TaskRow { key: format!("{}:{}", key, t.task.id), id: t.task.id.clone(), depth: 1, task: t.task.clone(), info: t.clone(), show_project: true, flat: true, collapsed: false })),
                ForecastItem::Project(p) => rows.push(RowData::Project(ProjectRow { key: format!("{}:{}", key, p.project.id), id: p.project.id.clone(), depth: 1, project: p.project.clone(), info: p.clone(), collapsed: false })),
            }
        }
    }
    base_model(Perspective::Forecast, rows, "Forecast".into(), String::new(), "No items".into())
}

fn build_flagged(ctx: &Ctx) -> ContentModel {
    let mut rows = Vec::new();
    let mut items: Vec<&TaskInfo> = ctx.d.task_info.values().filter(|i| i.effective_flagged && ctx.avail_ok(i) && matches(&ctx.q, &[&i.task.name, &i.task.note])).collect();
    let projects: Vec<&ProjectInfo> = ctx.d.project_info.values().filter(|p| p.project.flagged && ctx.project_avail_ok(p) && matches(&ctx.q, &[&p.project.name])).collect();
    if ctx.vo.flagged_group_by == FlaggedGrouping::Ungrouped {
        items.sort_by_key(|i| ctx.d.flat_order.get(&i.task.id).copied().unwrap_or(0));
        for p in projects {
            rows.push(RowData::Project(ProjectRow { key: p.project.id.clone(), id: p.project.id.clone(), depth: 0, project: p.project.clone(), info: (*p).clone(), collapsed: false }));
        }
        for i in items {
            rows.push(RowData::Task(TaskRow { key: i.task.id.clone(), id: i.task.id.clone(), depth: 0, task: i.task.clone(), info: i.clone(), show_project: true, flat: true, collapsed: false }));
        }
    } else {
        let mut groups: Vec<(String, String, Vec<TaskInfo>)> = Vec::new();
        for i in items {
            let (gk, title) = match ctx.vo.flagged_group_by {
                FlaggedGrouping::Project => (i.project.as_ref().map(|p| p.id.clone()).unwrap_or_else(|| "__inbox".into()), i.project.as_ref().map(|p| p.name.clone()).unwrap_or_else(|| "Inbox".into())),
                FlaggedGrouping::Tag => {
                    let gk = i.task.tag_ids.first().cloned().unwrap_or_else(|| "__untagged".into());
                    (gk.clone(), ctx.db.tags.get(&gk).map(|t| t.name.clone()).unwrap_or_else(|| "Untagged".into()))
                }
                FlaggedGrouping::Due | FlaggedGrouping::Defer => {
                    let t = if ctx.vo.flagged_group_by == FlaggedGrouping::Due { i.effective_due_date } else { i.effective_defer_date };
                    match t {
                        None => ("__none".into(), if ctx.vo.flagged_group_by == FlaggedGrouping::Due { "No Due Date".into() } else { "No Defer Date".into() }),
                        Some(t) => (day_key(t), long_date_label(t)),
                    }
                }
                _ => unreachable!(),
            };
            if let Some(g) = groups.iter_mut().find(|(k, _, _)| *k == gk) {
                g.2.push(i.clone());
            } else {
                groups.push((gk, title, vec![i.clone()]));
            }
        }
        for (gk, title, list) in groups {
            let key = format!("fg:{}", gk);
            let collapsed = ctx.collapsed(&key);
            rows.push(RowData::Header(HeaderRow { key: key.clone(), id: key.clone(), depth: 0, title, count: Some(list.len() as u32), sub: None, day_key: None, collapsed }));
            if collapsed {
                continue;
            }
            for i in list {
                rows.push(RowData::Task(TaskRow { key: format!("{}:{}", key, i.task.id), id: i.task.id.clone(), depth: 1, task: i.task.clone(), info: i, show_project: true, flat: true, collapsed: false }));
            }
        }
    }
    let (a, pr) = count_rows(&rows);
    let empty = match ctx.vo.availability {
        Availability::Available => "No available flagged items",
        Availability::Remaining => "No remaining flagged items",
        _ => "No flagged items",
    };
    base_model(Perspective::Flagged, rows, "Flagged".into(), summary(a, pr, "action"), empty.into())
}

pub fn review_projects(db: &Database, d: &Derived, vo: &ViewOptions) -> Vec<ProjectInfo> {
    let _ = db;
    let mut list: Vec<ProjectInfo> = d.project_info.values().filter(|p| p.remaining || vo.availability == Availability::Everything).cloned().collect();
    if vo.review_hide_blocked {
        list.retain(|p| p.effective_status == ProjectStatus::Active && !p.deferred);
    }
    if vo.review_sort_by_next_review {
        list.sort_by(|a, b| a.project.next_review_at.unwrap_or(0).cmp(&b.project.next_review_at.unwrap_or(0)).then_with(|| a.project.name.to_lowercase().cmp(&b.project.name.to_lowercase())));
    } else {
        list.sort_by(|a, b| a.project.rank.partial_cmp(&b.project.rank).unwrap_or(std::cmp::Ordering::Equal));
    }
    list
}

fn build_review(ctx: &Ctx, sel: &[Id]) -> ContentModel {
    let list = review_projects(ctx.db, ctx.d, &ctx.vo);
    let mut rows = Vec::new();
    let chosen: Vec<&ProjectInfo> = if !sel.is_empty() { list.iter().filter(|p| sel.contains(&p.project.id)).collect() } else { list.iter().take(1).collect() };
    for p in &chosen {
        let collapsed = ctx.collapsed(&p.project.id);
        rows.push(RowData::Project(ProjectRow { key: p.project.id.clone(), id: p.project.id.clone(), depth: 0, project: p.project.clone(), info: (*p).clone(), collapsed }));
        if !collapsed {
            task_tree(ctx, &p.project.id, 1, false, &mut rows, "");
        }
    }
    let (a, pr) = count_rows(&rows);
    let idx = if chosen.len() == 1 { list.iter().position(|p| p.project.id == chosen[0].project.id).map(|i| i as u32 + 1) } else { None };
    let subtitle = match idx {
        Some(i) => format!("Project {} of {}", i, list.len()),
        None => format!("{} projects", list.len()),
    };
    let mut m = base_model(Perspective::Review, rows, "Review".into(), subtitle, "No projects to review".into());
    m.review_index = idx;
    m.review_total = list.len() as u32;
    let _ = (a, pr);
    m
}

/* ---------------- Sidebar model ---------------- */

#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum SidebarRowKind {
    Folder,
    Project,
    Tag,
    Untagged,
    ReviewProject,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct SidebarRow {
    pub key: String,
    pub id: Option<Id>,
    pub kind: SidebarRowKind,
    pub name: String,
    pub depth: u32,
    pub has_children: bool,
    pub expanded: bool,
    pub dim: bool,
    pub selected: bool,
    pub status: Option<ProjectStatus>,
    pub tag_status: Option<TagStatus>,
    pub project_type: Option<ProjectType>,
    pub due_state: DueState,
    pub needs_review: bool,
    pub flagged: bool,
    pub remaining_count: u32,
    pub available_count: u32,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct SidebarModel {
    pub perspective: Perspective,
    pub rows: Vec<SidebarRow>,
    pub selection: Vec<Id>,
    pub badges: Badges,
    pub focused: bool,
    pub forecast: Option<ForecastModel>,
    pub forecast_selected_day: Option<String>,
    pub review_total: u32,
}

pub fn build_sidebar(db: &Database, d: &Derived) -> SidebarModel {
    let p = db.ui.perspective;
    let sel = db.sidebar_selection();
    let mut rows = Vec::new();
    let mut forecast = None;
    let mut review_total = 0u32;
    let expanded = |key: &str| !db.ui.collapsed.get(&format!("sb:{}", key)).copied().unwrap_or(false);
    match p {
        Perspective::Projects => {
            let vo = db.view_options(p);
            fn render_folder(db: &Database, d: &Derived, vo: &ViewOptions, sel: &[Id], rows: &mut Vec<SidebarRow>, f: &Folder, depth: u32, expanded: &dyn Fn(&str) -> bool) {
                let kids_f = d.folders_in.get(&f.id).map(|v| v.len()).unwrap_or(0);
                let kids_p = d.projects_in_folder.get(&f.id).map(|v| v.len()).unwrap_or(0);
                let open = expanded(&f.id);
                rows.push(SidebarRow {
                    key: f.id.clone(),
                    id: Some(f.id.clone()),
                    kind: SidebarRowKind::Folder,
                    name: f.name.clone(),
                    depth,
                    has_children: kids_f + kids_p > 0,
                    expanded: open,
                    dim: f.status == FolderStatus::Dropped,
                    selected: sel.contains(&f.id),
                    status: None,
                    tag_status: None,
                    project_type: None,
                    due_state: DueState::None,
                    needs_review: false,
                    flagged: false,
                    remaining_count: 0,
                    available_count: 0,
                });
                if open {
                    if let Some(subs) = d.folders_in.get(&f.id).cloned() {
                        for k in &subs {
                            render_folder(db, d, vo, sel, rows, k, depth + 1, expanded);
                        }
                    }
                    if let Some(projs) = d.projects_in_folder.get(&f.id).cloned() {
                        for p in &projs {
                            render_project(d, vo, sel, rows, p, depth + 1);
                        }
                    }
                }
            }
            fn render_project(d: &Derived, vo: &ViewOptions, sel: &[Id], rows: &mut Vec<SidebarRow>, p: &Project, depth: u32) {
                let info = match d.project_info.get(&p.id) {
                    Some(i) => i,
                    None => return,
                };
                if !info.remaining && vo.availability != Availability::Everything {
                    return;
                }
                rows.push(SidebarRow {
                    key: p.id.clone(),
                    id: Some(p.id.clone()),
                    kind: SidebarRowKind::Project,
                    name: p.name.clone(),
                    depth,
                    has_children: false,
                    expanded: true,
                    dim: info.effective_status != ProjectStatus::Active,
                    selected: sel.contains(&p.id),
                    status: Some(info.effective_status),
                    tag_status: None,
                    project_type: Some(p.project_type),
                    due_state: info.due_state,
                    needs_review: false,
                    flagged: p.flagged,
                    remaining_count: info.remaining_count,
                    available_count: info.available_count,
                });
            }
            let focus = &db.ui.focus_ids;
            if !focus.is_empty() {
                for id in focus {
                    if let Some(f) = db.folders.get(id).cloned() {
                        render_folder(db, d, &vo, &sel, &mut rows, &f, 0, &expanded);
                    } else if let Some(p) = db.projects.get(id).cloned() {
                        render_project(d, &vo, &sel, &mut rows, &p, 0);
                    }
                }
            } else {
                if let Some(folders) = d.folders_in.get("root").cloned() {
                    for f in &folders {
                        render_folder(db, d, &vo, &sel, &mut rows, f, 0, &expanded);
                    }
                }
                if let Some(projs) = d.projects_in_folder.get("root").cloned() {
                    for p in &projs {
                        render_project(d, &vo, &sel, &mut rows, p, 0);
                    }
                }
            }
        }
        Perspective::Tags => {
            fn render_tag(d: &Derived, sel: &[Id], rows: &mut Vec<SidebarRow>, t: &Tag, depth: u32, expanded: &dyn Fn(&str) -> bool) {
                let kids = d.tag_children.get(&t.id).cloned().unwrap_or_default();
                let open = expanded(&t.id);
                let counts = d.tag_task_counts.get(&t.id).copied().unwrap_or_default();
                rows.push(SidebarRow {
                    key: t.id.clone(),
                    id: Some(t.id.clone()),
                    kind: SidebarRowKind::Tag,
                    name: t.name.clone(),
                    depth,
                    has_children: !kids.is_empty(),
                    expanded: open,
                    dim: t.status != TagStatus::Active,
                    selected: sel.contains(&t.id),
                    status: None,
                    tag_status: Some(t.status),
                    project_type: None,
                    due_state: DueState::None,
                    needs_review: false,
                    flagged: false,
                    remaining_count: counts.remaining,
                    available_count: counts.available,
                });
                if open {
                    for k in &kids {
                        render_tag(d, sel, rows, k, depth + 1, expanded);
                    }
                }
            }
            if let Some(tags) = d.tag_children.get("root").cloned() {
                for t in &tags {
                    render_tag(d, &sel, &mut rows, t, 0, &expanded);
                }
            }
            rows.push(SidebarRow {
                key: "__untagged".into(),
                id: Some("__untagged".into()),
                kind: SidebarRowKind::Untagged,
                name: "Untagged".into(),
                depth: 0,
                has_children: false,
                expanded: true,
                dim: false,
                selected: sel.contains(&"__untagged".to_string()),
                status: None,
                tag_status: None,
                project_type: None,
                due_state: DueState::None,
                needs_review: false,
                flagged: false,
                remaining_count: d.untagged_count.remaining,
                available_count: d.untagged_count.available,
            });
        }
        Perspective::Forecast => {
            forecast = Some(forecast_buckets(db, d, &db.view_options(Perspective::Forecast)));
        }
        Perspective::Review => {
            let list = review_projects(db, d, &db.view_options(Perspective::Review));
            review_total = list.len() as u32;
            let effective: Vec<Id> = if !sel.is_empty() { sel.clone() } else { list.first().map(|p| vec![p.project.id.clone()]).unwrap_or_default() };
            for pi in &list {
                rows.push(SidebarRow {
                    key: pi.project.id.clone(),
                    id: Some(pi.project.id.clone()),
                    kind: SidebarRowKind::ReviewProject,
                    name: pi.project.name.clone(),
                    depth: 0,
                    has_children: false,
                    expanded: true,
                    dim: pi.effective_status != ProjectStatus::Active,
                    selected: effective.contains(&pi.project.id),
                    status: Some(pi.effective_status),
                    tag_status: None,
                    project_type: Some(pi.project.project_type),
                    due_state: pi.due_state,
                    needs_review: pi.needs_review,
                    flagged: pi.project.flagged,
                    remaining_count: pi.remaining_count,
                    available_count: pi.available_count,
                });
            }
        }
        _ => {}
    }
    SidebarModel {
        perspective: p,
        rows,
        selection: sel,
        badges: d.badges,
        focused: !db.ui.focus_ids.is_empty(),
        forecast,
        forecast_selected_day: db.ui.forecast_selected_day.clone(),
        review_total,
    }
}
