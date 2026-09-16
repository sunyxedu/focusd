// Due notifications for the web build (the desktop host does this natively
// in desktop/src/notify.rs). Polls the core every 30 s for items that just
// came due (and, optionally, N minutes ahead) and shows a browser
// Notification once per (id, due, kind).
import type { AppStore } from './store';

const TICK_MS = 30_000;
const MINUTE = 60_000;

let installed = false;

export function requestNotificationPermission(): void {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'default') void Notification.requestPermission();
}

export function installWebNotifications(store: AppStore): void {
  if (installed || typeof window === 'undefined' || typeof Notification === 'undefined') return;
  installed = true;
  const seen = new Set<string>();

  const post = (name: string, body: string) => {
    if (Notification.permission !== 'granted') return;
    try {
      new Notification(name, { body, tag: `${name}:${body}` });
    } catch {
      /* some browsers only allow notifications from service workers */
    }
  };

  const tick = async () => {
    const snap = store.snapshot;
    const api = store.api;
    if (!snap || !api || !snap.settings.notifyDue) return;
    const now = Date.now();
    for (const item of await api.dueBetween(now - MINUTE, now)) {
      const key = `${item.id}:${item.due}:now`;
      if (seen.has(key)) continue;
      seen.add(key);
      post(item.name, item.project ? `Due now · ${item.project}` : 'Due now');
    }
    const before = snap.settings.notifyBeforeMinutes * MINUTE;
    if (before > 0) {
      for (const item of await api.dueBetween(now + before - MINUTE, now + before)) {
        const key = `${item.id}:${item.due}:before`;
        if (seen.has(key)) continue;
        seen.add(key);
        const prefix = `Due in ${snap.settings.notifyBeforeMinutes} minutes`;
        post(item.name, item.project ? `${prefix} · ${item.project}` : prefix);
      }
    }
    if (seen.size > 5000) seen.clear();
  };

  void store.whenReady().then(() => {
    if (store.snapshot?.settings.notifyDue) requestNotificationPermission();
    void tick();
    window.setInterval(() => void tick(), TICK_MS);
  });
}
