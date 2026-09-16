// React-facing store: holds the latest Snapshot from the Rust core plus
// transient UI state (selection, search text, panel visibility) that is not
// part of the persisted database.
import { useSyncExternalStore } from 'react';
import { Api } from './api';
import { getBackend, type Backend } from './backend';
import type { ID, Perspective, Snapshot } from './types';

export interface UiState {
  selection: ID[];
  search: string;
  sidebarVisible: boolean;
  inspectorVisible: boolean;
  /** item ids whose note is expanded inline */
  noteExpanded: Record<ID, boolean>;
  history: Perspective[];
  historyIndex: number;
  /** compact (phone) layout navigation stack: 'home' | 'outline' */
  compactScreen: 'home' | 'outline';
}

const UI_KEY = 'focus.ui.v1';

function loadUi(): UiState {
  const base: UiState = {
    selection: [], search: '', sidebarVisible: true, inspectorVisible: false, noteExpanded: {},
    history: ['inbox'], historyIndex: 0, compactScreen: 'home',
  };
  try {
    const raw = localStorage.getItem(UI_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<UiState>;
      return { ...base, sidebarVisible: saved.sidebarVisible ?? true, inspectorVisible: saved.inspectorVisible ?? false };
    }
  } catch { /* ignore */ }
  return base;
}

type Listener = () => void;

export class AppStore {
  snapshot: Snapshot | null = null;
  ui: UiState = loadUi();
  api!: Api;
  backend!: Backend;
  private listeners = new Set<Listener>();
  private refreshing = false;
  private refreshQueued = false;
  /** bumped on every mutation; a refresh only prunes selection if no newer mutation happened meanwhile */
  private mutationSeq = 0;
  private ready: Promise<void>;

  constructor() {
    this.ready = this.boot();
  }

  private async boot() {
    this.backend = await getBackend();
    this.api = new Api(this.backend, () => this.afterMutation());
    await this.refresh();
    window.setInterval(() => this.refresh(), 60_000);
  }

  whenReady() { return this.ready; }

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => { this.listeners.delete(l); };
  };
  getSnapshot = () => this.snapshot;
  getUi = () => this.ui;

  private emit() { for (const l of this.listeners) l(); }

  private afterMutation() {
    this.mutationSeq++;
    void this.refresh();
    void this.backend.persist();
  }

  /** Re-fetch the whole snapshot; coalesces concurrent requests. */
  async refresh() {
    if (this.refreshing) { this.refreshQueued = true; return; }
    this.refreshing = true;
    const seq = this.mutationSeq;
    try {
      const snap = await this.api.snapshot(this.ui.search);
      this.snapshot = snap;
      // prune selection to rows that still exist — but only if this snapshot
      // is current (a mutation during the fetch may have created the id)
      if (seq === this.mutationSeq) {
        const ids = new Set<ID>();
        for (const r of snap.content.rows) if (r.kind !== 'header' && r.kind !== 'event') ids.add(r.id);
        for (const r of snap.sidebar.rows) if (r.id) ids.add(r.id);
        const sel = this.ui.selection.filter((id) => ids.has(id));
        if (sel.length !== this.ui.selection.length) this.ui = { ...this.ui, selection: sel };
      }
      this.emit();
    } finally {
      this.refreshing = false;
      if (this.refreshQueued) { this.refreshQueued = false; void this.refresh(); }
    }
  }

  setUi(patch: Partial<UiState> | ((ui: UiState) => Partial<UiState>)) {
    const p = typeof patch === 'function' ? patch(this.ui) : patch;
    this.ui = { ...this.ui, ...p };
    localStorage.setItem(UI_KEY, JSON.stringify({ sidebarVisible: this.ui.sidebarVisible, inspectorVisible: this.ui.inspectorVisible }));
    this.emit();
    if ('search' in p) void this.refresh();
  }

  select(ids: ID[]) { this.setUi({ selection: ids }); }

  async goToPerspective(p: Perspective, pushHistory = true) {
    if (pushHistory) {
      const history = [...this.ui.history.slice(0, this.ui.historyIndex + 1), p];
      this.setUi({ history, historyIndex: history.length - 1, selection: [], compactScreen: 'outline' });
    } else {
      this.setUi({ selection: [], compactScreen: 'outline' });
    }
    await this.api.setPerspective(p);
  }

  goBack() {
    const i = this.ui.historyIndex - 1;
    if (i < 0) return;
    this.setUi({ historyIndex: i });
    void this.goToPerspective(this.ui.history[i], false);
  }
  goForward() {
    const i = this.ui.historyIndex + 1;
    if (i >= this.ui.history.length) return;
    this.setUi({ historyIndex: i });
    void this.goToPerspective(this.ui.history[i], false);
  }
}

export const store = new AppStore();

export function useSnapshot(): Snapshot | null {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
export function useUi(): UiState {
  return useSyncExternalStore(store.subscribe, store.getUi, store.getUi);
}
