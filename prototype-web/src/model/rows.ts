// Builds the list of rows shown in the content outline for the current
// perspective, applying view options, sidebar selection, focus and search.
import { Database, Folder, ID, Project, Task, ViewOptions, Availability } from './types';
import { Derived, ProjectInfo, TaskInfo } from './derive';
import { addDays, dayKey, endOfDay, startOfDay, weekdayShort } from './dates';

export type Row =
  | { type: 'project'; id: ID; depth: number; project: Project; info: ProjectInfo; key: string }
  | { type: 'task'; id: ID; depth: number; task: Task; info: TaskInfo; showProject: boolean; flat?: boolean; key: string }
  | { type: 'folder'; id: ID; depth: number; folder: Folder; key: string }
  | { type: 'header'; id: ID; depth: number; title: string; count?: number; sub?: string; dayKey?: string; key: string };

export interface ContentModel {
  rows: Row[];
  title: string;
  subtitle: string;
  color: string;
  emptyMessage: string;
  counts: { actions: number; projects: number };
}

let PINNED = new Set<string>();
const availOK = (i: TaskInfo, a: Availability): boolean => {
  if (PINNED.has(i.task.id)) return true;
  switch (a) {
    case 'firstAvailable':
      return i.isNext;
    case 'available':
      return i.available;
    case 'remaining':
      return i.remaining;
    case 'everything':
      return true;
  }
};
const projectAvailOK = (p: ProjectInfo, a: Availability): boolean => {
  if (PINNED.has(p.project.id)) return true;
  switch (a) {
    case 'firstAvailable':
    case 'available':
      return p.available;
    case 'remaining':
      return p.remaining;
    case 'everything':
      return true;
  }
};

const matches = (q: string, ...texts: string[]) => {
  if (!q) return true;
  const l = q.toLowerCase();
  return texts.some((t) => t.toLowerCase().includes(l));
};

export function buildContent(db: Database, d: Derived): ContentModel {
  const p = db.ui.perspective;
  const vo = db.viewOptions[p];
  const q = db.ui.search.trim();
  const sel = db.ui.sidebarSelection[p] ?? [];
  PINNED = new Set(db.ui.pinnedIds);
  switch (p) {
    case 'inbox':
      return buildInbox(db, d, vo, q);
    case 'projects':
      return buildProjects(db, d, vo, q, sel);
    case 'tags':
      return buildTags(db, d, vo, q, sel);
    case 'forecast':
      return buildForecast(db, d, vo, q);
    case 'flagged':
      return buildFlagged(db, d, vo, q);
    case 'review':
      return buildReview(db, d, vo, q, sel);
    case 'nearby':
      return { rows: [], title: 'Nearby', subtitle: '', color: 'var(--c-nearby)', emptyMessage: 'Nearby shows items with tags that have a location. Location services are not available in this build.', counts: { actions: 0, projects: 0 } };
  }
}

/** Nested task tree under a container, filtered by availability + search. Keeps a matching item's ancestors. */
function taskTree(db: Database, d: Derived, parentId: ID, depth: number, vo: ViewOptions, q: string, showProject: boolean, out: Row[], keyPrefix = ''): number {
  let n = 0;
  for (const t of d.childrenOf[parentId] ?? []) {
    const info = d.taskInfo[t.id];
    const selfOK = availOK(info, vo.availability) && matches(q, t.name, t.note);
    const kidsRows: Row[] = [];
    const kidsN = taskTree(db, d, t.id, depth + 1, vo, q, showProject, kidsRows, keyPrefix);
    // groups: show if self passes or any child passes (structure preserved)
    const groupVisible = info.isGroup && (kidsN > 0 || (selfOK && vo.availability !== 'firstAvailable'));
    if (selfOK || groupVisible) {
      out.push({ type: 'task', id: t.id, depth, task: t, info, showProject, key: keyPrefix + t.id });
      n++;
      if (!db.ui.collapsedInContent[t.id]) out.push(...kidsRows);
      n += kidsN;
    }
  }
  return n;
}

function countRows(rows: Row[]) {
  return { actions: rows.filter((r) => r.type === 'task').length, projects: rows.filter((r) => r.type === 'project').length };
}

