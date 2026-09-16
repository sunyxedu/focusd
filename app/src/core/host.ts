// Thin typed wrappers over the Tauri host's native commands
// (desktop/src/lib.rs). Every call fails fast on the web build.
import { isTauri } from './backend';
import type { MailDropConfig } from './types';

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) throw new Error('Available in the desktop app only');
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke<T>(cmd, args);
}

/** Re-download every enabled calendar feed; resolves to the event count. */
export const refreshCalendars = () => invoke<number>('refresh_calendars');

export const mailDropSetPassword = (username: string, password: string) =>
  invoke<void>('mail_drop_set_password', { username, password });

export const mailDropHasPassword = (username: string) => invoke<boolean>('mail_drop_has_password', { username });

/** Verify host / credentials / folder. Resolves to a summary, rejects with a message. */
export const mailDropTest = (config: MailDropConfig) => invoke<string>('mail_drop_test', { config });

/** Poll the mailbox once; resolves to the number of Inbox items created. */
export const mailDropPollNow = () => invoke<number>('mail_drop_poll_now');
