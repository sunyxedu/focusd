// TypeScript mirror of the Rust core's serialised types (core/src/*.rs).
// Everything is camelCase JSON; enums serialise as camelCase strings.

export type ID = string;

export type ProjectStatus = 'active' | 'onHold' | 'done' | 'dropped';
export type ProjectType = 'parallel' | 'sequential' | 'singleActions';
export type TagStatus = 'active' | 'onHold' | 'dropped';
export type FolderStatus = 'active' | 'dropped';
export type RepeatUnit = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';
export type RepeatMethod = 'fixed' | 'startAfterCompletion' | 'dueAfterCompletion';
export type ReviewUnit = 'day' | 'week' | 'month' | 'year';
export type Perspective = 'inbox' | 'projects' | 'tags' | 'forecast' | 'flagged' | 'nearby' | 'review';
export type Availability = 'firstAvailable' | 'available' | 'remaining' | 'everything';
export type FlaggedGrouping = 'ungrouped' | 'project' | 'tag' | 'due' | 'defer';
export type RowLayout = 'default' | 'customFluid' | 'customColumns';
export type DueState = 'none' | 'dueSoon' | 'overdue';

export interface RepetitionRule {
  every: number;
  unit: RepeatUnit;
  method: RepeatMethod;
  /** 0 = Sunday … 6 = Saturday; weekly fixed schedules only */
  weekdays: number[];
}

export interface ReviewInterval {
  steps: number;
  unit: ReviewUnit;
}

export interface Folder {
  id: ID;
  name: string;
  note: string;
  parentId: ID | null;
  status: FolderStatus;
  rank: number;
  createdAt: number;
  modifiedAt: number;
}

export interface Tag {
  id: ID;
  name: string;
  note: string;
  parentId: ID | null;
  status: TagStatus;
  allowsNextAction: boolean;
  rank: number;
  createdAt: number;
  modifiedAt: number;
}

export interface Project {
  id: ID;
  name: string;
  note: string;
  folderId: ID | null;
  status: ProjectStatus;
  projectType: ProjectType;
  completedByChildren: boolean;
  flagged: boolean;
  tagIds: ID[];
  deferDate: number | null;
  plannedDate: number | null;
  dueDate: number | null;
  completedAt: number | null;
  droppedAt: number | null;
  estimatedMinutes: number | null;
  repetition: RepetitionRule | null;
  reviewInterval: ReviewInterval;
  lastReviewedAt: number | null;
  nextReviewAt: number | null;
  rank: number;
  createdAt: number;
  modifiedAt: number;
}

export interface Task {
  id: ID;
  name: string;
  note: string;
  /** null = inbox; otherwise a project id or a parent task id */
  parentId: ID | null;
  sequential: boolean;
  completedByChildren: boolean;
  flagged: boolean;
  tagIds: ID[];
  deferDate: number | null;
  plannedDate: number | null;
  dueDate: number | null;
  completedAt: number | null;
  droppedAt: number | null;
  estimatedMinutes: number | null;
  repetition: RepetitionRule | null;
  rank: number;
  createdAt: number;
  modifiedAt: number;
}

export interface TaskInfo {
  task: Task;
  project: Project | null;
  effectiveCompleted: boolean;
  effectiveDropped: boolean;
  remaining: boolean;
  available: boolean;
  isNext: boolean;
  blocked: boolean;
  deferred: boolean;
  onHold: boolean;
  effectiveDeferDate: number | null;
  effectiveDueDate: number | null;
  effectivePlannedDate: number | null;
  effectiveFlagged: boolean;
  dueState: DueState;
  depth: number;
  hasChildren: boolean;
  isGroup: boolean;
}

export interface ProjectInfo {
  project: Project;
  effectiveStatus: ProjectStatus;
  remaining: boolean;
  available: boolean;
  blocked: boolean;
  deferred: boolean;
  dueState: DueState;
  remainingCount: number;
  availableCount: number;
  needsReview: boolean;
  hasChildren: boolean;
}

export interface TagCounts {
  available: number;
  remaining: number;
}

export interface Badges {
  inbox: number;
  forecast: number;
  flagged: number;
  review: number;
}

export interface ViewOptions {
  availability: Availability;
  showInbox: boolean;
  showFoldersInOutline: boolean;
  sortByDueAndFlagged: boolean;
  forecastIncludePlanned: boolean;
  forecastIncludeDeferred: boolean;
  forecastIncludeNotification: boolean;
  forecastCalendarEvents: boolean;
  forecastTodayFlagged: boolean;
  forecastTagId: ID | null;
  forecastOrganized: boolean;
  forecastPreserveHierarchy: boolean;
  forecastKeepSorted: boolean;
  reviewHideBlocked: boolean;
  reviewSortByNextReview: boolean;
  flaggedGroupBy: FlaggedGrouping;
  keepSidebarHidden: boolean;
  rowLayout: RowLayout;
}

export interface CalendarFeed {
  id: ID;
  name: string;
  url: string;
  enabled: boolean;
  color: string;
}

export interface MailDropConfig {
  enabled: boolean;
  host: string;
  port: number;
  username: string;
  folder: string;
  pollMinutes: number;
  archiveFolder: string;
}

