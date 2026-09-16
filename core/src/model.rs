//! Data model, mirroring the data model (task / project / folder / tag) and
//! the v2 XML database. All timestamps are milliseconds since the Unix epoch
//! in local wall-clock semantics.
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub type Id = String;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ProjectStatus {
    Active,
    OnHold,
    Done,
    Dropped,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ProjectType {
    Parallel,
    Sequential,
    SingleActions,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TagStatus {
    Active,
    OnHold,
    Dropped,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FolderStatus {
    Active,
    Dropped,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RepeatUnit {
    Minute,
    Hour,
    Day,
    Week,
    Month,
    Year,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RepeatMethod {
    /// "Regularly": fixed schedule
    Fixed,
    /// "Defer another": next defer date = completion + interval
    StartAfterCompletion,
    /// "Due again": next due date = completion + interval
    DueAfterCompletion,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepetitionRule {
    pub every: u32,
    pub unit: RepeatUnit,
    pub method: RepeatMethod,
    /// 0 = Sunday … 6 = Saturday; only used for weekly fixed schedules
    pub weekdays: Vec<u8>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ReviewUnit {
    Day,
    Week,
    Month,
    Year,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewInterval {
    pub steps: u32,
    pub unit: ReviewUnit,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: Id,
    pub name: String,
    pub note: String,
    pub parent_id: Option<Id>,
    pub status: FolderStatus,
    pub rank: f64,
    pub created_at: i64,
    pub modified_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: Id,
    pub name: String,
    pub note: String,
    pub parent_id: Option<Id>,
    pub status: TagStatus,
    pub allows_next_action: bool,
    pub rank: f64,
    pub created_at: i64,
    pub modified_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: Id,
    pub name: String,
    pub note: String,
    pub folder_id: Option<Id>,
    pub status: ProjectStatus,
    pub project_type: ProjectType,
    pub completed_by_children: bool,
    pub flagged: bool,
    pub tag_ids: Vec<Id>,
    pub defer_date: Option<i64>,
    pub planned_date: Option<i64>,
    pub due_date: Option<i64>,
    pub completed_at: Option<i64>,
    pub dropped_at: Option<i64>,
    pub estimated_minutes: Option<u32>,
    pub repetition: Option<RepetitionRule>,
    pub review_interval: ReviewInterval,
    pub last_reviewed_at: Option<i64>,
    pub next_review_at: Option<i64>,
    pub rank: f64,
    pub created_at: i64,
    pub modified_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: Id,
    pub name: String,
    pub note: String,
    /// `None` = inbox item; otherwise a project id or a parent task id.
    pub parent_id: Option<Id>,
    pub sequential: bool,
    pub completed_by_children: bool,
    pub flagged: bool,
    pub tag_ids: Vec<Id>,
    pub defer_date: Option<i64>,
    pub planned_date: Option<i64>,
    pub due_date: Option<i64>,
    pub completed_at: Option<i64>,
    pub dropped_at: Option<i64>,
    pub estimated_minutes: Option<u32>,
    pub repetition: Option<RepetitionRule>,
    pub rank: f64,
    pub created_at: i64,
    pub modified_at: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Perspective {
    Inbox,
    Projects,
    Tags,
    Forecast,
    Flagged,
    Nearby,
    Review,
}

impl Perspective {
    pub const ALL: [Perspective; 7] = [
        Perspective::Inbox,
        Perspective::Projects,
        Perspective::Tags,
        Perspective::Forecast,
        Perspective::Flagged,
        Perspective::Nearby,
        Perspective::Review,
    ];
    pub fn key(self) -> &'static str {
        match self {
            Perspective::Inbox => "inbox",
            Perspective::Projects => "projects",
            Perspective::Tags => "tags",
            Perspective::Forecast => "forecast",
            Perspective::Flagged => "flagged",
            Perspective::Nearby => "nearby",
            Perspective::Review => "review",
        }
    }
    pub fn title(self) -> &'static str {
        match self {
            Perspective::Inbox => "Inbox",
            Perspective::Projects => "Projects",
            Perspective::Tags => "Tags",
            Perspective::Forecast => "Forecast",
            Perspective::Flagged => "Flagged",
            Perspective::Nearby => "Nearby",
            Perspective::Review => "Review",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Availability {
    FirstAvailable,
    Available,
    Remaining,
    Everything,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FlaggedGrouping {
    Ungrouped,
    Project,
    Tag,
    Due,
    Defer,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RowLayout {
    Default,
    CustomFluid,
    CustomColumns,
}

/// Per-perspective View Options (the "eye" popover).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewOptions {
    pub availability: Availability,
    // Projects
    pub show_inbox: bool,
    pub show_folders_in_outline: bool,
    // Tags
    pub sort_by_due_and_flagged: bool,
    // Forecast
    pub forecast_include_planned: bool,
    pub forecast_include_deferred: bool,
    pub forecast_include_notification: bool,
    pub forecast_calendar_events: bool,
    pub forecast_today_flagged: bool,
    pub forecast_tag_id: Option<Id>,
    pub forecast_organized: bool,
    pub forecast_preserve_hierarchy: bool,
    pub forecast_keep_sorted: bool,
    // Review
    pub review_hide_blocked: bool,
    pub review_sort_by_next_review: bool,
    // Flagged
    pub flagged_group_by: FlaggedGrouping,
    // Mac layout
    pub keep_sidebar_hidden: bool,
    pub row_layout: RowLayout,
}

impl Default for ViewOptions {
    fn default() -> Self {
        Self {
            availability: Availability::Remaining,
            show_inbox: false,
            show_folders_in_outline: false,
            sort_by_due_and_flagged: false,
            forecast_include_planned: true,
            forecast_include_deferred: false,
            forecast_include_notification: false,
            forecast_calendar_events: true,
            forecast_today_flagged: true,
            forecast_tag_id: None,
            forecast_organized: false,
            forecast_preserve_hierarchy: true,
            forecast_keep_sorted: false,
            review_hide_blocked: false,
            review_sort_by_next_review: true,
            flagged_group_by: FlaggedGrouping::Ungrouped,
            keep_sidebar_hidden: false,
            row_layout: RowLayout::Default,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    /// hours before a due date at which an item becomes "due soon"
    pub due_soon_hours: u32,
    pub default_due_hour: u32,
    pub default_defer_hour: u32,
    /// 0 = Sunday, 1 = Monday
    pub week_starts_on: u32,
    pub show_badges: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self { due_soon_hours: 48, default_due_hour: 17, default_defer_hour: 0, week_starts_on: 1, show_badges: true }
    }
}

/// UI state that is persisted with the database (perspective, sidebar
/// selection, collapsed rows, pinned items kept visible until Clean Up).
/// Transient state (text selection, search text) lives in the app layer.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiState {
    pub perspective: Perspective,
    /// perspective key -> selected sidebar ids
    pub sidebar_selection: HashMap<String, Vec<Id>>,
    /// content row key or "sb:"+sidebar row key -> collapsed
    pub collapsed: HashMap<String, bool>,
    /// completed/dropped items kept visible until Clean Up
    pub pinned_ids: Vec<Id>,
    pub forecast_selected_day: Option<String>,
    pub focus_ids: Vec<Id>,
}

impl Default for UiState {
    fn default() -> Self {
        Self { perspective: Perspective::Inbox, sidebar_selection: HashMap::new(), collapsed: HashMap::new(), pinned_ids: Vec::new(), forecast_selected_day: None, focus_ids: Vec::new() }
    }
}

/// Everything that is persisted.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Database {
    pub version: u32,
    pub folders: HashMap<Id, Folder>,
    pub projects: HashMap<Id, Project>,
    pub tasks: HashMap<Id, Task>,
    pub tags: HashMap<Id, Tag>,
    pub view_options: HashMap<String, ViewOptions>,
    pub settings: Settings,
    #[serde(default)]
    pub ui: UiState,
}

impl Database {
    pub fn empty() -> Self {
        let mut view_options = HashMap::new();
        for p in Perspective::ALL {
            let mut vo = ViewOptions::default();
            if p == Perspective::Flagged {
                vo.availability = Availability::Available;
            }
            view_options.insert(p.key().to_string(), vo);
        }
        Self { version: 1, folders: HashMap::new(), projects: HashMap::new(), tasks: HashMap::new(), tags: HashMap::new(), view_options, settings: Settings::default(), ui: UiState::default() }
    }

    pub fn view_options(&self, p: Perspective) -> ViewOptions {
        self.view_options.get(p.key()).cloned().unwrap_or_default()
    }

    pub fn sidebar_selection(&self) -> Vec<Id> {
        self.ui.sidebar_selection.get(self.ui.perspective.key()).cloned().unwrap_or_default()
    }
}
