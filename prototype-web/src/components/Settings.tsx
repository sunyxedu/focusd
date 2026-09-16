import React, { useRef } from 'react';
import { store, useDB } from '../model/store';

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const db = useDB();
  const s = db.settings;
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<typeof s>) => store.setSettings(patch);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="qe" style={{ width: 460 }} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
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
          <input type="number" min={0} max={23} value={s.defaultDueHour} onChange={(e) => set({ defaultDueHour: Math.min(23, Math.max(0, +e.target.value)) })} />
          <span>Default defer time</span>
          <input type="number" min={0} max={23} value={s.defaultDeferHour} onChange={(e) => set({ defaultDeferHour: Math.min(23, Math.max(0, +e.target.value)) })} />
          <span>Week starts on</span>
          <select value={s.weekStartsOn} onChange={(e) => set({ weekStartsOn: +e.target.value as 0 | 1 })}>
            <option value={1}>Monday</option>
            <option value={0}>Sunday</option>
          </select>
          <span>Badges</span>
          <label>
            <input type="checkbox" checked={s.showBadges} onChange={(e) => set({ showBadges: e.target.checked })} /> Show counts on Perspectives Bar
          </label>
        </div>
        <div className="settings-actions">
          <button
            className="btn-plain"
            onClick={() => {
              const blob = new Blob([store.exportJSON()], { type: 'application/json' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `HemlixFocus-${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
            }}
          >
            Export Database…
          </button>
          <button className="btn-plain" onClick={() => fileRef.current?.click()}>
            Import Database…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                store.importJSON(await f.text());
                onClose();
              } catch (err) {
                alert('Import failed: ' + (err as Error).message);
              }
            }}
          />
          <button className="btn-plain" onClick={() => { if (confirm('Replace the current database with the tutorial project?')) { store.resetToTutorial(); onClose(); } }}>
            Restore Tutorial
          </button>
          <button className="btn-plain" onClick={() => { if (confirm('Erase everything? This can be undone with ⌘Z in this session only.')) { store.resetEmpty(); onClose(); } }}>
            Erase Database
          </button>
        </div>
        <div className="insp-meta" style={{ marginTop: 12 }}>
          Shortcuts: ⌘1–7 perspectives · ⌘N new · ⌃⌥Space quick entry · ⌘O quick open · Space complete · ⇧⌘F flag · ⌘K clean up · ⌥⌘I inspector · ⇧⌘V view options · ⌘Z undo · ⌘, settings
        </div>
        <div className="qe-foot">
          <button className="btn-blue" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
