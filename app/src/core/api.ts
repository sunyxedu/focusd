// Typed façade over the JSON bridge (core/src/bridge.rs). One method per
// core entry point so components never spell method names by hand.
import type { Backend } from './backend';
import type * as T from './types';

type Args = Record<string, unknown>;

export class Api {
  constructor(private backend: Backend, private onMutation: () => void) {}

  private q<R>(method: string, args: Args = {}): Promise<R> {
    return this.backend.call<R>(method, args);
  }
  private async m<R = void>(method: string, args: Args = {}): Promise<R> {
    const r = await this.backend.call<R>(method, args);
    this.onMutation();
    return r;
  }

  // queries
  snapshot = (search = '') => this.q<T.Snapshot>('snapshot', { search });
  task = (id: T.ID) => this.q<T.Task | null>('task', { id });
  project = (id: T.ID) => this.q<T.Project | null>('project', { id });
  tag = (id: T.ID) => this.q<T.Tag | null>('tag', { id });
  folder = (id: T.ID) => this.q<T.Folder | null>('folder', { id });
  taskInfo = (id: T.ID) => this.q<T.TaskInfo | null>('taskInfo', { id });
  projectInfo = (id: T.ID) => this.q<T.ProjectInfo | null>('projectInfo', { id });
  breadcrumb = (id: T.ID) => this.q<string[]>('breadcrumb', { id });
  tagList = () => this.q<T.TagListEntry[]>('tagList');
  projectList = () => this.q<T.ProjectListEntry[]>('projectList');
  searchItems = (q: string) => this.q<T.SearchResult[]>('searchItems', { q });
  exportJson = () => this.q<string>('exportJson');

  // date helpers (pure)
  now = () => this.q<number>('now');
  parseDate = (input: string, defaultHour?: number) => this.q<number | null>('parseDate', { input, defaultHour });
  parseDuration = (input: string) => this.q<number | null>('parseDuration', { input });
  formatDuration = (minutes: number) => this.q<string>('formatDuration', { minutes });
  relativeDateLabel = (ms: number) => this.q<string>('relativeDateLabel', { ms });
  relativeDateTimeLabel = (ms: number) => this.q<string>('relativeDateTimeLabel', { ms });
  fullDateLabel = (ms: number) => this.q<string>('fullDateLabel', { ms });
  longDateLabel = (ms: number) => this.q<string>('longDateLabel', { ms });
  timeLabel = (ms: number) => this.q<string>('timeLabel', { ms });
  dayKey = (ms: number) => this.q<string>('dayKey', { ms });
  describeRepetition = (rule: T.RepetitionRule) => this.q<string>('describeRepetition', { rule });

  // UI state
  setPerspective = (perspective: T.Perspective) => this.m('setPerspective', { perspective });
  setSidebarSelection = (ids: T.ID[]) => this.m('setSidebarSelection', { ids });
  setCollapsed = (key: string, collapsed: boolean) => this.m('setCollapsed', { key, collapsed });
  setSidebarExpanded = (key: string, expanded: boolean) => this.m('setSidebarExpanded', { key, expanded });
  expandAllSidebar = (expanded: boolean) => this.m('expandAllSidebar', { expanded });
  setForecastSelectedDay = (day: string | null) => this.m('setForecastSelectedDay', { day });
  setFocus = (ids: T.ID[]) => this.m('setFocus', { ids });
  cleanUp = () => this.m('cleanUp');
  tick = () => this.m('tick');
  setViewOptions = (viewOptions: T.ViewOptions) => this.m('setViewOptions', { viewOptions });
  updateSettings = (settings: T.Settings) => this.m('updateSettings', { settings });

