import React, { useEffect, useState } from 'react';
import { store, useSnapshot } from '../core/store';
import { isTauri } from '../core/backend';
import type { CalendarFeed, MailDropConfig, Settings } from '../core/types';
import { mailDropHasPassword, mailDropPollNow, mailDropSetPassword, mailDropTest, refreshCalendars } from '../core/host';
import { installWebNotifications, requestNotificationPermission } from '../core/webNotifications';
import { CalendarIcon, ClockIcon, EyeIcon, GearIcon, InboxPlusIcon, NoteIcon } from './Icons';
import '../styles/settings.css';

if (!isTauri()) installWebNotifications(store);

type Tab = 'general' | 'notifications' | 'calendar' | 'maildrop' | 'appearance' | 'data';

const TABS: { id: Tab; label: string; Icon: (p: React.SVGProps<SVGSVGElement>) => JSX.Element }[] = [
  { id: 'general', label: 'General', Icon: GearIcon },
  { id: 'notifications', label: 'Notifications', Icon: ClockIcon },
  { id: 'calendar', label: 'Calendar', Icon: CalendarIcon },
  { id: 'maildrop', label: 'Mail Drop', Icon: InboxPlusIcon },
  { id: 'appearance', label: 'Appearance', Icon: EyeIcon },
  { id: 'data', label: 'Data', Icon: NoteIcon },
];

const FEED_COLORS = ['#1a86ff', '#f0403e', '#34c759', '#f5a11d', '#7c3fc9', '#5ac8fa', '#ff2d55', '#8e8e93'];

function newId(): string {
  const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 11; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}

function Group({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="st-group">
      {title && <div className="st-group-title">{title}</div>}
      <div className="st-box">{children}</div>
    </div>
  );
}

function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="st-row">
      <div className="st-label">{label}</div>
      <div className="st-control">
        {children}
        {hint && <div className="st-hint">{hint}</div>}
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="st-toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="st-switch" />
      {label && <span>{label}</span>}
    </label>
  );
}

/* ---------------- General ---------------- */
function GeneralTab({ s, set }: { s: Settings; set: (p: Partial<Settings>) => void }) {
  return (
    <>
      <Group title="Dates">
        <Row label="Due soon">
          <select value={s.dueSoonHours} onChange={(e) => set({ dueSoonHours: +e.target.value })}>
            <option value={0}>Today</option>
            <option value={24}>24 hours</option>
            <option value={48}>2 days</option>
            <option value={72}>3 days</option>
            <option value={96}>4 days</option>
            <option value={120}>5 days</option>
            <option value={168}>1 week</option>
          </select>
        </Row>
        <Row label="Default due time" hint="Hour (0–23) used when a due date has no time.">
          <input type="number" min={0} max={23} value={s.defaultDueHour} onChange={(e) => set({ defaultDueHour: Math.min(23, Math.max(0, +e.target.value || 0)) })} />
        </Row>
        <Row label="Default defer time">
          <input type="number" min={0} max={23} value={s.defaultDeferHour} onChange={(e) => set({ defaultDeferHour: Math.min(23, Math.max(0, +e.target.value || 0)) })} />
        </Row>
        <Row label="Week starts on">
          <select value={s.weekStartsOn} onChange={(e) => set({ weekStartsOn: +e.target.value })}>
            <option value={1}>Monday</option>
            <option value={0}>Sunday</option>
          </select>
        </Row>
      </Group>
      <Group title="Perspectives Bar">
        <Row label="Badges">
          <Toggle checked={s.showBadges} onChange={(v) => set({ showBadges: v })} label="Show counts on the Perspectives Bar" />
        </Row>
      </Group>
    </>
  );
}

