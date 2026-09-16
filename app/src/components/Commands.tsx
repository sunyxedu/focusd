// Renders nothing; performs the commands App.tsx routes through the
// `focus:command` window event (menu bar + shortcuts): database
// import / export and the keyboard-shortcuts sheet.
import React, { useEffect, useState } from 'react';
import { store } from '../core/store';
import { isTauri } from '../core/backend';

const SHORTCUTS: [string, string][] = [
  ['⌘1 – ⌘7', 'Inbox, Projects, Tags, Forecast, Flagged, Nearby, Review'],
  ['⌘N', 'New Action'],
  ['⇧⌘N', 'New Project'],
  ['⌥⌘N', 'New Folder'],
  ['⌃⌥Space', 'Quick Entry'],
  ['⌘O', 'Quick Open'],
  ['⌘K', 'Clean Up'],
  ['⌥⌘I', 'Show / Hide Inspector'],
  ['⌥⌘S', 'Show / Hide Sidebar'],
  ['⇧⌘V', 'View Options'],
  ['⇧⌘L', 'Flag / Unflag'],
  ['⇧⌘F', 'Focus'],
  ['⇧⌘U', 'Unfocus'],
  ['⇧⌘R', 'Mark Reviewed'],
  ['Space', 'Complete'],
  ["⌘'", 'Edit Note'],
  ['⌘[ / ⌘]', 'Back / Forward'],
  ['⌃⌘[ / ⌃⌘]', 'Outdent / Indent'],
  ['⌃⌘↑ / ⌃⌘↓', 'Move Up / Down'],
  ['⌘Z / ⇧⌘Z', 'Undo / Redo'],
  ['⌘,', 'Settings'],
];

async function exportDatabase() {
  const json = await store.api.exportJson();
  const name = `focus-database-${new Date().toISOString().slice(0, 10)}.json`;
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    const path = await save({ defaultPath: name, filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (path) await writeTextFile(path, json);
    return;
  }
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importDatabase() {
  let text: string | null = null;
  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const { readTextFile } = await import('@tauri-apps/plugin-fs');
    const path = await open({ multiple: false, filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (typeof path === 'string') text = await readTextFile(path);
  } else {
    text = await new Promise<string | null>((resolve) => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'application/json';
      inp.onchange = async () => resolve(inp.files?.[0] ? await inp.files[0].text() : null);
      inp.oncancel = () => resolve(null);
      inp.click();
    });
  }
  if (!text) return;
  try {
    await store.api.importJson(text);
  } catch (err) {
    alert('Import failed: ' + String(err));
  }
}

export function Commands() {
  const [help, setHelp] = useState(false);
  useEffect(() => {
    const on = (e: Event) => {
      const cmd = (e as CustomEvent<string>).detail;
      if (cmd === 'export') void exportDatabase();
      else if (cmd === 'import') void importDatabase();
      else if (cmd === 'help') setHelp(true);
      // 'duplicate' / 'convertToProject' need core support (not yet available).
    };
    window.addEventListener('focus:command', on);
    return () => window.removeEventListener('focus:command', on);
  }, []);
  if (!help) return null;
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && setHelp(false)}>
      <div className="qe help" style={{ width: 440 }} role="dialog" aria-label="Keyboard Shortcuts" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setHelp(false); } }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Keyboard Shortcuts</div>
        <div className="help-grid">
          {SHORTCUTS.map(([k, v]) => (
            <React.Fragment key={k}>
              <kbd>{k}</kbd>
              <span>{v}</span>
            </React.Fragment>
          ))}
        </div>
        <div className="qe-foot">
          <button className="btn-blue" autoFocus onClick={() => setHelp(false)}>Done</button>
        </div>
      </div>
    </div>
  );
}
