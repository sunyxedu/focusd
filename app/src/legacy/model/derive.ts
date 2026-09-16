// Derived state: effective status, availability, blocking, next actions,
// due-soon / overdue, badges. Mirrors Focusd semantics.
import { Database, Folder, ID, Project, Tag, Task } from './types';
import { startOfDay, endOfDay } from './dates';

export type DueState = 'none' | 'dueSoon' | 'overdue';

export interface TaskInfo {
  task: Task;
  project: Project | null;
  effectiveCompleted: boolean;
  effectiveDropped: boolean;
  /** not completed, not dropped */
  remaining: boolean;
  /** remaining and not deferred and not blocked */
  available: boolean;
  /** available and is the next action of its container (first available) */
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
  effectiveStatus: Project['status'];
  remaining: boolean;
  available: boolean;
  blocked: boolean;
  deferred: boolean;
  dueState: DueState;
  remainingCount: number;
  availableCount: number;
  needsReview: boolean;
}

export interface Derived {
  taskInfo: Record<ID, TaskInfo>;
  projectInfo: Record<ID, ProjectInfo>;
  childrenOf: Record<ID, Task[]>; // parentId (project or task) -> ordered children
  inbox: Task[];
  projectsInFolder: Record<string, Project[]>; // folderId|'root'
  foldersIn: Record<string, Folder[]>;
  tagChildren: Record<string, Tag[]>;
  tagTaskCounts: Record<ID, { available: number; remaining: number }>;
  untaggedCount: { available: number; remaining: number };
  badges: { inbox: number; forecast: number; flagged: number; review: number };
  /** post-order index of every task (children before their group), used to sort flat lists */
  flatOrder: Record<ID, number>;
  now: number;
}

const byRank = <T extends { rank: number }>(a: T, b: T) => a.rank - b.rank;

