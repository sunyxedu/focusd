// Data model mirrors the data model (task / project / folder / tag) and the
// v2 XML database schema (contents.xml).

export type ID = string;

export type ProjectStatus = 'active' | 'onHold' | 'done' | 'dropped';
export type ProjectType = 'parallel' | 'sequential' | 'singleActions';
export type TagStatus = 'active' | 'onHold' | 'dropped';
export type FolderStatus = 'active' | 'dropped';

export type RepeatUnit = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';
export type RepeatMethod = 'fixed' | 'startAfterCompletion' | 'dueAfterCompletion';

export interface RepetitionRule {
  every: number;
  unit: RepeatUnit;
  method: RepeatMethod;
  /** 0 = Sunday … 6 = Saturday; only for weekly fixed schedules */
  weekdays?: number[];
}

export interface ReviewInterval {
  steps: number;
  unit: 'day' | 'week' | 'month' | 'year';
}

interface Base {
  id: ID;
  name: string;
  note: string;
  createdAt: number;
  modifiedAt: number;
  /** ordering rank among siblings */
  rank: number;
}

export interface Folder extends Base {
  kind: 'folder';
  parentId: ID | null;
  status: FolderStatus;
}

export interface Tag extends Base {
  kind: 'tag';
  parentId: ID | null;
  status: TagStatus;
  allowsNextAction: boolean;
}

export interface Project extends Base {
  kind: 'project';
  folderId: ID | null;
  status: ProjectStatus;
  type: ProjectType;
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
}

export interface Task extends Base {
  kind: 'task';
  /** null => inbox item. Otherwise a project id or a parent task id. */
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
}

export type Item = Folder | Tag | Project | Task;
/** Patch applicable to a task or a project (kind excluded, since it differs). */
export type ItemPatch = Partial<Omit<Task, 'kind'> & Omit<Project, 'kind'>>;

export type BuiltinPerspective =
  | 'inbox'
  | 'projects'
  | 'tags'
  | 'forecast'
  | 'flagged'
  | 'nearby'
  | 'review';

export type Availability = 'firstAvailable' | 'available' | 'remaining' | 'everything';
export type RowLayout = 'default' | 'customFluid' | 'customColumns';

export interface ViewOptions {
  availability: Availability;
  // Projects
  showInbox: boolean;
  showFoldersInOutline: boolean;
  // Tags
  sortByDueAndFlagged: boolean;
  // Forecast
  forecastIncludePlanned: boolean;
  forecastIncludeDeferred: boolean;
  forecastIncludeNotification: boolean;
  forecastCalendarEvents: boolean;
  forecastTodayFlagged: boolean;
  forecastTagId: ID | null;
  forecastStructure: 'flexible' | 'organized';
  forecastPreserveHierarchy: boolean;
  forecastKeepSorted: boolean;
  // Review
  reviewHideBlocked: boolean;
  reviewSortByNextReview: boolean;
  // Flagged
  flaggedGroupBy: 'ungrouped' | 'project' | 'tag' | 'due' | 'defer';
  // Mac layout
  keepSidebarHidden: boolean;
  rowLayout: RowLayout;
}

export interface Settings {
  /** hours before a due date at which an item becomes "due soon" */
  dueSoonHours: number;
  /** default due time-of-day (hours) */
  defaultDueHour: number;
  defaultDeferHour: number;
  /** weekday considered start of week: 0 Sunday, 1 Monday */
  weekStartsOn: 0 | 1;
  showBadges: boolean;
  cleanupInboxWhen: 'projectOrTag' | 'projectAndTag' | 'project' | 'tag';
}

export interface Database {
  version: 1;
  folders: Record<ID, Folder>;
  projects: Record<ID, Project>;
  tasks: Record<ID, Task>;
  tags: Record<ID, Tag>;
  viewOptions: Record<BuiltinPerspective, ViewOptions>;
  settings: Settings;
  ui: UIState;
}

export interface UIState {
  perspective: BuiltinPerspective;
  /** sidebar selection per perspective */
  sidebarSelection: Partial<Record<BuiltinPerspective, ID[]>>;
  /** content selection */
  selection: ID[];
  expanded: Record<ID, boolean>;
  collapsedInContent: Record<ID, boolean>;
  noteExpanded: Record<ID, boolean>;
  inspectorVisible: boolean;
  sidebarVisible: boolean;
  focusIds: ID[];
  /** items completed/dropped while shown; stay visible until Clean Up (⌘K) or a perspective change */
  pinnedIds: ID[];
  forecastSelectedDay: string | null; // 'past' | 'future' | 'YYYY-MM-DD'
  search: string;
  searchScope: 'here' | 'remaining' | 'everything';
  history: BuiltinPerspective[];
  historyIndex: number;
}

export const DEFAULT_VIEW_OPTIONS: ViewOptions = {
  availability: 'remaining',
  showInbox: false,
  showFoldersInOutline: false,
  sortByDueAndFlagged: false,
  forecastIncludePlanned: true,
  forecastIncludeDeferred: false,
  forecastIncludeNotification: false,
  forecastCalendarEvents: true,
  forecastTodayFlagged: true,
  forecastTagId: null,
  forecastStructure: 'flexible',
  forecastPreserveHierarchy: true,
  forecastKeepSorted: false,
  reviewHideBlocked: false,
  reviewSortByNextReview: true,
  flaggedGroupBy: 'ungrouped',
  keepSidebarHidden: false,
  rowLayout: 'default',
};

export const DEFAULT_SETTINGS: Settings = {
  dueSoonHours: 48,
  defaultDueHour: 17,
  defaultDeferHour: 0,
  weekStartsOn: 1,
  showBadges: true,
  cleanupInboxWhen: 'projectOrTag',
};