export interface Settings {
  dueSoonHours: number;
  defaultDueHour: number;
  defaultDeferHour: number;
  weekStartsOn: number;
  showBadges: boolean;
  notifyDue: boolean;
  notifyBeforeMinutes: number;
  appearance: 'system' | 'light' | 'dark';
  calendarFeeds: CalendarFeed[];
  mailDrop: MailDropConfig;
}

export interface CalendarEvent {
  id: ID;
  feedId: ID;
  title: string;
  location: string;
  start: number;
  end: number;
  allDay: boolean;
  color: string;
}

export interface DueItem {
  id: ID;
  name: string;
  due: number;
  project: string | null;
}

// ---- content (outline) model ----

export interface TaskRow {
  kind: 'task';
  key: string;
  id: ID;
  depth: number;
  task: Task;
  info: TaskInfo;
  showProject: boolean;
  flat: boolean;
  collapsed: boolean;
  repeatLabel: string | null;
}

export interface ProjectRow {
  kind: 'project';
  key: string;
  id: ID;
  depth: number;
  project: Project;
  info: ProjectInfo;
  collapsed: boolean;
  repeatLabel: string | null;
}

export interface FolderRow {
  kind: 'folder';
  key: string;
  id: ID;
  depth: number;
  folder: Folder;
  collapsed: boolean;
}

export interface HeaderRow {
  kind: 'header';
  key: string;
  id: ID;
  depth: number;
  title: string;
  count: number | null;
  sub: string | null;
  dayKey: string | null;
  collapsed: boolean;
}

export interface EventRow {
  kind: 'event';
  key: string;
  id: ID;
  depth: number;
  event: CalendarEvent;
  timeLabel: string;
}

export type Row = TaskRow | ProjectRow | FolderRow | HeaderRow | EventRow;

export interface ContentModel {
  rows: Row[];
  title: string;
  subtitle: string;
  perspective: Perspective;
  emptyMessage: string;
  actionCount: number;
  projectCount: number;
  reviewIndex: number | null;
  reviewTotal: number;
}

// ---- sidebar model ----

export interface ForecastDay {
  /** 'past' | 'future' | YYYY-MM-DD */
  key: string;
  label: string;
  short: string;
  count: number;
  overdue: boolean;
  start: number;
  end: number;
  isToday: boolean;
}

export type ForecastItem = ({ kind: 'task' } & TaskInfo) | ({ kind: 'project' } & ProjectInfo) | ({ kind: 'event' } & CalendarEvent);

export interface ForecastModel {
  days: ForecastDay[];
  items: Record<string, ForecastItem[]>;
}

export type SidebarRowKind = 'folder' | 'project' | 'tag' | 'untagged' | 'reviewProject';

export interface SidebarRow {
  key: string;
  id: ID | null;
  kind: SidebarRowKind;
  name: string;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  dim: boolean;
  selected: boolean;
  status: ProjectStatus | null;
  tagStatus: TagStatus | null;
  projectType: ProjectType | null;
  dueState: DueState;
  needsReview: boolean;
  flagged: boolean;
  remainingCount: number;
  availableCount: number;
}

export interface SidebarModel {
  perspective: Perspective;
  rows: SidebarRow[];
  selection: ID[];
  badges: Badges;
  focused: boolean;
  forecast: ForecastModel | null;
  forecastSelectedDay: string | null;
  reviewTotal: number;
}

export interface Snapshot {
  revision: number;
  perspective: Perspective;
  content: ContentModel;
  sidebar: SidebarModel;
  badges: Badges;
  viewOptions: ViewOptions;
  settings: Settings;
  focusIds: ID[];
  focusLabel: string;
  canUndo: boolean;
  canRedo: boolean;
  now: number;
  tasks: Record<ID, Task>;
  projects: Record<ID, Project>;
  folders: Record<ID, Folder>;
  tags: Record<ID, Tag>;
  tagList: TagListEntry[];
  /** tag id (or "untagged") → counts */
  tagCounts: Record<string, TagCounts>;
  projectList: ProjectListEntry[];
  ui: UiState;
}

export interface UiState {
  perspective: Perspective;
  sidebarSelection: Record<string, ID[]>;
  collapsed: Record<string, boolean>;
  pinnedIds: ID[];
  forecastSelectedDay: string | null;
  focusIds: ID[];
}

export interface NewTaskSpec {
  name: string;
  note: string;
  parent: ID | null;
  after: ID | null;
  project: ID | null;
  tagIds: ID[];
  flagged: boolean;
  deferDate: number | null;
  plannedDate: number | null;
  dueDate: number | null;
  estimatedMinutes: number | null;
  repetition: RepetitionRule | null;
}

export interface TagListEntry {
  tag: Tag;
  depth: number;
  effectiveStatus: TagStatus;
}

export interface ProjectListEntry {
  project: Project;
  folderPath: string;
  info: ProjectInfo;
}

export interface SearchResult {
  kind: 'folder' | 'project' | 'tag';
  id: ID;
  name: string;
  sub: string;
}
