import { useSyncExternalStore } from 'react';
import { BuiltinPerspective, Database, Folder, ID, ItemPatch, Project, Tag, Task, UIState, ViewOptions } from './types';
import { emptyDatabase, makeFolder, makeProject, makeTag, makeTask, seedDatabase } from './seed';
import { deriveAll, Derived, descendantTaskIds } from './derive';
import { nextOccurrence } from './repeat';
import { addDays, addMonths, addWeeks, addYears } from './dates';

const STORAGE_KEY = 'hemlixfocus.db.v1';

type Listener = () => void;

class Store {
  db: Database;
  derived: Derived;
  private listeners = new Set<Listener>();
  private undoStack: Database[] = [];
  private redoStack: Database[] = [];
  private saveTimer: number | null = null;

  constructor() {
    this.db = load();
    this.derived = deriveAll(this.db);
    // re-derive every minute so "due soon"/"deferred" flip on time
    window.setInterval(() => this.touch(), 60_000);
  }

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getSnapshot = () => this.db;

  private emit() {
    for (const l of this.listeners) l();
  }

  /** Re-derive without a model change (e.g. time passing). */
  touch() {
    this.db = { ...this.db };
    this.derived = deriveAll(this.db);
    this.emit();
  }

  /** UI-only state change: not undoable, persisted. */
  ui(patch: Partial<UIState> | ((ui: UIState) => Partial<UIState>)) {
    const p = typeof patch === 'function' ? patch(this.db.ui) : patch;
    this.db = { ...this.db, ui: { ...this.db.ui, ...p } };
    this.derived = deriveAll(this.db, this.derived.now);
    this.emit();
    this.scheduleSave();
  }

  /** Model change: undoable. */
  mutate(fn: (db: Database) => void) {
    const before = this.db;
    const next: Database = {
      ...before,
      folders: { ...before.folders },
      projects: { ...before.projects },
      tasks: { ...before.tasks },
      tags: { ...before.tags },
      viewOptions: { ...before.viewOptions },
      settings: { ...before.settings },
      ui: { ...before.ui },
    };
    fn(next);
    this.undoStack.push(before);
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack = [];
    this.db = next;
    this.derived = deriveAll(this.db);
    this.emit();
    this.scheduleSave();
  }