function summary(c: { actions: number; projects: number }, unit = 'action'): string {
  const parts: string[] = [];
  parts.push(`${c.actions} ${unit}${c.actions === 1 ? '' : 's'}`);
  if (c.projects) parts.push(`${c.projects} project${c.projects === 1 ? '' : 's'}`);
  return parts.join(', ');
}

function buildInbox(db: Database, d: Derived, vo: ViewOptions, q: string): ContentModel {
  const rows: Row[] = [];
  for (const t of d.inbox) {
    const info = d.taskInfo[t.id];
    const kids: Row[] = [];
    const kn = taskTree(db, d, t.id, 1, vo, q, false, kids);
    if ((availOK(info, vo.availability) && matches(q, t.name, t.note)) || kn > 0) {
      rows.push({ type: 'task', id: t.id, depth: 0, task: t, info, showProject: false, key: t.id });
      if (!db.ui.collapsedInContent[t.id]) rows.push(...kids);
    }
  }
  const c = countRows(rows);
  return {
    rows,
    title: 'Inbox',
    subtitle: c.actions === 0 ? 'no items' : `${c.actions} inbox item${c.actions === 1 ? '' : 's'}`,
    color: 'var(--c-inbox)',
    emptyMessage: vo.availability === 'available' ? 'No available items' : vo.availability === 'remaining' ? 'No remaining items' : 'No items',
    counts: c,
  };
}

function projectBlock(db: Database, d: Derived, proj: Project, depth: number, vo: ViewOptions, q: string, rows: Row[]) {
  const info = d.projectInfo[proj.id];
  const kids: Row[] = [];
  const kn = taskTree(db, d, proj.id, depth + 1, vo, q, false, kids);
  const selfOK = projectAvailOK(info, vo.availability) && matches(q, proj.name, proj.note);
  if (q ? selfOK || kn > 0 : selfOK || (vo.availability === 'everything' ? true : kn > 0 && info.remaining)) {
    rows.push({ type: 'project', id: proj.id, depth, project: proj, info, key: proj.id });
    if (!db.ui.collapsedInContent[proj.id]) rows.push(...kids);
  }
}

function folderBlock(db: Database, d: Derived, folderId: string, depth: number, vo: ViewOptions, q: string, rows: Row[], showFolders: boolean) {
  for (const f of d.foldersIn[folderId] ?? []) {
    if (f.status === 'dropped' && vo.availability !== 'everything') continue;
    const start = rows.length;
    if (showFolders) rows.push({ type: 'folder', id: f.id, depth, folder: f, key: f.id });
    const inner = rows.length;
    if (!(showFolders && db.ui.collapsedInContent[f.id])) {
      folderBlock(db, d, f.id, showFolders ? depth + 1 : depth, vo, q, rows, showFolders);
      for (const p of d.projectsInFolder[f.id] ?? []) projectBlock(db, d, p, showFolders ? depth + 1 : depth, vo, q, rows);
    }
    if (showFolders && rows.length === inner && q) rows.splice(start, 1);
  }
}

function buildProjects(db: Database, d: Derived, vo: ViewOptions, q: string, sel: ID[]): ContentModel {
  const rows: Row[] = [];
  const focus = db.ui.focusIds;
  const scope = sel.length ? sel : focus;
  if (vo.showInbox && scope.length === 0) {
    const inboxRows: Row[] = [];
    for (const t of d.inbox) {
      const info = d.taskInfo[t.id];
      if (availOK(info, vo.availability) && matches(q, t.name, t.note)) inboxRows.push({ type: 'task', id: t.id, depth: 1, task: t, info, showProject: false, key: t.id });
    }
    if (inboxRows.length || !q) {
      rows.push({ type: 'header', id: '__inbox', depth: 0, title: 'Inbox', count: inboxRows.length, key: '__inbox' });
      if (!db.ui.collapsedInContent['__inbox']) rows.push(...inboxRows);
    }
  }
  if (scope.length === 0) {
    folderBlock(db, d, 'root', 0, vo, q, rows, vo.showFoldersInOutline);
    for (const p of d.projectsInFolder['root'] ?? []) projectBlock(db, d, p, 0, vo, q, rows);
  } else {
    for (const id of scope) {
      if (db.projects[id]) projectBlock(db, d, db.projects[id], 0, vo, q, rows);
      else if (db.folders[id]) {
        if (vo.showFoldersInOutline) {
          rows.push({ type: 'folder', id, depth: 0, folder: db.folders[id], key: id });
          if (db.ui.collapsedInContent[id]) continue;
        }
        const depth = vo.showFoldersInOutline ? 1 : 0;
        folderBlock(db, d, id, depth, vo, q, rows, vo.showFoldersInOutline);
        for (const p of d.projectsInFolder[id] ?? []) projectBlock(db, d, p, depth, vo, q, rows);
      }
    }
  }
  const c = countRows(rows);
  let title = 'Projects';
  if (scope.length === 1) title = (db.projects[scope[0]] ?? db.folders[scope[0]])?.name || 'Projects';
  else if (scope.length > 1) title = `${scope.length} Items`;
  return {
    rows,
    title,
    subtitle: summary(c),
    color: 'var(--c-projects)',
    emptyMessage: vo.availability === 'available' ? 'No available projects' : vo.availability === 'remaining' ? 'No remaining projects' : 'No projects',
    counts: c,
  };
}