  // mutations
  rename = (id: T.ID, name: string) => this.m('rename', { id, name });
  setNote = (id: T.ID, note: string) => this.m('setNote', { id, note });
  setItemDates = (id: T.ID, defer: number | null, planned: number | null, due: number | null) =>
    this.m('setItemDates', { id, defer, planned, due });
  setItemTags = (id: T.ID, tagIds: T.ID[]) => this.m('setItemTags', { id, tagIds });
  addTagToItems = (ids: T.ID[], tagId: T.ID) => this.m('addTagToItems', { ids, tagId });
  setEstimate = (id: T.ID, minutes: number | null) => this.m('setEstimate', { id, minutes });
  setRepetition = (id: T.ID, rule: T.RepetitionRule | null) => this.m('setRepetition', { id, rule });
  setSequential = (id: T.ID, sequential: boolean) => this.m('setSequential', { id, sequential });
  setCompletedByChildren = (id: T.ID, value: boolean) => this.m('setCompletedByChildren', { id, value });
  toggleFlag = (ids: T.ID[]) => this.m('toggleFlag', { ids });
  toggleComplete = (ids: T.ID[]) => this.m('toggleComplete', { ids });
  dropItems = (ids: T.ID[]) => this.m('dropItems', { ids });
  setProjectStatus = (id: T.ID, status: T.ProjectStatus) => this.m('setProjectStatus', { id, status });
  setProjectType = (id: T.ID, projectType: T.ProjectType) => this.m('setProjectType', { id, projectType });
  setNextReview = (id: T.ID, at: number | null) => this.m('setNextReview', { id, at });
  /** Batch edit; `undefined` leaves a field unchanged, `null` clears it. */
  setDatesForItems = (ids: T.ID[], dates: { defer?: number | null; planned?: number | null; due?: number | null }) =>
    this.m('setDatesForItems', { ids, defer: dates.defer === undefined ? null : { v: dates.defer }, planned: dates.planned === undefined ? null : { v: dates.planned }, due: dates.due === undefined ? null : { v: dates.due } });
  setTagsForItems = (ids: T.ID[], tagIds: T.ID[]) => this.m('setTagsForItems', { ids, tagIds });
  setReviewInterval = (id: T.ID, interval: T.ReviewInterval) => this.m('setReviewInterval', { id, interval });
  setTagStatus = (id: T.ID, status: T.TagStatus) => this.m('setTagStatus', { id, status });
  setTagAllowsNextAction = (id: T.ID, value: boolean) => this.m('setTagAllowsNextAction', { id, value });
  setFolderStatus = (id: T.ID, status: T.FolderStatus) => this.m('setFolderStatus', { id, status });
  addTask = (spec: Partial<T.NewTaskSpec> & { name: string }) =>
    this.m<T.ID>('addTask', {
      spec: {
        note: '', parent: null, after: null, project: null, tagIds: [], flagged: false,
        deferDate: null, plannedDate: null, dueDate: null, estimatedMinutes: null, repetition: null,
        ...spec,
      },
    });
  addProject = (name: string, folder: T.ID | null = null) => this.m<T.ID>('addProject', { name, folder });
  addFolder = (name: string, parent: T.ID | null = null) => this.m<T.ID>('addFolder', { name, parent });
  addTag = (name: string, parent: T.ID | null = null) => this.m<T.ID>('addTag', { name, parent });
  deleteItems = (ids: T.ID[]) => this.m('deleteItems', { ids });
  moveTasks = (ids: T.ID[], parent: T.ID | null, after: T.ID | null) => this.m('moveTasks', { ids, parent, after });
  moveProject = (id: T.ID, folder: T.ID | null, after: T.ID | null) => this.m('moveProject', { id, folder, after });
  moveTag = (id: T.ID, parent: T.ID | null, after: T.ID | null) => this.m('moveTag', { id, parent, after });
  moveFolder = (id: T.ID, parent: T.ID | null, after: T.ID | null) => this.m('moveFolder', { id, parent, after });
  indent = (ids: T.ID[]) => this.m('indent', { ids });
  outdent = (ids: T.ID[]) => this.m('outdent', { ids });
  assignProject = (ids: T.ID[], project: T.ID | null) => this.m('assignProject', { ids, project });
  markReviewed = (ids: T.ID[]) => this.m('markReviewed', { ids });
  duplicateItems = (ids: T.ID[]) => this.m<T.ID[]>('duplicateItems', { ids });
  convertToProject = (id: T.ID) => this.m<T.ID | null>('convertToProject', { id });
  setCalendarEvents = (events: T.CalendarEvent[]) => this.m('setCalendarEvents', { events });
  calendarEvents = () => this.q<T.CalendarEvent[]>('calendarEvents');
  dueBetween = (from: number, to: number) => this.q<T.DueItem[]>('dueBetween', { from, to });
  undo = () => this.m<boolean>('undo');
  redo = () => this.m<boolean>('redo');
  resetToTutorial = () => this.m('resetToTutorial');
  resetEmpty = () => this.m('resetEmpty');
  importJson = (text: string) => this.m('importJson', { text });
}
