// Transport to the Rust core. Two implementations:
//  - TauriBackend: the core runs natively inside the Tauri process; every
//    call is an IPC `invoke`. Persistence is handled by the host.
//  - WasmBackend:  the core runs as WebAssembly in the page (web build);
//    the page persists the exported JSON in IndexedDB.
// Both expose the same `call(method, args)` shape (see core/src/bridge.rs).

export interface Backend {
  readonly kind: 'tauri' | 'wasm';
  call<T = unknown>(method: string, args?: Record<string, unknown>): Promise<T>;
  /** Called by the store after each mutation; wasm persists here. */
  persist(): Promise<void>;
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export const isTauri = (): boolean => typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;

class TauriBackend implements Backend {
  readonly kind = 'tauri' as const;
  private invoke!: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  async init() {
    const mod = await import('@tauri-apps/api/core');
    this.invoke = mod.invoke;
    return this;
  }
  call<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
    return this.invoke('call', { method, args }) as Promise<T>;
  }
  async persist() {
    /* host saves after every mutation */
  }
}

const DB_NAME = 'focus-db';
const DB_STORE = 'kv';
const DB_KEY = 'database';

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(): Promise<string | null> {
  try {
    const db = await openIdb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const req = tx.objectStore(DB_STORE).get(DB_KEY);
      req.onsuccess = () => resolve((req.result as string) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return localStorage.getItem(DB_KEY);
  }
}

async function idbSet(text: string): Promise<void> {
  try {
    const db = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(text, DB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    localStorage.setItem(DB_KEY, text);
  }
}

class WasmBackend implements Backend {
  readonly kind = 'wasm' as const;
  private store!: { call(method: string, args: string): string; revision(): number };
  private saveTimer: number | null = null;
  private lastSaved = -1;

  async init() {
    const wasm = await import('../../wasm/hemlixfocus_core.js');
    await wasm.default();
    const saved = await idbGet();
    this.store = new wasm.WasmStore(true, saved ?? undefined);
    this.lastSaved = this.store.revision();
    return this;
  }
  async call<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
    const out = this.store.call(method, JSON.stringify(args));
    return JSON.parse(out) as T;
  }
  async persist() {
    if (this.saveTimer !== null) return;
    this.saveTimer = window.setTimeout(async () => {
      this.saveTimer = null;
      const rev = this.store.revision();
      if (rev === this.lastSaved) return;
      this.lastSaved = rev;
      await idbSet(JSON.parse(this.store.call('exportJson', '{}')) as string);
    }, 250);
  }
}

let backendPromise: Promise<Backend> | null = null;

export function getBackend(): Promise<Backend> {
  if (!backendPromise) {
    backendPromise = isTauri() ? new TauriBackend().init() : new WasmBackend().init();
  }
  return backendPromise;
}