function sortDueFlag(a: TaskInfo, b: TaskInfo): number {
  const ad = a.effectiveDueDate ?? Infinity;
  const bd = b.effectiveDueDate ?? Infinity;
  if (ad !== bd) return ad - bd;
  if (a.effectiveFlagged !== b.effectiveFlagged) return a.effectiveFlagged ? -1 : 1;
  return a.task.rank - b.task.rank;
}

function tagDescendants(d: Derived, id: ID): ID[] {
  const out = [id];
  for (const k of d.tagChildren[id] ?? []) out.push(...tagDescendants(d, k.id));
  return out;
}

function buildTags(db: Database, d: Derived, vo: ViewOptions, q: string, sel: ID[]): ContentModel {
  const rows: Row[] = [];
  const all = Object.values(d.taskInfo);
  const tagsOrdered: (ID | '__untagged')[] = [];
  const walk = (parent: string) => {
    for (const t of d.tagChildren[parent] ?? []) {
      tagsOrdered.push(t.id);
      walk(t.id);
    }
  };
  if (sel.length) for (const s of sel) tagsOrdered.push(s as ID);
  else {
    walk('root');
    tagsOrdered.push('__untagged');
  }
  for (const tid of tagsOrdered) {
    const isUntagged = tid === '__untagged';
    const ids = isUntagged ? [] : tagDescendants(d, tid);
    const idSet = new Set(ids);
    let items = all.filter((i) => (isUntagged ? i.task.tagIds.length === 0 : i.task.tagIds.some((x) => idSet.has(x))));
    items = items.filter((i) => availOK(i, vo.availability) && matches(q, i.task.name, i.task.note));
    if (vo.sortByDueAndFlagged) items.sort(sortDueFlag);
    else items.sort((a, b) => (d.flatOrder[a.task.id] ?? 0) - (d.flatOrder[b.task.id] ?? 0));
    if (!items.length && (q || (sel.length === 0 && !isUntagged))) continue;
    const title = isUntagged ? 'Untagged' : db.tags[tid]?.name ?? '';
    const key = `tag:${tid}`;
    rows.push({ type: 'header', id: key, depth: 0, title, count: items.length, key });
    if (db.ui.collapsedInContent[key]) continue;
    for (const i of items) rows.push({ type: 'task', id: i.task.id, depth: 1, task: i.task, info: i, showProject: true, flat: true, key: key + ':' + i.task.id });
  }
  const c = countRows(rows);
  let title = 'Tags';
  if (sel.length === 1) title = sel[0] === '__untagged' ? 'Untagged' : db.tags[sel[0]]?.name ?? 'Tags';
  else if (sel.length > 1) title = `${sel.length} Tags`;
  return { rows, title, subtitle: summary(c), color: 'var(--c-tags)', emptyMessage: vo.availability === 'available' ? 'No available items' : 'No remaining items', counts: c };
}

export interface ForecastDay {
  key: string; // 'past' | 'future' | YYYY-MM-DD
  label: string;
  short: string;
  count: number;
  overdue: boolean;
  start: number;
  end: number;
  isToday: boolean;
}

