import React from 'react';
import { store, useSnapshot } from '../core/store';
import type { Settings } from '../core/types';

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const snap = useSnapshot();
  if (!snap) return null;
  const s = snap.settings;
  const set = (patch: Partial<Settings>) => void store.api.updateSettings({ ...s, ...patch });
  const command = (c: string) => window.dispatchEvent(new CustomEvent('focus:command', { detail: c }));
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="qe settings" style={{ width: 460 }} role="dialog" aria-label="Settings" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Settings</div>
        <div className="settings-grid">
          <span>Due soon</span>
          <select value={s.dueSoonHours} onChange={(e) => set({ dueSoonHours: +e.target.value })}>
            <option value={0}>Today</option>
            <option value={24}>24 hours</option>
            <option value={48}>2 days</option>
            <option value={72}>3 days</option>
            <option value={96}>4 days</option>
            <option value={120}>5 days</option>
            <option value={168}>1 week</option>
          </select>
          <span>Default due time</span>
          <input type="number" min={0} max={23} value={s.defaultDueHour} onChange={(e) => set({ defaultDueHour: Math.min(23, Math.max(0, +e.target.value || 0)) })} />
          <span>Default defer time</span>
          <input type="number" min={0} max={23} value={s.defaultDeferHour} onChange={(e) => set({ defaultDeferHour: Math.min(23, Math.max(0, +e.target.value || 0)) })} />
          <span>Week starts on</span>
          <select value={s.weekStartsOn} onChange={(e) => set({ weekStartsOn: +e.target.value })}>
            <option value={1}>Monday</option>
            <option value={0}>Sunday</option>
          </select>
          <span>Badges</span>
          <label>
            <input type="checkbox" checked={s.showBadges} onChange={(e) => set({ showBadges: e.target.checked })} /> Show counts on Perspectives Bar
          </label>
        </div>
        <div className="settings-actions">
          <button className="btn-plain" onClick={() => command('export')}>Export Database…</button>
          <button className="btn-plain" onClick={() => command('import')}>Import Database…</button>
          <button className="btn-plain" onClick={() => { if (confirm('Replace the current database with the tutorial project?')) { void store.api.resetToTutorial(); onClose(); } }}>
            Restore Tutorial
          </button>
          <button className="btn-plain" onClick={() => { if (confirm('Erase everything? This can be undone with ⌘Z in this session only.')) { void store.api.resetEmpty(); onClose(); } }}>
            Erase Database
          </button>
        </div>
        <div className="insp-meta" style={{ marginTop: 12 }}>
          <button className="link" onClick={() => command('help')}>Keyboard shortcuts…</button>
        </div>
        <div className="qe-foot">
          <button className="btn-blue" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