/* ---------------- Notifications ---------------- */
function NotificationsTab({ s, set }: { s: Settings; set: (p: Partial<Settings>) => void }) {
  const web = !isTauri();
  const perm = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
  return (
    <>
      <Group title="Due Items">
        <Row label="Due">
          <Toggle
            checked={s.notifyDue}
            onChange={(v) => {
              set({ notifyDue: v });
              if (v && web) requestNotificationPermission();
            }}
            label="Notify when items become due"
          />
        </Row>
        <Row label="Ahead of time" hint="0 disables the early reminder.">
          <span className="st-inline">
            Also notify
            <input type="number" min={0} max={1440} step={5} disabled={!s.notifyDue} value={s.notifyBeforeMinutes} onChange={(e) => set({ notifyBeforeMinutes: Math.max(0, Math.min(1440, +e.target.value || 0)) })} />
            minutes before
          </span>
        </Row>
      </Group>
      {web && (
        <div className="st-note">
          {perm === 'granted'
            ? 'Browser notifications are enabled for this site.'
            : perm === 'denied'
              ? 'Notifications are blocked for this site in your browser settings.'
              : perm === 'unsupported'
                ? 'This browser does not support notifications.'
                : 'Your browser will ask for permission when notifications are turned on.'}
        </div>
      )}
      {!web && <div className="st-note">Notifications are delivered by the system Notification Center; adjust their style in System Settings › Notifications.</div>}
    </>
  );
}

/* ---------------- Calendar ---------------- */
function CalendarTab({ s, set }: { s: Settings; set: (p: Partial<Settings>) => void }) {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const feeds = s.calendarFeeds;
  const update = (id: string, patch: Partial<CalendarFeed>) => set({ calendarFeeds: feeds.map((f) => (f.id === id ? { ...f, ...patch } : f)) });
  const remove = (id: string) => set({ calendarFeeds: feeds.filter((f) => f.id !== id) });
  const add = () => {
    const u = url.trim();
    if (!u) return;
    const guess = name.trim() || (() => {
      try {
        const p = new URL(u.replace(/^webcal:/i, 'https:'));
        return decodeURIComponent(p.pathname.split('/').filter(Boolean).pop() ?? p.hostname).replace(/\.ics$/i, '') || p.hostname;
      } catch {
        return 'Calendar';
      }
    })();
    set({ calendarFeeds: [...feeds, { id: newId(), name: guess, url: u, enabled: true, color: FEED_COLORS[feeds.length % FEED_COLORS.length] }] });
    setUrl('');
    setName('');
  };
  const refresh = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const n = await refreshCalendars();
      await store.refresh();
      setStatus(`${n} event${n === 1 ? '' : 's'} loaded`);
    } catch (e) {
      setStatus(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Group title="Subscribed Calendars">
        {feeds.length === 0 && <div className="st-empty">No calendars yet. Events from subscribed calendars appear in Forecast.</div>}
        {feeds.map((f) => (
          <div className="st-feed" key={f.id}>
            <input type="checkbox" checked={f.enabled} title="Show in Forecast" onChange={(e) => update(f.id, { enabled: e.target.checked })} />
            <input type="color" className="st-swatch" value={f.color} title="Colour" onChange={(e) => update(f.id, { color: e.target.value })} />
            <input className="st-feed-name" value={f.name} placeholder="Name" onChange={(e) => update(f.id, { name: e.target.value })} />
            <input className="st-feed-url" value={f.url} placeholder="https://…/calendar.ics" spellCheck={false} onChange={(e) => update(f.id, { url: e.target.value })} />
            <button className="st-remove" title="Remove" onClick={() => remove(f.id)}>
              −
            </button>
          </div>
        ))}
        <div className="st-feed st-feed-add">
          <span className="st-plus">+</span>
          <input className="st-feed-name" value={name} placeholder="Name (optional)" onChange={(e) => setName(e.target.value)} />
          <input
            className="st-feed-url"
            value={url}
            placeholder="Paste a webcal:// or https:// ICS address"
            spellCheck={false}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
          />
          <button className="btn-plain" disabled={!url.trim()} onClick={add}>
            Add Feed
          </button>
        </div>
      </Group>
      <div className="st-actions">
        <button className="btn-plain" disabled={!isTauri() || busy || feeds.length === 0} onClick={() => void refresh()}>
          {busy ? 'Refreshing…' : 'Refresh Now'}
        </button>
        {status && <span className="st-status">{status}</span>}
      </div>
      <div className="st-note">
        {isTauri()
          ? 'Feeds refresh automatically every 30 minutes. Calendar events are shown in Forecast (toggle them in View Options) and never count towards badges.'
          : 'Downloading calendar feeds requires the desktop app — browsers block cross-origin calendar addresses. Your subscriptions are saved and used when the database is opened there.'}
      </div>
    </>
  );
}

