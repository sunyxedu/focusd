import { Database, DEFAULT_SETTINGS, DEFAULT_VIEW_OPTIONS, Folder, Project, Tag, Task, ViewOptions, BuiltinPerspective } from './types';
import { TUTORIAL_TASKS } from './tutorial';
import { addDays, addWeeks } from './dates';

export function newId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  let s = '';
  for (let i = 0; i < 11; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function makeTask(partial: Partial<Task> & { name?: string }, now = Date.now()): Task {
  return {
    kind: 'task',
    name: '',
    note: '',
    createdAt: now,
    modifiedAt: now,
    rank: now,
    parentId: null,
    sequential: false,
    completedByChildren: false,
    flagged: false,
    tagIds: [],
    deferDate: null,
    plannedDate: null,
    dueDate: null,
    completedAt: null,
    droppedAt: null,
    estimatedMinutes: null,
    repetition: null,
    ...partial,
    id: partial.id || newId(),
  };
}

export function makeProject(partial: Partial<Project> & { name?: string }, now = Date.now()): Project {
  return {
    kind: 'project',
    name: '',
    note: '',
    createdAt: now,
    modifiedAt: now,
    rank: now,
    folderId: null,
    status: 'active',
    type: 'parallel',
    completedByChildren: false,
    flagged: false,
    tagIds: [],
    deferDate: null,
    plannedDate: null,
    dueDate: null,
    completedAt: null,
    droppedAt: null,
    estimatedMinutes: null,
    repetition: null,
    reviewInterval: { steps: 1, unit: 'week' },
    lastReviewedAt: now,
    nextReviewAt: addWeeks(now, 1),
    ...partial,
    id: partial.id || newId(),
  };
}

export function makeFolder(partial: Partial<Folder> & { name?: string }, now = Date.now()): Folder {
  return { kind: 'folder', name: '', note: '', createdAt: now, modifiedAt: now, rank: now, parentId: null, status: 'active', ...partial, id: partial.id || newId() };
}

export function makeTag(partial: Partial<Tag> & { name?: string }, now = Date.now()): Tag {
  return { kind: 'tag', name: '', note: '', createdAt: now, modifiedAt: now, rank: now, parentId: null, status: 'active', allowsNextAction: true, ...partial, id: partial.id || newId() };
}

const PERSPECTIVES: BuiltinPerspective[] = ['inbox', 'projects', 'tags', 'forecast', 'flagged', 'nearby', 'review'];

export function emptyDatabase(): Database {
  const viewOptions = {} as Record<BuiltinPerspective, ViewOptions>;
  for (const p of PERSPECTIVES) viewOptions[p] = { ...DEFAULT_VIEW_OPTIONS };
  viewOptions.flagged.availability = 'available';
  return {
    version: 1,
    folders: {},
    projects: {},
    tasks: {},
    tags: {},
    viewOptions,
    settings: { ...DEFAULT_SETTINGS },
    ui: {
      perspective: 'inbox',
      sidebarSelection: {},
      selection: [],
      expanded: {},
      collapsedInContent: {},
      noteExpanded: {},
      inspectorVisible: false,
      sidebarVisible: true,
      focusIds: [],
      pinnedIds: [],
      forecastSelectedDay: null,
      search: '',
      searchScope: 'here',
      history: ['inbox'],
      historyIndex: 0,
    },
  };
}

/** Recreates the tutorial database Focusd ships with (the tutorial): tags tree + tutorial project. */
export function seedDatabase(): Database {
  const db = emptyDatabase();
  const now = Date.now();
  let rank = 0;
  const addTag = (name: string, parentId: string | null = null, extra: Partial<Tag> = {}) => {
    const t = makeTag({ name, parentId, rank: rank++, ...extra }, now);
    db.tags[t.id] = t;
    return t;
  };
  addTag('Home');
  addTag('Office');
  addTag('Phone Calls');
  const errands = addTag('Errands');
  addTag('Supermarket', errands.id);
  addTag('Hardware Store', errands.id);
  addTag('Department Store', errands.id);
  const people = addTag('People');
  addTag('Parents', people.id);
  addTag('Boss', people.id);
  addTag('Doctor', people.id);
  addTag('Waiting', null, { status: 'onHold', allowsNextAction: false });

  const idMap: Record<string, string> = {};
  let trank = 0;
  for (const t of TUTORIAL_TASKS) {
    if (t.isProject) {
      const p = makeProject(
        {
          name: t.name,
          note: t.note,
          rank: trank++,
          lastReviewedAt: new Date(2023, 10, 20).getTime(),
          nextReviewAt: addDays(new Date(2023, 10, 20).getTime(), 7),
        },
        now,
      );
      db.projects[p.id] = p;
      idMap[t.id] = p.id;
    } else {
      const task = makeTask({ name: t.name, note: t.note, parentId: idMap[t.parent!], rank: trank++ }, now);
      db.tasks[task.id] = task;
      idMap[t.id] = task.id;
    }
  }
  db.ui.expanded = Object.fromEntries(Object.keys(db.tags).map((k) => [k, true]));
  return db;
}