/** Items belonging to forecast, keyed by day; used by both sidebar and content. */
export function forecastBuckets(db: Database, d: Derived, vo: ViewOptions): { days: ForecastDay[]; items: Record<string, (TaskInfo | ProjectInfo)[]> } {
  const now = d.now;
  const today = startOfDay(now);
  const days: ForecastDay[] = [];
  days.push({ key: 'past', label: 'Past', short: 'Past', count: 0, overdue: true, start: -Infinity, end: today - 1, isToday: false });
  for (let i = 0; i < 14; i++) {
    const s = addDays(today, i);
    const dt = new Date(s);
    days.push({
      key: dayKey(s),
      label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `${weekdayShort(s)} ${dt.getDate()}`,
      short: i === 0 ? 'Today' : `${weekdayShort(s)} ${dt.getDate()}`,
      count: 0,
      overdue: false,
      start: s,
      end: endOfDay(s),
      isToday: i === 0,
    });
  }
  days.push({ key: 'future', label: 'Future', short: 'Future', count: 0, overdue: false, start: addDays(today, 14), end: Infinity, isToday: false });

  const items: Record<string, (TaskInfo | ProjectInfo)[]> = {};
  for (const day of days) items[day.key] = [];
  const bucketFor = (t: number): ForecastDay => {
    if (t < today) return days[0];
    if (t >= days[days.length - 1].start) return days[days.length - 1];
    return days.find((x) => x.key === dayKey(t)) ?? days[days.length - 1];
  };
  const add = (bucket: ForecastDay, it: TaskInfo | ProjectInfo) => {
    if (!items[bucket.key].includes(it)) items[bucket.key].push(it);
  };
  const remainingTasks = Object.values(d.taskInfo).filter((i) => i.remaining);
  for (const i of remainingTasks) {
    if (i.effectiveDueDate !== null && i.task.dueDate !== null) add(bucketFor(i.task.dueDate), i);
    if (vo.forecastIncludePlanned && i.task.plannedDate !== null) add(bucketFor(i.task.plannedDate), i);
    if (vo.forecastIncludeDeferred && i.task.deferDate !== null) add(bucketFor(i.task.deferDate), i);
    if (vo.forecastTodayFlagged && i.effectiveFlagged && i.available) add(days[1], i);
    if (vo.forecastTagId && i.task.tagIds.includes(vo.forecastTagId) && i.available) add(days[1], i);
  }
  for (const p of Object.values(d.projectInfo).filter((x) => x.remaining)) {
    if (p.project.dueDate !== null) add(bucketFor(p.project.dueDate), p);
    if (vo.forecastIncludePlanned && p.project.plannedDate !== null) add(bucketFor(p.project.plannedDate), p);
    if (vo.forecastIncludeDeferred && p.project.deferDate !== null) add(bucketFor(p.project.deferDate), p);
  }
  for (const day of days) {
    const list = items[day.key];
    list.sort((a, b) => dateOf(a) - dateOf(b));
    day.count = list.length;
  }
  return { days, items };
}
const dateOf = (x: TaskInfo | ProjectInfo) => ('task' in x ? x.effectiveDueDate ?? x.effectivePlannedDate ?? x.effectiveDeferDate : x.project.dueDate ?? x.project.plannedDate ?? x.project.deferDate) ?? Infinity;