/* ---------------- Mail Drop ---------------- */
function MailDropTab({ s, set }: { s: Settings; set: (p: Partial<Settings>) => void }) {
  const web = !isTauri();
  const md = s.mailDrop;
  const setMd = (patch: Partial<MailDropConfig>) => set({ mailDrop: { ...md, ...patch } });
  const [password, setPassword] = useState('');
  const [saved, setSaved] = useState<boolean | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<'test' | 'poll' | null>(null);

  useEffect(() => {
    if (web || !md.username.trim()) {
      setSaved(null);
      return;
    }
    let live = true;
    mailDropHasPassword(md.username.trim())
      .then((v) => live && setSaved(v))
      .catch(() => live && setSaved(null));
    return () => {
      live = false;
    };
  }, [md.username, web]);

  const savePassword = async () => {
    if (web || !md.username.trim()) return;
    try {
      await mailDropSetPassword(md.username.trim(), password);
      setSaved(password.length > 0);
      setPassword('');
    } catch (e) {
      setResult({ ok: false, text: String((e as Error)?.message ?? e) });
    }
  };
  const test = async () => {
    setBusy('test');
    setResult(null);
    try {
      setResult({ ok: true, text: await mailDropTest({ ...md, host: md.host.trim(), username: md.username.trim() }) });
    } catch (e) {
      setResult({ ok: false, text: String((e as Error)?.message ?? e) });
    } finally {
      setBusy(null);
    }
  };
  const poll = async () => {
    setBusy('poll');
    setResult(null);
    try {
      const n = await mailDropPollNow();
      await store.refresh();
      setResult({ ok: true, text: n === 0 ? 'No new messages.' : `${n} item${n === 1 ? '' : 's'} added to the Inbox.` });
    } catch (e) {
      setResult({ ok: false, text: String((e as Error)?.message ?? e) });
    } finally {
      setBusy(null);
    }
  };
  const configured = md.host.trim() && md.username.trim();

  return (
    <>
      <div className="st-lead">Mail sent to this mailbox becomes Inbox items. Subject → name, body → note, “!” prefix → flagged.</div>
      <Group>
        <Row label="Mail Drop">
          <Toggle checked={md.enabled} onChange={(v) => setMd({ enabled: v })} label="Check the mailbox and add new messages to the Inbox" />
        </Row>
      </Group>
      <Group title="IMAP Account">
        <Row label="Host">
          <span className="st-inline">
            <input className="st-wide" value={md.host} placeholder="imap.example.com" spellCheck={false} onChange={(e) => setMd({ host: e.target.value })} />
            <span className="st-sub">Port</span>
            <input type="number" min={1} max={65535} className="st-port" value={md.port} onChange={(e) => setMd({ port: Math.max(1, Math.min(65535, +e.target.value || 993)) })} />
          </span>
        </Row>
        <Row label="Username">
          <input className="st-wide" value={md.username} placeholder="you@example.com" spellCheck={false} autoComplete="off" onChange={(e) => setMd({ username: e.target.value })} />
        </Row>
        <Row label="Password" hint={web ? 'Stored in the system keychain by the desktop app.' : saved === true ? 'Password saved in Keychain.' : saved === false ? 'No password saved yet.' : 'Enter the username first.'}>
          <span className="st-inline">
            <input
              type="password"
              className="st-wide"
              value={password}
              placeholder={saved ? '••••••••' : 'App password'}
              autoComplete="new-password"
              disabled={web || !md.username.trim()}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void savePassword();
                }
              }}
            />
            <button className="btn-plain" disabled={web || !md.username.trim() || !password} onClick={() => void savePassword()}>
              Save
            </button>
          </span>
        </Row>
      </Group>
      <Group title="Mailbox">
        <Row label="Folder" hint="Use a dedicated folder or label so only intended mail becomes actions.">
          <input className="st-wide" value={md.folder} placeholder="INBOX" spellCheck={false} onChange={(e) => setMd({ folder: e.target.value })} />
        </Row>
        <Row label="Archive to" hint="Optional. Processed messages are moved here; otherwise they are only marked as read.">
          <input className="st-wide" value={md.archiveFolder} placeholder="Leave empty to mark as read only" spellCheck={false} onChange={(e) => setMd({ archiveFolder: e.target.value })} />
        </Row>
        <Row label="Check every">
          <span className="st-inline">
            <input type="number" min={1} max={240} value={md.pollMinutes} onChange={(e) => setMd({ pollMinutes: Math.max(1, Math.min(240, +e.target.value || 5)) })} />
            minutes
          </span>
        </Row>
      </Group>
      <div className="st-actions">
        <button className="btn-plain" disabled={web || !configured || busy !== null} onClick={() => void test()}>
          {busy === 'test' ? 'Testing…' : 'Test Connection'}
        </button>
        <button className="btn-plain" disabled={web || !configured || !md.enabled || busy !== null} onClick={() => void poll()}>
          {busy === 'poll' ? 'Checking…' : 'Check Now'}
        </button>
        {result && <span className={'st-status' + (result.ok ? '' : ' err')}>{result.text}</span>}
      </div>
      {web && <div className="st-note">Mailbox polling runs in the desktop app; the settings above are saved with your database.</div>}
    </>
  );
}

