import React, { useEffect, useState } from 'react';
import { store, useDB } from './model/store';
import { PerspectivesBar, goToPerspective, PERSPECTIVE_META } from './components/PerspectivesBar';
import { Toolbar } from './components/Toolbar';
import { Sidebar } from './components/Sidebar';
import { Content, newItemInContext, requestNameFocus } from './components/Outline';
import { Inspector } from './components/Inspector';
import { QuickEntry } from './components/QuickEntry';
import { QuickOpen } from './components/QuickOpen';
import { SettingsModal } from './components/Settings';

export function App() {
  const db = useDB();
  const [quickEntry, setQuickEntry] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const vo = db.viewOptions[db.ui.perspective];
  const sidebarVisible = db.ui.sidebarVisible && !vo.keepSidebarHidden;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      const meta = e.metaKey || e.ctrlKey;

      // Quick Entry: ⌃⌥Space
      if (e.ctrlKey && e.altKey && e.code === 'Space') {
        e.preventDefault();
        setQuickEntry(true);
        return;
      }
      if (!meta) return;
      const k = e.key.toLowerCase();
      if (k >= '1' && k <= '7' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        goToPerspective(PERSPECTIVE_META[+k - 1].id);
      } else if (k === 'n' && !e.shiftKey) {
        e.preventDefault();
        (target as HTMLElement)?.blur?.();
        newItemInContext();
      } else if (k === 'n' && e.shiftKey) {
        e.preventDefault();
        const id = store.addProject({ name: '' });
        goToPerspective('projects');
        store.ui({ selection: [id], sidebarSelection: { ...store.db.ui.sidebarSelection, projects: [] } });
        requestNameFocus(id);
      } else if (k === 'o' && !e.shiftKey) {
        e.preventDefault();
        setQuickOpen(true);
      } else if (k === 'i' && e.altKey) {
        e.preventDefault();
        store.ui({ inspectorVisible: !store.db.ui.inspectorVisible });
      } else if (k === 's' && e.altKey) {
        e.preventDefault();
        store.ui({ sidebarVisible: !store.db.ui.sidebarVisible });
      } else if (k === 'v' && e.shiftKey) {
        e.preventDefault();
        (document.querySelector('[data-view-options]') as HTMLElement | null)?.click();
      } else if (k === 'f' && e.shiftKey) {
        e.preventDefault();
        if (store.db.ui.selection.length) store.toggleFlag(store.db.ui.selection);
      } else if (k === 'f' && e.altKey) {
        e.preventDefault();
        (document.querySelector('[data-search]') as HTMLElement | null)?.focus();
      } else if (k === 'k' && !typing) {
        e.preventDefault();
        store.cleanUp();
      } else if (k === 'z') {
        if (typing) return;
        e.preventDefault();
        e.shiftKey ? store.redo() : store.undo();
      } else if (k === '[' ) {
        e.preventDefault();
        const i = store.db.ui.historyIndex - 1;
        if (i >= 0) {
          goToPerspective(store.db.ui.history[i], false);
          store.ui({ historyIndex: i });
        }
      } else if (k === ']') {
        e.preventDefault();
        const i = store.db.ui.historyIndex + 1;
        if (i < store.db.ui.history.length) {
          goToPerspective(store.db.ui.history[i], false);
          store.ui({ historyIndex: i });
        }
      } else if (k === ',') {
        e.preventDefault();
        setSettings(true);
      } else if (k === 'r' && e.shiftKey) {
        e.preventDefault();
        const ids = store.db.ui.selection.filter((id) => store.db.projects[id]);
        if (ids.length) store.markReviewed(ids);
      } else if (k === 'e' && !typing) {
        e.preventDefault();
        const id = store.db.ui.selection[0];
        if (id) store.ui({ noteExpanded: { ...store.db.ui.noteExpanded, [id]: true } });
      } else if (k === 'a' && !typing) {
        e.preventDefault();
        const ids = Array.from(document.querySelectorAll('[data-row-id]')).map((el) => (el as HTMLElement).dataset.rowId!);
        store.ui({ selection: ids });
      } else if (k === 'u' && e.shiftKey) {
        e.preventDefault();
        store.ui({ focusIds: [] });
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  return (
    <div className="app">
      <Toolbar onQuickEntry={() => setQuickEntry(true)} />
      <div className="main">
        <PerspectivesBar />
        {sidebarVisible && <Sidebar />}
        <Content />
        {db.ui.inspectorVisible && <Inspector />}
      </div>
      {quickEntry && <QuickEntry onClose={() => setQuickEntry(false)} />}
      {quickOpen && <QuickOpen onClose={() => setQuickOpen(false)} />}
      {settings && <SettingsModal onClose={() => setSettings(false)} />}
    </div>
  );
}
