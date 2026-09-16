// Appearance (light / dark / system): resolves settings.appearance and the
// OS preference into `body.dark`, keeps `color-scheme` on <html> in sync so
// native controls and scrollbars follow, and (in Tauri) sets the native
// window theme so the title bar / traffic-light area matches.
import '../styles/dark.css';
import { isTauri } from './backend';
import type { AppStore } from './store';

export type Appearance = 'system' | 'light' | 'dark';

const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function resolveDark(appearance: Appearance, osDark: boolean): boolean {
  return appearance === 'dark' || (appearance === 'system' && osDark);
}

let lastApplied: string | null = null;

function apply(appearance: Appearance) {
  const dark = resolveDark(appearance, media?.matches ?? false);
  document.body.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  const key = `${appearance}:${dark}`;
  if (key === lastApplied) return;
  lastApplied = key;
  if (isTauri()) {
    void import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => getCurrentWindow().setTheme(appearance === 'system' ? null : appearance))
      .catch(() => {
        /* older hosts without setTheme */
      });
  }
}

export function installAppearance(store: AppStore): void {
  const current = (): Appearance => (store.snapshot?.settings.appearance as Appearance | undefined) ?? 'system';
  apply(current());
  store.subscribe(() => apply(current()));
  media?.addEventListener?.('change', () => apply(current()));
}