  undo() {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(this.db);
    this.db = { ...prev, ui: this.db.ui };
    this.derived = deriveAll(this.db);
    this.emit();
    this.scheduleSave();
  }
  redo() {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.db);
    this.db = { ...next, ui: this.db.ui };
    this.derived = deriveAll(this.db);
    this.emit();
    this.scheduleSave();
  }
  canUndo() {
    return this.undoStack.length > 0;
  }
  canRedo() {
    return this.redoStack.length > 0;
  }

  private scheduleSave() {
    if (this.saveTimer) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.db));
      } catch (e) {
        console.error('save failed', e);
      }
    }, 150);
  }

  // ---------- helpers ----------

  private stamp(x: { modifiedAt: number }, now = Date.now()) {
    x.modifiedAt = now;
  }

  updateTask(id: ID, patch: Partial<Task>) {
    this.mutate((db) => {
      const t = db.tasks[id];
      if (!t) return;
      db.tasks[id] = { ...t, ...patch };
      this.stamp(db.tasks[id]);
    });
  }
  updateProject(id: ID, patch: Partial<Project>) {
    this.mutate((db) => {
      const p = db.projects[id];
      if (!p) return;
      const next = { ...p, ...patch };
      if (patch.status && patch.status !== p.status) {
        const now = Date.now();
        next.completedAt = patch.status === 'done' ? now : null;
        next.droppedAt = patch.status === 'dropped' ? now : null;
      }
      if (patch.reviewInterval && p.lastReviewedAt) next.nextReviewAt = advanceReview(p.lastReviewedAt, patch.reviewInterval);
      db.projects[id] = next;
      this.stamp(db.projects[id]);
    });
  }
  updateTag(id: ID, patch: Partial<Tag>) {
    this.mutate((db) => {
      const t = db.tags[id];
      if (!t) return;
      db.tags[id] = { ...t, ...patch };
      this.stamp(db.tags[id]);
    });
  }
  updateFolder(id: ID, patch: Partial<Folder>) {
    this.mutate((db) => {
      const f = db.folders[id];
      if (!f) return;
      db.folders[id] = { ...f, ...patch };
      this.stamp(db.folders[id]);
    });
  }

  /** Generic update on a task or project. */
  updateItem(id: ID, patch: ItemPatch) {
    if (this.db.tasks[id]) this.updateTask(id, patch as Partial<Task>);
    else if (this.db.projects[id]) this.updateProject(id, patch as Partial<Project>);
    else if (this.db.tags[id]) this.updateTag(id, patch as Partial<Tag>);
    else if (this.db.folders[id]) this.updateFolder(id, patch as Partial<Folder>);
  }

  private nextRank(db: Database, parentId: ID | null, after?: ID | null): number {
    const siblings = Object.values(db.tasks)
      .filter((t) => t.parentId === parentId)
      .sort((a, b) => a.rank - b.rank);
    if (after) {
      const idx = siblings.findIndex((s) => s.id === after);
      if (idx >= 0) {
        const a = siblings[idx].rank;
        const b = siblings[idx + 1]?.rank;
        return b === undefined ? a + 1000 : (a + b) / 2;
      }
    }
    return siblings.length ? siblings[siblings.length - 1].rank + 1000 : 1000;
  }

  addTask(partial: Partial<Task>, opts: { after?: ID | null } = {}): ID {
    const t = makeTask(partial);
    this.mutate((db) => {
      t.rank = this.nextRank(db, t.parentId, opts.after);
      db.tasks[t.id] = t;
    });
    return t.id;
  }
  addProject(partial: Partial<Project>): ID {
    const p = makeProject(partial);
    this.mutate((db) => {
      const siblings = Object.values(db.projects).filter((x) => x.folderId === p.folderId);
      p.rank = siblings.length ? Math.max(...siblings.map((s) => s.rank)) + 1000 : 1000;
      db.projects[p.id] = p;
    });
    return p.id;
  }
  addFolder(partial: Partial<Folder>): ID {
    const f = makeFolder(partial);
    this.mutate((db) => {
      const siblings = Object.values(db.folders).filter((x) => x.parentId === f.parentId);
      f.rank = siblings.length ? Math.max(...siblings.map((s) => s.rank)) + 1000 : 1000;
      db.folders[f.id] = f;
    });
    return f.id;
  }
  addTag(partial: Partial<Tag>): ID {
    const t = makeTag(partial);
    this.mutate((db) => {
      const siblings = Object.values(db.tags).filter((x) => x.parentId === t.parentId);
      t.rank = siblings.length ? Math.max(...siblings.map((s) => s.rank)) + 1000 : 1000;
      db.tags[t.id] = t;
    });
    return t.id;
  }

  deleteItems(ids: ID[]) {
    this.mutate((db) => {
      const d = this.derived;
      const del = new Set<ID>();
      for (const id of ids) {
        if (db.tasks[id]) {
          del.add(id);
          for (const k of descendantTaskIds(d, id)) del.add(k);
        } else if (db.projects[id]) {
          for (const k of descendantTaskIds(d, id)) del.add(k);
          delete db.projects[id];
        } else if (db.tags[id]) {
          const kids = Object.values(db.tags).filter((t) => t.parentId === id);
          for (const k of kids) db.tags[k.id] = { ...k, parentId: db.tags[id].parentId };
          delete db.tags[id];
          for (const t of Object.values(db.tasks)) if (t.tagIds.includes(id)) db.tasks[t.id] = { ...t, tagIds: t.tagIds.filter((x) => x !== id) };
          for (const p of Object.values(db.projects)) if (p.tagIds.includes(id)) db.projects[p.id] = { ...p, tagIds: p.tagIds.filter((x) => x !== id) };
        } else if (db.folders[id]) {
          const f = db.folders[id];
          for (const p of Object.values(db.projects)) if (p.folderId === id) db.projects[p.id] = { ...p, folderId: f.parentId };
          for (const k of Object.values(db.folders)) if (k.parentId === id) db.folders[k.id] = { ...k, parentId: f.parentId };
          delete db.folders[id];
        }
      }
      for (const id of del) delete db.tasks[id];
      db.ui.selection = db.ui.selection.filter((s) => !del.has(s) && !ids.includes(s));
    });
  }

  /** Mark complete (creates the next repetition when applicable). Toggles if already complete. */
  toggleComplete(ids: ID[]) {
    const now = Date.now();
    this.mutate((db) => {
      db.ui = { ...db.ui, pinnedIds: Array.from(new Set([...db.ui.pinnedIds, ...ids])) };
      for (const id of ids) {
        const t = db.tasks[id];
        if (t) {
          if (t.completedAt !== null) {
            db.tasks[id] = { ...t, completedAt: null, modifiedAt: now };
            continue;
          }
          db.tasks[id] = { ...t, completedAt: now, droppedAt: null, modifiedAt: now };
          if (t.repetition) {
            const dates = nextOccurrence(t.repetition, t, now);
            const { id: _oldId, ...rest } = t;
            const nt = makeTask({ ...rest, ...dates, completedAt: null, droppedAt: null, rank: t.rank + 0.5, createdAt: now, modifiedAt: now }, now);
            db.tasks[nt.id] = nt;
            // completed copy loses the repetition so it does not spawn again
            db.tasks[id] = { ...db.tasks[id], repetition: null };
          }
          // complete parent group when "completed by children"
          const parent = t.parentId ? db.tasks[t.parentId] : undefined;
          if (parent?.completedByChildren) {
            const sibs = Object.values(db.tasks).filter((x) => x.parentId === parent.id);
            if (sibs.every((s) => s.completedAt !== null || s.droppedAt !== null)) db.tasks[parent.id] = { ...parent, completedAt: now };
          }
          const proj = t.parentId ? db.projects[t.parentId] : undefined;
          if (proj?.completedByChildren) {
            const sibs = Object.values(db.tasks).filter((x) => x.parentId === proj.id);
            if (sibs.every((s) => s.completedAt !== null || s.droppedAt !== null)) db.projects[proj.id] = { ...proj, status: 'done', completedAt: now };
          }
        } else if (db.projects[id]) {
          const p = db.projects[id];
          db.projects[id] = p.status === 'done' ? { ...p, status: 'active', completedAt: null } : { ...p, status: 'done', completedAt: now, droppedAt: null };
        }
      }
    });
  }

  drop(ids: ID[]) {
    const now = Date.now();
    this.mutate((db) => {
      db.ui = { ...db.ui, pinnedIds: Array.from(new Set([...db.ui.pinnedIds, ...ids])) };
      for (const id of ids) {
        const t = db.tasks[id];
        if (t) db.tasks[id] = { ...t, droppedAt: t.droppedAt ? null : now, completedAt: null, modifiedAt: now };
        else if (db.projects[id]) {
          const p = db.projects[id];
          db.projects[id] = p.status === 'dropped' ? { ...p, status: 'active', droppedAt: null } : { ...p, status: 'dropped', droppedAt: now };
        }
      }
    });
  }

  toggleFlag(ids: ID[]) {
    const items = ids.map((id) => this.db.tasks[id] ?? this.db.projects[id]).filter(Boolean);
    const allFlagged = items.every((i) => i.flagged);
    this.mutate((db) => {
      for (const id of ids) {
        if (db.tasks[id]) db.tasks[id] = { ...db.tasks[id], flagged: !allFlagged };
        else if (db.projects[id]) db.projects[id] = { ...db.projects[id], flagged: !allFlagged };
      }
    });
  }

  /** Move task(s) under a new parent (project/task/null=inbox) at the end, or after a sibling. */
  moveTasks(ids: ID[], parentId: ID | null, after?: ID | null) {
    this.mutate((db) => {
      let prev = after ?? null;
      for (const id of ids) {
        const t = db.tasks[id];
        if (!t) continue;
        // prevent moving under own descendant
        let cur: ID | null = parentId;
        let cycle = false;
        while (cur) {
          if (cur === id) cycle = true;
          cur = db.tasks[cur]?.parentId ?? null;
        }
        if (cycle) continue;
        const rank = this.nextRank(db, parentId, prev);
        db.tasks[id] = { ...t, parentId, rank, modifiedAt: Date.now() };
        prev = id;
      }
    });
  }

  moveProject(id: ID, folderId: ID | null, afterId?: ID | null) {
    this.mutate((db) => {
      const p = db.projects[id];
      if (!p) return;
      const siblings = Object.values(db.projects).filter((x) => x.folderId === folderId && x.id !== id).sort((a, b) => a.rank - b.rank);
      let rank: number;
      if (afterId) {
        const i = siblings.findIndex((s) => s.id === afterId);
        const a = siblings[i]?.rank ?? 0;
        const b = siblings[i + 1]?.rank;
        rank = b === undefined ? a + 1000 : (a + b) / 2;
      } else rank = siblings.length ? siblings[siblings.length - 1].rank + 1000 : 1000;
      db.projects[id] = { ...p, folderId, rank };
    });
  }

  moveTag(id: ID, parentId: ID | null, afterId?: ID | null) {
    this.mutate((db) => {
      const t = db.tags[id];
      if (!t) return;
      let cur = parentId;
      while (cur) {
        if (cur === id) return;
        cur = db.tags[cur]?.parentId ?? null;
      }
      const siblings = Object.values(db.tags).filter((x) => x.parentId === parentId && x.id !== id).sort((a, b) => a.rank - b.rank);
      let rank: number;
      if (afterId) {
        const i = siblings.findIndex((s) => s.id === afterId);
        const a = siblings[i]?.rank ?? 0;
        const b = siblings[i + 1]?.rank;
        rank = b === undefined ? a + 1000 : (a + b) / 2;
      } else rank = siblings.length ? siblings[siblings.length - 1].rank + 1000 : 1000;
      db.tags[id] = { ...t, parentId, rank };
    });
  }

  addTagToItems(ids: ID[], tagId: ID) {
    this.mutate((db) => {
      for (const id of ids) {
        const t = db.tasks[id];
        if (t && !t.tagIds.includes(tagId)) db.tasks[id] = { ...t, tagIds: [...t.tagIds, tagId] };
        const p = db.projects[id];
        if (p && !p.tagIds.includes(tagId)) db.projects[id] = { ...p, tagIds: [...p.tagIds, tagId] };
      }
    });
  }

  /** Clean Up (Cmd+K): compacts completed rows and files inbox items that have a project. */
  cleanUp() {
    // Completed/dropped rows that were kept visible are compacted away.
    this.ui({ selection: [], pinnedIds: [] });
  }

  markReviewed(ids: ID[]) {
    const now = Date.now();
    this.mutate((db) => {
      for (const id of ids) {
        const p = db.projects[id];
        if (!p) continue;
        db.projects[id] = { ...p, lastReviewedAt: now, nextReviewAt: advanceReview(now, p.reviewInterval), modifiedAt: now };
      }
    });
  }

  setViewOptions(p: BuiltinPerspective, patch: Partial<ViewOptions>) {
    this.mutate((db) => {
      db.viewOptions = { ...db.viewOptions, [p]: { ...db.viewOptions[p], ...patch } };
    });
  }

  setSettings(patch: Partial<Database['settings']>) {
    this.mutate((db) => {
      db.settings = { ...db.settings, ...patch };
    });
  }

  resetToTutorial() {
    this.undoStack.push(this.db);
    this.db = seedDatabase();
    this.derived = deriveAll(this.db);
    this.emit();
    this.scheduleSave();
  }
  resetEmpty() {
    this.undoStack.push(this.db);
    this.db = emptyDatabase();
    this.derived = deriveAll(this.db);
    this.emit();
    this.scheduleSave();
  }

  exportJSON(): string {
    return JSON.stringify(this.db, null, 2);
  }
  importJSON(text: string) {
    const parsed = JSON.parse(text) as Database;
    if (parsed.version !== 1) throw new Error('Unsupported database version');
    this.undoStack.push(this.db);
    this.db = parsed;
    this.derived = deriveAll(this.db);
    this.emit();
    this.scheduleSave();
  }
}

export function advanceReview(from: number, iv: Project['reviewInterval']): number {
  switch (iv.unit) {
    case 'day':
      return addDays(from, iv.steps);
    case 'week':
      return addWeeks(from, iv.steps);
    case 'month':
      return addMonths(from, iv.steps);
    case 'year':
      return addYears(from, iv.steps);
  }
}

function load(): Database {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const db = JSON.parse(raw) as Database;
      if (db.version === 1) {
        // forward-compat defaults
        const base = emptyDatabase();
        db.settings = { ...base.settings, ...db.settings };
        db.ui = { ...base.ui, ...db.ui, selection: [], pinnedIds: [] };
        for (const k of Object.keys(base.viewOptions) as BuiltinPerspective[]) db.viewOptions[k] = { ...base.viewOptions[k], ...(db.viewOptions[k] ?? {}) };
        return db;
      }
    }
  } catch (e) {
    console.error('load failed', e);
  }
  return seedDatabase();
}

export const store = new Store();

export function useDB(): Database {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
export function useDerived(): Derived {
  useSyncExternalStore(store.subscribe, store.getSnapshot);
  return store.derived;
}