/* ---------------- Appearance ---------------- */
function AppearanceTab({ s, set }: { s: Settings; set: (p: Partial<Settings>) => void }) {
  const modes: { id: Settings['appearance']; label: string }[] = [
    { id: 'system', label: 'System' },
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
  ];
  return (
    <Group title="Theme">
      <Row label="Appearance" hint="System follows the light / dark setting of your device.">
        <div className="seg st-seg" role="radiogroup">
          {modes.map((m) => (
            <button key={m.id} role="radio" aria-checked={s.appearance === m.id} className={s.appearance === m.id ? 'on' : ''} onClick={() => set({ appearance: m.id })}>
              {m.label}
            </button>
          ))}
        </div>
      </Row>
    </Group>
  );
}

/* ---------------- Data ---------------- */
function DataTab({ onClose }: { onClose: () => void }) {
  const command = (c: string) => window.dispatchEvent(new CustomEvent('focus:command', { detail: c }));
  return (
    <>
      <Group title="Database">
        <Row label="Backup" hint="The database is a single JSON file.">
          <span className="st-inline">
            <button className="btn-plain" onClick={() => command('export')}>Export Database…</button>
            <button className="btn-plain" onClick={() => command('import')}>Import Database…</button>
          </span>
        </Row>
        <Row label="Reset">
          <span className="st-inline">
            <button
              className="btn-plain"
              onClick={() => {
                if (confirm('Replace the current database with the tutorial project?')) {
                  void store.api.resetToTutorial();
                  onClose();
                }
              }}
            >
              Restore Tutorial
            </button>
            <button
              className="btn-plain"
              onClick={() => {
                if (confirm('Erase everything? This can be undone with ⌘Z in this session only.')) {
                  void store.api.resetEmpty();
                  onClose();
                }
              }}
            >
              Erase Database
            </button>
          </span>
        </Row>
      </Group>
      <div className="st-note">
        <button className="link" onClick={() => command('help')}>Keyboard shortcuts…</button>
      </div>
    </>
  );
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const snap = useSnapshot();
  const [tab, setTab] = useState<Tab>('general');
  if (!snap) return null;
  const s = snap.settings;
  const set = (patch: Partial<Settings>) => void store.api.updateSettings({ ...s, ...patch });
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="qe settings st-window"
        role="dialog"
        aria-label="Settings"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <div className="st-titlebar">
          <span className="st-title">Settings</span>
          <button className="st-close" title="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="st-tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={'st-tab' + (tab === t.id ? ' on' : '')} onClick={() => setTab(t.id)}>
              <span className="st-tab-icon"><t.Icon /></span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
        <div className="st-body" data-tab={tab}>
          {tab === 'general' && <GeneralTab s={s} set={set} />}
          {tab === 'notifications' && <NotificationsTab s={s} set={set} />}
          {tab === 'calendar' && <CalendarTab s={s} set={set} />}
          {tab === 'maildrop' && <MailDropTab s={s} set={set} />}
          {tab === 'appearance' && <AppearanceTab s={s} set={set} />}
          {tab === 'data' && <DataTab onClose={onClose} />}
        </div>
      </div>
    </div>
  );
}