function buildForecast(db: Database, d: Derived, vo: ViewOptions, q: string): ContentModel {
  const { days, items } = forecastBuckets(db, d, vo);
  const rows: Row[] = [];
  const selectedDay = db.ui.forecastSelectedDay;
  for (const day of days) {
    if (selectedDay && day.key !== selectedDay) continue;
    let list = items[day.key].filter((x) => ('task' in x ? matches(q, x.task.name, x.task.note) : matches(q, x.project.name, x.project.note)));
    if (!list.length && selectedDay !== day.key) continue;
    const key = `day:${day.key}`;
    rows.push({ type: 'header', id: key, depth: 0, title: day.label, count: list.length, dayKey: day.key, key, sub: day.key === 'past' || day.key === 'future' ? undefined : longDate(day.start) });
    if (db.ui.collapsedInContent[key]) continue;
    for (const x of list) {
      if ('task' in x) rows.push({ type: 'task', id: x.task.id, depth: 1, task: x.task, info: x, showProject: true, flat: true, key: key + ':' + x.task.id });
      else rows.push({ type: 'project', id: x.project.id, depth: 1, project: x.project, info: x, key: key + ':' + x.project.id });
    }
  }
  const c = countRows(rows);
  return { rows, title: 'Forecast', subtitle: '', color: 'var(--c-forecast)', emptyMessage: 'No items', counts: c };
}
function longDate(t: number): string {
  const dt = new Date(t);
  return dt.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

function buildFlagged(db: Database, d: Derived, vo: ViewOptions, q: string): ContentModel {
  const rows: Row[] = [];
  const items = Object.values(d.taskInfo).filter((i) => i.effectiveFlagged && availOK(i, vo.availability) && matches(q, i.task.name, i.task.note));
  const projects = Object.values(d.projectInfo).filter((p) => p.project.flagged && projectAvailOK(p, vo.availability) && matches(q, p.project.name));
  if (vo.flaggedGroupBy === 'ungrouped') {
    items.sort((a, b) => (d.flatOrder[a.task.id] ?? 0) - (d.flatOrder[b.task.id] ?? 0));
    for (const p of projects) rows.push({ type: 'project', id: p.project.id, depth: 0, project: p.project, info: p, key: p.project.id });
    for (const i of items) rows.push({ type: 'task', id: i.task.id, depth: 0, task: i.task, info: i, showProject: true, flat: true, key: i.task.id });
  } else {
    const groups = new Map<string, { title: string; list: TaskInfo[] }>();
    for (const i of items) {
      let gk: string;
      let title: string;
      if (vo.flaggedGroupBy === 'project') {
        gk = i.project?.id ?? '__inbox';
        title = i.project?.name ?? 'Inbox';
      } else if (vo.flaggedGroupBy === 'tag') {
        gk = i.task.tagIds[0] ?? '__untagged';
        title = db.tags[gk]?.name ?? 'Untagged';
      } else {
        const t = vo.flaggedGroupBy === 'due' ? i.effectiveDueDate : i.effectiveDeferDate;
        gk = t === null ? '__none' : dayKey(t);
        title = t === null ? (vo.flaggedGroupBy === 'due' ? 'No Due Date' : 'No Defer Date') : longDate(t);
      }
      const g = groups.get(gk) ?? { title, list: [] };
      g.list.push(i);
      groups.set(gk, g);
    }
    for (const [gk, g] of groups) {
      const key = `fg:${gk}`;
      rows.push({ type: 'header', id: key, depth: 0, title: g.title, count: g.list.length, key });
      if (db.ui.collapsedInContent[key]) continue;
      for (const i of g.list) rows.push({ type: 'task', id: i.task.id, depth: 1, task: i.task, info: i, showProject: true, flat: true, key: key + ':' + i.task.id });
    }
  }
  const c = countRows(rows);
  return {
    rows,
    title: 'Flagged',
    subtitle: summary(c),
    color: 'var(--c-flagged)',
    emptyMessage: vo.availability === 'available' ? 'No available flagged items' : vo.availability === 'remaining' ? 'No remaining flagged items' : 'No flagged items',
    counts: c,
  };
}

export function reviewProjects(db: Database, d: Derived, vo: ViewOptions): ProjectInfo[] {
  let list = Object.values(d.projectInfo).filter((p) => p.remaining || vo.availability === 'everything');
  if (vo.reviewHideBlocked) list = list.filter((p) => p.effectiveStatus === 'active' && !p.deferred);
  if (vo.reviewSortByNextReview) list.sort((a, b) => (a.project.nextReviewAt ?? 0) - (b.project.nextReviewAt ?? 0) || a.project.name.localeCompare(b.project.name));
  else list.sort((a, b) => a.project.rank - b.project.rank);
  return list;
}

function buildReview(db: Database, d: Derived, vo: ViewOptions, q: string, sel: ID[]): ContentModel {
  const list = reviewProjects(db, d, vo);
  const rows: Row[] = [];
  const chosen = sel.length ? list.filter((p) => sel.includes(p.project.id)) : list.slice(0, 1);
  for (const p of chosen) {
    rows.push({ type: 'project', id: p.project.id, depth: 0, project: p.project, info: p, key: p.project.id });
    if (!db.ui.collapsedInContent[p.project.id]) taskTree(db, d, p.project.id, 1, { ...vo, availability: vo.availability }, q, false, rows);
  }
  const c = countRows(rows);
  const idx = chosen.length === 1 ? list.findIndex((p) => p.project.id === chosen[0].project.id) : -1;
  return { rows, title: 'Review', subtitle: idx >= 0 ? `Project ${idx + 1} of ${list.length}` : `${list.length} projects`, color: 'var(--c-review)', emptyMessage: 'No projects to review', counts: c };
}