export function deriveAll(db: Database, now = Date.now()): Derived {
  const tasks = Object.values(db.tasks);
  const projects = Object.values(db.projects);
  const folders = Object.values(db.folders);
  const tags = Object.values(db.tags);

  const childrenOf: Record<ID, Task[]> = {};
  const inbox: Task[] = [];
  for (const t of tasks) {
    if (t.parentId === null) inbox.push(t);
    else (childrenOf[t.parentId] ??= []).push(t);
  }
  for (const k in childrenOf) childrenOf[k].sort(byRank);
  inbox.sort(byRank);

  const projectsInFolder: Record<string, Project[]> = {};
  for (const p of projects) (projectsInFolder[p.folderId ?? 'root'] ??= []).push(p);
  for (const k in projectsInFolder) projectsInFolder[k].sort(byRank);
  const foldersIn: Record<string, Folder[]> = {};
  for (const f of folders) (foldersIn[f.parentId ?? 'root'] ??= []).push(f);
  for (const k in foldersIn) foldersIn[k].sort(byRank);
  const tagChildren: Record<string, Tag[]> = {};
  for (const t of tags) (tagChildren[t.parentId ?? 'root'] ??= []).push(t);
  for (const k in tagChildren) tagChildren[k].sort(byRank);

  // folder effective dropped
  const folderDropped = (id: ID | null): boolean => {
    let cur = id;
    while (cur) {
      const f = db.folders[cur];
      if (!f) return false;
      if (f.status === 'dropped') return true;
      cur = f.parentId;
    }
    return false;
  };
  const tagEffective = (id: ID): Tag['status'] => {
    let cur: ID | null = id;
    let status: Tag['status'] = 'active';
    while (cur) {
      const t: Tag | undefined = db.tags[cur];
      if (!t) break;
      if (t.status === 'dropped') return 'dropped';
      if (t.status === 'onHold') status = 'onHold';
      cur = t.parentId;
    }
    return status;
  };
  const tagAllowsNext = (id: ID): boolean => {
    let cur: ID | null = id;
    while (cur) {
      const t: Tag | undefined = db.tags[cur];
      if (!t) break;
      if (!t.allowsNextAction) return false;
      cur = t.parentId;
    }
    return true;
  };

  const dueSoonMs = db.settings.dueSoonHours * 3_600_000;
  const dueStateOf = (due: number | null, completed: boolean): DueState => {
    if (due === null || completed) return 'none';
    if (due < now) return 'overdue';
    if (due - now <= dueSoonMs) return 'dueSoon';
    return 'none';
  };

  const projectInfo: Record<ID, ProjectInfo> = {};
  for (const p of projects) {
    let eff = p.status;
    if (folderDropped(p.folderId) && eff !== 'done') eff = 'dropped';
    const remaining = eff === 'active' || eff === 'onHold';
    const deferred = p.deferDate !== null && p.deferDate > now;
    projectInfo[p.id] = {
      project: p,
      effectiveStatus: eff,
      remaining,
      available: eff === 'active' && !deferred,
      blocked: false,
      deferred,
      dueState: dueStateOf(p.dueDate, !remaining),
      remainingCount: 0,
      availableCount: 0,
      needsReview: remaining && (p.nextReviewAt === null || p.nextReviewAt <= endOfDay(now)),
    };
  }

  const taskInfo: Record<ID, TaskInfo> = {};

  // Recursive evaluation of a container's children.
  function evalChildren(
    parentId: ID,
    ctx: {
      project: Project | null;
      sequential: boolean;
      parentCompleted: boolean;
      parentDropped: boolean;
      inheritedDefer: number | null;
      inheritedDue: number | null;
      inheritedPlanned: number | null;
      inheritedFlag: boolean;
      parentBlocked: boolean;
      parentOnHold: boolean;
      depth: number;
    },
  ): { anyAvailable: boolean; remaining: number; available: number; allDone: boolean } {
    const kids = childrenOf[parentId] ?? [];
    let anyAvailable = false;
    let remainingCount = 0;
    let availableCount = 0;
    let allDone = kids.length > 0;
    let precedingIncomplete = false; // for sequential
    for (const t of kids) {
      const effCompleted = ctx.parentCompleted || t.completedAt !== null;
      const effDropped = ctx.parentDropped || t.droppedAt !== null;
      const remaining = !effCompleted && !effDropped;
      const effDefer = maxDate(t.deferDate, ctx.inheritedDefer);
      const effDue = minDate(t.dueDate, ctx.inheritedDue);
      const effPlanned = t.plannedDate ?? ctx.inheritedPlanned;
      const effFlag = t.flagged || ctx.inheritedFlag;
      const deferred = effDefer !== null && effDefer > now;
      const tagStatuses = t.tagIds.map(tagEffective);
      const tagOnHold = tagStatuses.some((s) => s === 'onHold');
      const tagDropped = tagStatuses.some((s) => s === 'dropped');
      const onHold = ctx.parentOnHold || tagOnHold;
      const sequentialBlocked = ctx.sequential && precedingIncomplete;
      const blocked = ctx.parentBlocked || sequentialBlocked || onHold || tagDropped;
      const hasChildren = (childrenOf[t.id]?.length ?? 0) > 0;

      // evaluate children first (groups)
      const sub = evalChildren(t.id, {
        project: ctx.project,
        sequential: t.sequential,
        parentCompleted: effCompleted,
        parentDropped: effDropped,
        inheritedDefer: effDefer,
        inheritedDue: effDue,
        inheritedPlanned: effPlanned,
        inheritedFlag: effFlag,
        parentBlocked: blocked || deferred,
        parentOnHold: onHold,
        depth: ctx.depth + 1,
      });

      // An action group with remaining children is itself not available for
      // completion until children are done (Focusd shows it greyed).
      const groupPending = hasChildren && !sub.allDone;
      const available = remaining && !deferred && !blocked && !groupPending;

      taskInfo[t.id] = {
        task: t,
        project: ctx.project,
        effectiveCompleted: effCompleted,
        effectiveDropped: effDropped,
        remaining,
        available,
        isNext: false,
        blocked,
        deferred,
        onHold,
        effectiveDeferDate: effDefer,
        effectiveDueDate: effDue,
        effectivePlannedDate: effPlanned,
        effectiveFlagged: effFlag,
        dueState: dueStateOf(effDue, !remaining),
        depth: ctx.depth,
        hasChildren,
        isGroup: hasChildren,
      };
      if (remaining) {
        remainingCount += 1 + sub.remaining;
        allDone = false;
      }
      if (available) availableCount++;
      availableCount += sub.available;
      if (available || sub.anyAvailable) {
        if (!anyAvailable) {
          // first available in this container is the "next" action
          const target = available ? t.id : firstNextIn(t.id);
          if (target && !t.tagIds.some((id) => !tagAllowsNext(id))) taskInfo[target].isNext = true;
        }
        anyAvailable = true;
      }
      if (remaining) precedingIncomplete = true;
    }
    return { anyAvailable, remaining: remainingCount, available: availableCount, allDone };
  }
  function firstNextIn(id: ID): ID | null {
    for (const k of childrenOf[id] ?? []) {
      const i = taskInfo[k.id];
      if (i?.isNext) return k.id;
      if (i?.available) return k.id;
      const deeper = firstNextIn(k.id);
      if (deeper) return deeper;
    }
    return null;
  }

  for (const p of projects) {
    const pi = projectInfo[p.id];
    const eff = pi.effectiveStatus;
    const projDropped = eff === 'dropped';
    const projDone = eff === 'done';
    const projTagOnHold = p.tagIds.some((id) => tagEffective(id) === 'onHold');
    const res = evalChildren(p.id, {
      project: p,
      sequential: p.type === 'sequential',
      parentCompleted: projDone,
      parentDropped: projDropped,
      inheritedDefer: p.deferDate,
      inheritedDue: p.dueDate,
      inheritedPlanned: p.plannedDate,
      inheritedFlag: p.flagged,
      parentBlocked: eff === 'onHold' || pi.deferred || projTagOnHold,
      parentOnHold: eff === 'onHold' || projTagOnHold,
      depth: 1,
    });
    pi.remainingCount = res.remaining;
    pi.availableCount = res.available;
    pi.blocked = eff === 'onHold' || projTagOnHold;
  }
  // inbox items
  let precedingInbox = false;
  for (const t of inbox) {
    const effCompleted = t.completedAt !== null;
    const effDropped = t.droppedAt !== null;
    const remaining = !effCompleted && !effDropped;
    const deferred = t.deferDate !== null && t.deferDate > now;
    const tagStatuses = t.tagIds.map(tagEffective);
    const onHold = tagStatuses.some((s) => s === 'onHold');
    const hasChildren = (childrenOf[t.id]?.length ?? 0) > 0;
    const sub = evalChildren(t.id, {
      project: null,
      sequential: t.sequential,
      parentCompleted: effCompleted,
      parentDropped: effDropped,
      inheritedDefer: t.deferDate,
      inheritedDue: t.dueDate,
      inheritedPlanned: t.plannedDate,
      inheritedFlag: t.flagged,
      parentBlocked: onHold || deferred,
      parentOnHold: onHold,
      depth: 1,
    });
    const groupPending = hasChildren && !sub.allDone;
    const available = remaining && !deferred && !onHold && !groupPending;
    taskInfo[t.id] = {
      task: t,
      project: null,
      effectiveCompleted: effCompleted,
      effectiveDropped: effDropped,
      remaining,
      available,
      isNext: available,
      blocked: onHold,
      deferred,
      onHold,
      effectiveDeferDate: t.deferDate,
      effectiveDueDate: t.dueDate,
      effectivePlannedDate: t.plannedDate,
      effectiveFlagged: t.flagged,
      dueState: dueStateOf(t.dueDate, !remaining),
      depth: 0,
      hasChildren,
      isGroup: hasChildren,
    };
    precedingInbox = precedingInbox || remaining;
  }

  // tag counts
  const tagTaskCounts: Record<ID, { available: number; remaining: number }> = {};
  for (const t of tags) tagTaskCounts[t.id] = { available: 0, remaining: 0 };
  const untaggedCount = { available: 0, remaining: 0 };
  const bump = (c: { available: number; remaining: number }, i: TaskInfo) => {
    if (i.remaining) c.remaining++;
    if (i.available) c.available++;
  };
  for (const i of Object.values(taskInfo)) {
    if (i.task.tagIds.length === 0) bump(untaggedCount, i);
    for (const tid of i.task.tagIds) {
      let cur: ID | null = tid;
      while (cur) {
        if (tagTaskCounts[cur]) bump(tagTaskCounts[cur], i);
        cur = db.tags[cur]?.parentId ?? null;
      }
    }
  }

  const flatOrder: Record<ID, number> = {};
  let order = 0;
  const post = (parentId: ID) => {
    for (const k of childrenOf[parentId] ?? []) {
      post(k.id);
      flatOrder[k.id] = order++;
    }
  };
  for (const f of foldersIn['root'] ?? []) walkFolder(f.id);
  function walkFolder(fid: ID) {
    for (const f of foldersIn[fid] ?? []) walkFolder(f.id);
    for (const p of projectsInFolder[fid] ?? []) post(p.id);
  }
  for (const p of projectsInFolder['root'] ?? []) post(p.id);
  for (const t of inbox) {
    post(t.id);
    flatOrder[t.id] = order++;
  }

  const infos = Object.values(taskInfo);
  const todayEnd = endOfDay(now);
  const badges = {
    inbox: inbox.filter((t) => taskInfo[t.id].remaining).length,
    forecast: infos.filter((i) => i.remaining && i.effectiveDueDate !== null && i.effectiveDueDate <= todayEnd).length +
      Object.values(projectInfo).filter((p) => p.remaining && p.project.dueDate !== null && p.project.dueDate <= todayEnd).length,
    flagged: infos.filter((i) => i.available && i.effectiveFlagged).length,
    review: Object.values(projectInfo).filter((p) => p.needsReview).length,
  };

  return { taskInfo, projectInfo, childrenOf, inbox, projectsInFolder, foldersIn, tagChildren, tagTaskCounts, untaggedCount, badges, flatOrder, now };
}

function maxDate(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}
function minDate(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

export function containingProjectId(db: Database, taskId: ID): ID | null {
  let cur: ID | null = db.tasks[taskId]?.parentId ?? null;
  while (cur) {
    if (db.projects[cur]) return cur;
    cur = db.tasks[cur]?.parentId ?? null;
  }
  return null;
}

export function ancestorsOf(db: Database, id: ID): ID[] {
  const out: ID[] = [];
  let cur: ID | null = db.tasks[id]?.parentId ?? null;
  while (cur) {
    out.push(cur);
    if (db.projects[cur]) break;
    cur = db.tasks[cur]?.parentId ?? null;
  }
  return out;
}

export function descendantTaskIds(d: Derived, id: ID): ID[] {
  const out: ID[] = [];
  const walk = (x: ID) => {
    for (const k of d.childrenOf[x] ?? []) {
      out.push(k.id);
      walk(k.id);
    }
  };
  walk(id);
  return out;
}

export function isTodayOrBefore(t: number | null, now: number): boolean {
  return t !== null && t <= endOfDay(now);
}
export { startOfDay };
