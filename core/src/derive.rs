//! Derived state: effective status, availability, blocking, next actions,
//! due-soon / overdue, badges. Mirrors Focusd semantics.
use crate::dates::end_of_day;
use crate::model::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DueState {
    None,
    DueSoon,
    Overdue,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskInfo {
    pub task: Task,
    pub project: Option<Project>,
    pub effective_completed: bool,
    pub effective_dropped: bool,
    /// not completed, not dropped
    pub remaining: bool,
    /// remaining and not deferred and not blocked
    pub available: bool,
    /// available and the next action of its container
    pub is_next: bool,
    pub blocked: bool,
    pub deferred: bool,
    pub on_hold: bool,
    pub effective_defer_date: Option<i64>,
    pub effective_due_date: Option<i64>,
    pub effective_planned_date: Option<i64>,
    pub effective_flagged: bool,
    pub due_state: DueState,
    pub depth: u32,
    pub has_children: bool,
    pub is_group: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    pub project: Project,
    pub effective_status: ProjectStatus,
    pub remaining: bool,
    pub available: bool,
    pub blocked: bool,
    pub deferred: bool,
    pub due_state: DueState,
    pub remaining_count: u32,
    pub available_count: u32,
    pub needs_review: bool,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Badges {
    pub inbox: u32,
    pub forecast: u32,
    pub flagged: u32,
    pub review: u32,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagCounts {
    pub available: u32,
    pub remaining: u32,
}

pub struct Derived {
    pub task_info: HashMap<Id, TaskInfo>,
    pub project_info: HashMap<Id, ProjectInfo>,
    /// parentId (project or task) -> ordered children
    pub children_of: HashMap<Id, Vec<Task>>,
    pub inbox: Vec<Task>,
    /// folderId or "root" -> ordered projects
    pub projects_in_folder: HashMap<String, Vec<Project>>,
    /// parent folderId or "root" -> ordered folders
    pub folders_in: HashMap<String, Vec<Folder>>,
    /// parent tagId or "root" -> ordered tags
    pub tag_children: HashMap<String, Vec<Tag>>,
    pub tag_task_counts: HashMap<Id, TagCounts>,
    pub untagged_count: TagCounts,
    pub badges: Badges,
    /// post-order index of every task (children before their group), used to sort flat lists
    pub flat_order: HashMap<Id, u32>,
    pub now: i64,
}

fn by_rank<T>(items: &mut [T])
where
    T: HasRank,
{
    items.sort_by(|a, b| a.rank().partial_cmp(&b.rank()).unwrap_or(std::cmp::Ordering::Equal));
}

pub trait HasRank {
    fn rank(&self) -> f64;
}
impl HasRank for Task {
    fn rank(&self) -> f64 {
        self.rank
    }
}
impl HasRank for Project {
    fn rank(&self) -> f64 {
        self.rank
    }
}
impl HasRank for Folder {
    fn rank(&self) -> f64 {
        self.rank
    }
}
impl HasRank for Tag {
    fn rank(&self) -> f64 {
        self.rank
    }
}

fn max_date(a: Option<i64>, b: Option<i64>) -> Option<i64> {
    match (a, b) {
        (Some(x), Some(y)) => Some(x.max(y)),
        (x, y) => x.or(y),
    }
}
fn min_date(a: Option<i64>, b: Option<i64>) -> Option<i64> {
    match (a, b) {
        (Some(x), Some(y)) => Some(x.min(y)),
        (x, y) => x.or(y),
    }
}

fn folder_dropped(db: &Database, start: Option<&Id>) -> bool {
    let mut cur = start;
    while let Some(id) = cur {
        match db.folders.get(id) {
            None => return false,
            Some(f) => {
                if f.status == FolderStatus::Dropped {
                    return true;
                }
                cur = f.parent_id.as_ref();
            }
        }
    }
    false
}

fn tag_effective(db: &Database, id: &Id) -> TagStatus {
    let mut cur = Some(id);
    let mut status = TagStatus::Active;
    while let Some(i) = cur {
        match db.tags.get(i) {
            None => break,
            Some(t) => {
                if t.status == TagStatus::Dropped {
                    return TagStatus::Dropped;
                }
                if t.status == TagStatus::OnHold {
                    status = TagStatus::OnHold;
                }
                cur = t.parent_id.as_ref();
            }
        }
    }
    status
}

fn tag_allows_next(db: &Database, id: &Id) -> bool {
    let mut cur = Some(id);
    while let Some(i) = cur {
        match db.tags.get(i) {
            None => break,
            Some(t) => {
                if !t.allows_next_action {
                    return false;
                }
                cur = t.parent_id.as_ref();
            }
        }
    }
    true
}

pub fn derive_all(db: &Database, now: i64) -> Derived {
    let mut children_of: HashMap<Id, Vec<Task>> = HashMap::new();
    let mut inbox: Vec<Task> = Vec::new();
    for t in db.tasks.values() {
        match &t.parent_id {
            None => inbox.push(t.clone()),
            Some(p) => children_of.entry(p.clone()).or_default().push(t.clone()),
        }
    }
    for v in children_of.values_mut() {
        by_rank(v);
    }
    by_rank(&mut inbox);

    let mut projects_in_folder: HashMap<String, Vec<Project>> = HashMap::new();
    for p in db.projects.values() {
        projects_in_folder.entry(p.folder_id.clone().unwrap_or_else(|| "root".into())).or_default().push(p.clone());
    }
    for v in projects_in_folder.values_mut() {
        by_rank(v);
    }
    let mut folders_in: HashMap<String, Vec<Folder>> = HashMap::new();
    for f in db.folders.values() {
        folders_in.entry(f.parent_id.clone().unwrap_or_else(|| "root".into())).or_default().push(f.clone());
    }
    for v in folders_in.values_mut() {
        by_rank(v);
    }
    let mut tag_children: HashMap<String, Vec<Tag>> = HashMap::new();
    for t in db.tags.values() {
        tag_children.entry(t.parent_id.clone().unwrap_or_else(|| "root".into())).or_default().push(t.clone());
    }
    for v in tag_children.values_mut() {
        by_rank(v);
    }

    let due_soon_ms = db.settings.due_soon_hours as i64 * 3_600_000;
    let due_state_of = move |due: Option<i64>, completed: bool| -> DueState {
        let due = match due {
            Some(d) if !completed => d,
            _ => return DueState::None,
        };
        if due < now {
            DueState::Overdue
        } else if due - now <= due_soon_ms {
            DueState::DueSoon
        } else {
            DueState::None
        }
    };

    let mut project_info: HashMap<Id, ProjectInfo> = HashMap::new();
    for p in db.projects.values() {
        let mut eff = p.status;
        if folder_dropped(db, p.folder_id.as_ref()) && eff != ProjectStatus::Done {
            eff = ProjectStatus::Dropped;
        }
        let remaining = eff == ProjectStatus::Active || eff == ProjectStatus::OnHold;
        let deferred = p.defer_date.map(|d| d > now).unwrap_or(false);
        project_info.insert(
            p.id.clone(),
            ProjectInfo {
                project: p.clone(),
                effective_status: eff,
                remaining,
                available: eff == ProjectStatus::Active && !deferred,
                blocked: false,
                deferred,
                due_state: due_state_of(p.due_date, !remaining),
                remaining_count: 0,
                available_count: 0,
                needs_review: remaining && (p.next_review_at.is_none() || p.next_review_at.unwrap() <= end_of_day(now)),
            },
        );
    }

    let mut ev = Evaluator { db, children_of: &children_of, task_info: HashMap::new(), now, due_state_of: &due_state_of };

    for p in db.projects.values() {
        let pi = project_info.get(&p.id).unwrap();
        let eff = pi.effective_status;
        let proj_dropped = eff == ProjectStatus::Dropped;
        let proj_done = eff == ProjectStatus::Done;
        let proj_tag_on_hold = p.tag_ids.iter().any(|id| tag_effective(db, id) == TagStatus::OnHold);
        let res = ev.eval_children(
            &p.id,
            Ctx {
                project: Some(p.clone()),
                sequential: p.project_type == ProjectType::Sequential,
                parent_completed: proj_done,
                parent_dropped: proj_dropped,
                inherited_defer: p.defer_date,
                inherited_due: p.due_date,
                inherited_planned: p.planned_date,
                inherited_flag: p.flagged,
                parent_blocked: eff == ProjectStatus::OnHold || pi.deferred || proj_tag_on_hold,
                parent_on_hold: eff == ProjectStatus::OnHold || proj_tag_on_hold,
                depth: 1,
            },
        );
        let pi = project_info.get_mut(&p.id).unwrap();
        pi.remaining_count = res.remaining;
        pi.available_count = res.available;
        pi.blocked = eff == ProjectStatus::OnHold || proj_tag_on_hold;
    }

    // inbox items
    for t in &inbox {
        let eff_completed = t.completed_at.is_some();
        let eff_dropped = t.dropped_at.is_some();
        let remaining = !eff_completed && !eff_dropped;
        let deferred = t.defer_date.map(|d| d > now).unwrap_or(false);
        let on_hold = t.tag_ids.iter().any(|id| tag_effective(db, id) == TagStatus::OnHold);
        let has_children = ev.children_of.get(&t.id).map(|v| !v.is_empty()).unwrap_or(false);
        let sub = ev.eval_children(
            &t.id,
            Ctx {
                project: None,
                sequential: t.sequential,
                parent_completed: eff_completed,
                parent_dropped: eff_dropped,
                inherited_defer: t.defer_date,
                inherited_due: t.due_date,
                inherited_planned: t.planned_date,
                inherited_flag: t.flagged,
                parent_blocked: on_hold || deferred,
                parent_on_hold: on_hold,
                depth: 1,
            },
        );
        let group_pending = has_children && !sub.all_done;
        let available = remaining && !deferred && !on_hold && !group_pending;
        ev.task_info.insert(
            t.id.clone(),
            TaskInfo {
                task: t.clone(),
                project: None,
                effective_completed: eff_completed,
                effective_dropped: eff_dropped,
                remaining,
                available,
                is_next: available,
                blocked: on_hold,
                deferred,
                on_hold,
                effective_defer_date: t.defer_date,
                effective_due_date: t.due_date,
                effective_planned_date: t.planned_date,
                effective_flagged: t.flagged,
                due_state: due_state_of(t.due_date, !remaining),
                depth: 0,
                has_children,
                is_group: has_children,
            },
        );
    }
    let task_info = ev.task_info;

    // tag counts
    let mut tag_task_counts: HashMap<Id, TagCounts> = db.tags.keys().map(|k| (k.clone(), TagCounts::default())).collect();
    let mut untagged_count = TagCounts::default();
    for i in task_info.values() {
        if i.task.tag_ids.is_empty() {
            bump(&mut untagged_count, i);
        }
        for tid in &i.task.tag_ids {
            let mut cur = Some(tid.clone());
            while let Some(c) = cur {
                if let Some(cnt) = tag_task_counts.get_mut(&c) {
                    bump(cnt, i);
                }
                cur = db.tags.get(&c).and_then(|t| t.parent_id.clone());
            }
        }
    }

    // post-order flat index: folders' projects first, then root projects, then inbox
    let mut flat_order: HashMap<Id, u32> = HashMap::new();
    let mut order = 0u32;
    fn post(id: &Id, children_of: &HashMap<Id, Vec<Task>>, flat_order: &mut HashMap<Id, u32>, order: &mut u32) {
        if let Some(kids) = children_of.get(id) {
            for k in kids {
                post(&k.id, children_of, flat_order, order);
                flat_order.insert(k.id.clone(), *order);
                *order += 1;
            }
        }
    }
    let root_folders = folders_in.get("root").cloned().unwrap_or_default();
    fn walk_folder(fid: &Id, folders_in: &HashMap<String, Vec<Folder>>, projects_in_folder: &HashMap<String, Vec<Project>>, children_of: &HashMap<Id, Vec<Task>>, flat_order: &mut HashMap<Id, u32>, order: &mut u32) {
        if let Some(subs) = folders_in.get(fid) {
            for f in subs.clone() {
                walk_folder(&f.id, folders_in, projects_in_folder, children_of, flat_order, order);
            }
        }
        if let Some(projs) = projects_in_folder.get(fid) {
            for p in projs {
                post(&p.id, children_of, flat_order, order);
            }
        }
    }
    for f in &root_folders {
        walk_folder(&f.id, &folders_in, &projects_in_folder, &children_of, &mut flat_order, &mut order);
    }
    if let Some(root_projs) = projects_in_folder.get("root") {
        for p in root_projs {
            post(&p.id, &children_of, &mut flat_order, &mut order);
        }
    }
    for t in &inbox {
        post(&t.id, &children_of, &mut flat_order, &mut order);
        flat_order.insert(t.id.clone(), order);
        order += 1;
    }

    let today_end = end_of_day(now);
    let badges = Badges {
        inbox: inbox.iter().filter(|t| task_info.get(&t.id).map(|i| i.remaining).unwrap_or(false)).count() as u32,
        forecast: task_info.values().filter(|i| i.remaining && i.effective_due_date.map(|d| d <= today_end).unwrap_or(false)).count() as u32
            + project_info.values().filter(|p| p.remaining && p.project.due_date.map(|d| d <= today_end).unwrap_or(false)).count() as u32,
        flagged: task_info.values().filter(|i| i.available && i.effective_flagged).count() as u32,
        review: project_info.values().filter(|p| p.needs_review).count() as u32,
    };

    Derived { task_info, project_info, children_of, inbox, projects_in_folder, folders_in, tag_children, tag_task_counts, untagged_count, badges, flat_order, now }
}

fn bump(c: &mut TagCounts, i: &TaskInfo) {
    if i.remaining {
        c.remaining += 1;
    }
    if i.available {
        c.available += 1;
    }
}

#[derive(Clone)]
struct Ctx {
    project: Option<Project>,
    sequential: bool,
    parent_completed: bool,
    parent_dropped: bool,
    inherited_defer: Option<i64>,
    inherited_due: Option<i64>,
    inherited_planned: Option<i64>,
    inherited_flag: bool,
    parent_blocked: bool,
    parent_on_hold: bool,
    depth: u32,
}

#[derive(Default)]
struct ChildStats {
    any_available: bool,
    remaining: u32,
    available: u32,
    all_done: bool,
}

struct Evaluator<'a> {
    db: &'a Database,
    children_of: &'a HashMap<Id, Vec<Task>>,
    task_info: HashMap<Id, TaskInfo>,
    now: i64,
    due_state_of: &'a dyn Fn(Option<i64>, bool) -> DueState,
}

impl<'a> Evaluator<'a> {
    /// Recursive evaluation of a container's children.
    fn eval_children(&mut self, parent_id: &Id, ctx: Ctx) -> ChildStats {
        let kids = self.children_of.get(parent_id).cloned().unwrap_or_default();
        let mut any_available = false;
        let mut remaining_count = 0u32;
        let mut available_count = 0u32;
        let mut all_done = !kids.is_empty();
        let mut preceding_incomplete = false; // for sequential

        for t in &kids {
            let eff_completed = ctx.parent_completed || t.completed_at.is_some();
            let eff_dropped = ctx.parent_dropped || t.dropped_at.is_some();
            let remaining = !eff_completed && !eff_dropped;
            let eff_defer = max_date(t.defer_date, ctx.inherited_defer);
            let eff_due = min_date(t.due_date, ctx.inherited_due);
            let eff_planned = t.planned_date.or(ctx.inherited_planned);
            let eff_flag = t.flagged || ctx.inherited_flag;
            let deferred = eff_defer.map(|d| d > self.now).unwrap_or(false);
            let tag_on_hold = t.tag_ids.iter().any(|id| tag_effective(self.db, id) == TagStatus::OnHold);
            let tag_dropped = t.tag_ids.iter().any(|id| tag_effective(self.db, id) == TagStatus::Dropped);
            let on_hold = ctx.parent_on_hold || tag_on_hold;
            let sequential_blocked = ctx.sequential && preceding_incomplete;
            let blocked = ctx.parent_blocked || sequential_blocked || on_hold || tag_dropped;
            let has_children = self.children_of.get(&t.id).map(|v| !v.is_empty()).unwrap_or(false);

            // evaluate children first (groups)
            let sub = self.eval_children(
                &t.id,
                Ctx {
                    project: ctx.project.clone(),
                    sequential: t.sequential,
                    parent_completed: eff_completed,
                    parent_dropped: eff_dropped,
                    inherited_defer: eff_defer,
                    inherited_due: eff_due,
                    inherited_planned: eff_planned,
                    inherited_flag: eff_flag,
                    parent_blocked: blocked || deferred,
                    parent_on_hold: on_hold,
                    depth: ctx.depth + 1,
                },
            );

            // An action group with remaining children is itself not available
            // for completion until children are done (shown greyed).
            let group_pending = has_children && !sub.all_done;
            let available = remaining && !deferred && !blocked && !group_pending;

            self.task_info.insert(
                t.id.clone(),
                TaskInfo {
                    task: t.clone(),
                    project: ctx.project.clone(),
                    effective_completed: eff_completed,
                    effective_dropped: eff_dropped,
                    remaining,
                    available,
                    is_next: false,
                    blocked,
                    deferred,
                    on_hold,
                    effective_defer_date: eff_defer,
                    effective_due_date: eff_due,
                    effective_planned_date: eff_planned,
                    effective_flagged: eff_flag,
                    due_state: (self.due_state_of)(eff_due, !remaining),
                    depth: ctx.depth,
                    has_children,
                    is_group: has_children,
                },
            );
            if remaining {
                remaining_count += 1 + sub.remaining;
                all_done = false;
            }
            if available {
                available_count += 1;
            }
            available_count += sub.available;
            if available || sub.any_available {
                if !any_available {
                    // first available in this container is the "next" action
                    let target = if available { Some(t.id.clone()) } else { self.first_next_in(&t.id) };
                    if let Some(target) = target {
                        if !t.tag_ids.iter().any(|id| !tag_allows_next(self.db, id)) {
                            if let Some(info) = self.task_info.get_mut(&target) {
                                info.is_next = true;
                            }
                        }
                    }
                }
                any_available = true;
            }
            if remaining {
                preceding_incomplete = true;
            }
        }
        ChildStats { any_available, remaining: remaining_count, available: available_count, all_done }
    }

    fn first_next_in(&self, id: &Id) -> Option<Id> {
        for k in self.children_of.get(id)? {
            if let Some(i) = self.task_info.get(&k.id) {
                if i.is_next || i.available {
                    return Some(k.id.clone());
                }
            }
            if let Some(deeper) = self.first_next_in(&k.id) {
                return Some(deeper);
            }
        }
        None
    }
}

pub fn containing_project_id(db: &Database, task_id: &Id) -> Option<Id> {
    let mut cur = db.tasks.get(task_id)?.parent_id.clone();
    while let Some(c) = cur {
        if db.projects.contains_key(&c) {
            return Some(c);
        }
        cur = db.tasks.get(&c)?.parent_id.clone();
    }
    None
}

/// Ancestor ids of a task, nearest first, ending with the containing project.
pub fn ancestors_of(db: &Database, id: &Id) -> Vec<Id> {
    let mut out = Vec::new();
    let mut cur = db.tasks.get(id).and_then(|t| t.parent_id.clone());
    while let Some(c) = cur {
        out.push(c.clone());
        if db.projects.contains_key(&c) {
            break;
        }
        cur = db.tasks.get(&c).and_then(|t| t.parent_id.clone());
    }
    out
}

pub fn descendant_task_ids(d: &Derived, id: &Id) -> Vec<Id> {
    let mut out = Vec::new();
    fn walk(x: &Id, d: &Derived, out: &mut Vec<Id>) {
        if let Some(kids) = d.children_of.get(x) {
            for k in kids {
                out.push(k.id.clone());
                walk(&k.id, d, out);
            }
        }
    }
    walk(id, d, &mut out);
    out
}

pub fn is_today_or_before(t: Option<i64>, now: i64) -> bool {
    t.map(|x| x <= end_of_day(now)).unwrap_or(false)
}
