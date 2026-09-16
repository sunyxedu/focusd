import React, { useEffect, useState } from 'react';
import { store, useSnapshot, useUi } from './core/store';
import { isTauri } from './core/backend';
import { PerspectivesBar, PERSPECTIVE_META } from './components/PerspectivesBar';
import { Toolbar } from './components/Toolbar';
import { Sidebar } from './components/Sidebar';
import { Content, newItemInContext } from './components/Outline';
import { Inspector } from './components/Inspector';
import { QuickEntry } from './components/QuickEntry';
import { QuickOpen } from './components/QuickOpen';
import { SettingsModal } from './components/Settings';
import type { Perspective } from './core/types';

/** Width breakpoints mirroring Focusd' iPhone / iPad / Mac layouts. */
export function useLayoutClass(): 'compact' | 'regular' | 'wide' {
  const calc = () => (window.innerWidth < 700 ? 'compact' : window.innerWidth < 1000 ? 'regular' : 'wide');
  const [cls, setCls] = useState<'compact' | 'regular' | 'wide'>(calc);
  useEffect(() => {
    const on = () => setCls(calc());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return cls;
}

/** Actions reachable from both the native menu bar and keyboard shortcuts. */
export type Command =
  | 'newAction' | 'newProject' | 'newFolder' | 'newTag' | 'quickEntry' | 'quickOpen' | 'import' | 'export' | 'cleanUp'
  | 'undo' | 'redo' | 'selectAll' | 'delete' | 'duplicate' | 'editNote' | 'find'
  | 'toggleSidebar' | 'toggleInspector' | 'viewOptions' | 'expandAll' | 'collapseAll' | 'goBack' | 'goForward' | 'focus' | 'unfocus'
  | 'complete' | 'flag' | 'drop' | 'indent' | 'outdent' | 'moveUp' | 'moveDown' | 'convertToProject' | 'markReviewed'
  | 'settings' | 'help' | 'resetTutorial'
  | `p:${Perspective}`;

export function App() {
  const snap = useSnapshot();
  const ui = useUi();
  const layout = useLayoutClass();
  const [quickEntry, setQuickEntry] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [settings, setSettings] = useState(false);

  useEffect(() => {
    document.body.classList.toggle('tauri', isTauri());
    document.body.classList.toggle('mac', /Mac|iPhone|iPad/.test(navigator.platform) || /Mac/.test(navigator.userAgent));
  }, []);

  useEffect(() => {
    document.body.dataset.layout = layout;
  }, [layout]);

  const run = React.useCallback(
    async (cmd: Command) => {
      const api = store.api;
      const sel = store.ui.selection;
      const s = store.snapshot;
      if (!api || !s) return;
      if (cmd.startsWith('p:')) return void store.goToPerspective(cmd.slice(2) as Perspective);
      switch (cmd) {
        case 'newAction': return newItemInContext();
        case 'newProject': {
          const id = await api.addProject('');
          await store.goToPerspective('projects');
          await api.setSidebarSelection([]);
          store.select([id]);
          window.dispatchEvent(new CustomEvent('focus:edit-name', { detail: id }));
          return;
        }
        case 'newFolder': {
          await store.goToPerspective('projects');
          const id = await api.addFolder('');
          window.dispatchEvent(new CustomEvent('focus:edit-sidebar', { detail: id }));
          return;
        }
        case 'newTag': {
          await store.goToPerspective('tags');
          const id = await api.addTag('');
          window.dispatchEvent(new CustomEvent('focus:edit-sidebar', { detail: id }));
          return;
        }
        case 'quickEntry': return setQuickEntry(true);
        case 'quickOpen': return setQuickOpen(true);
        case 'settings': return setSettings(true);
        case 'cleanUp': return void api.cleanUp();
        case 'undo': return void api.undo();
        case 'redo': return void api.redo();
        case 'selectAll': {
          const ids = s.content.rows.filter((r) => r.kind !== 'header').map((r) => r.id);
          return store.select(ids);
        }
        case 'delete': return sel.length ? void api.deleteItems(sel) : undefined;
        case 'editNote': return sel[0] ? store.setUi({ noteExpanded: { ...store.ui.noteExpanded, [sel[0]]: true } }) : undefined;
        case 'find': return (document.querySelector('[data-search]') as HTMLElement | null)?.focus();
        case 'toggleSidebar': return store.setUi({ sidebarVisible: !store.ui.sidebarVisible });
        case 'toggleInspector': return store.setUi({ inspectorVisible: !store.ui.inspectorVisible });
        case 'viewOptions': return (document.querySelector('[data-view-options]') as HTMLElement | null)?.click();
        case 'expandAll': {
          for (const r of s.content.rows) if (r.kind !== 'event' && r.collapsed) await api.setCollapsed(r.key, false);
          return void api.expandAllSidebar(true);
        }
        case 'collapseAll': {
          for (const r of s.content.rows) if (r.kind !== 'event' && !r.collapsed && (r.kind === 'project' || r.kind === 'folder' || r.kind === 'header' || (r.kind === 'task' && r.info.hasChildren))) await api.setCollapsed(r.key, true);
          return void api.expandAllSidebar(false);
        }
        case 'goBack': return store.goBack();
        case 'goForward': return store.goForward();
        case 'focus': {
          const ids = sel.filter((id) => s.projects[id] || s.folders[id]);
          return ids.length ? void api.setFocus(ids) : undefined;
        }
        case 'unfocus': return void api.setFocus([]);
        case 'complete': return sel.length ? void api.toggleComplete(sel) : undefined;
        case 'flag': return sel.length ? void api.toggleFlag(sel) : undefined;
        case 'drop': return sel.length ? void api.dropItems(sel) : undefined;
        case 'indent': return sel.length ? void api.indent(sel) : undefined;
        case 'outdent': return sel.length ? void api.outdent(sel) : undefined;
        case 'moveUp':
        case 'moveDown': {
          window.dispatchEvent(new CustomEvent('focus:move', { detail: cmd === 'moveUp' ? -1 : 1 }));
          return;
        }
        case 'markReviewed': {
          const ids = sel.filter((id) => s.projects[id]);
          return ids.length ? void api.markReviewed(ids) : undefined;
        }
        case 'resetTutorial': return void api.resetToTutorial();
        case 'import':
        case 'export':
        case 'duplicate':
        case 'convertToProject':
        case 'help':
          window.dispatchEvent(new CustomEvent('focus:command', { detail: cmd }));
          return;
      }
    },
    [],
  );

  // Native menu bar (Tauri) → commands; host-side changes (deep links) → refresh.
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: Array<() => void> = [];
    void import('@tauri-apps/api/event').then(({ listen }) => {
      void listen<string>('menu', (e) => void run(e.payload as Command)).then((u) => unlisten.push(u));
      void listen('core-changed', () => void store.refresh()).then((u) => unlisten.push(u));
    });
    return () => unlisten.forEach((u) => u());
  }, [run]);

  // Keyboard shortcuts (identical on web, where there is no native menu).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      const meta = e.metaKey || e.ctrlKey;
      if (e.ctrlKey && e.altKey && e.code === 'Space') { e.preventDefault(); return void run('quickEntry'); }
      if (!meta) {
        if (!typing && e.key === ' ' && store.ui.selection.length) { e.preventDefault(); return void run('complete'); }
        if (!typing && (e.key === 'Backspace' || e.key === 'Delete') && store.ui.selection.length) { e.preventDefault(); return void run('delete'); }
        if (e.key === 'Escape') { setQuickEntry(false); setQuickOpen(false); setSettings(false); }
        return;
      }
      const k = e.key.toLowerCase();
      const go = (cmd: Command) => { e.preventDefault(); void run(cmd); };
      if (k >= '1' && k <= '7' && !e.shiftKey && !e.altKey) return go(`p:${PERSPECTIVE_META[+k - 1].id}`);
      if (k === 'n' && !e.shiftKey && !e.altKey && !e.ctrlKey) { target?.blur?.(); return go('newAction'); }
      if (k === 'n' && e.shiftKey) return go('newProject');
      if (k === 'n' && e.altKey) return go('newFolder');
      if (k === 'n' && e.ctrlKey && e.metaKey) return go('newTag');
      if (k === 'o' && !e.shiftKey) return go('quickOpen');
      if (k === 'i' && e.altKey) return go('toggleInspector');
      if (k === 's' && e.altKey) return go('toggleSidebar');
      if (k === 'v' && e.shiftKey) return go('viewOptions');
      if (k === 'l' && e.shiftKey) return go('flag');
      if (k === 'f' && e.shiftKey) return go('focus');
      if (k === 'u' && e.shiftKey) return go('unfocus');
      if (k === 'f' && e.altKey) return go('find');
      if (k === 'k' && !typing) return go('cleanUp');
      if (k === 'z' && !typing) return go(e.shiftKey ? 'redo' : 'undo');
      if (k === '[' && !typing) return go(e.ctrlKey && e.metaKey ? 'outdent' : 'goBack');
      if (k === ']' && !typing) return go(e.ctrlKey && e.metaKey ? 'indent' : 'goForward');
      if (k === ',' ) return go('settings');
      if (k === 'r' && e.shiftKey) return go('markReviewed');
      if (k === "'" && !typing) return go('editNote');
      if (k === 'a' && !typing) return go('selectAll');
      if (k === 'd' && !typing) return go('duplicate');
      if (k === 'arrowup' && e.ctrlKey) return go('moveUp');
      if (k === 'arrowdown' && e.ctrlKey) return go('moveDown');
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [run]);

  if (!snap) return <div className="app booting" />;

  const sidebarVisible = ui.sidebarVisible && !snap.viewOptions.keepSidebarHidden;

  return (
    <div className={`app layout-${layout}`}>
      <Toolbar onQuickEntry={() => setQuickEntry(true)} />
      <div className="main">
        <PerspectivesBar />
        {sidebarVisible && <Sidebar />}
        <Content />
        {ui.inspectorVisible && <Inspector />}
      </div>
      {quickEntry && <QuickEntry onClose={() => setQuickEntry(false)} />}
      {quickOpen && <QuickOpen onClose={() => setQuickOpen(false)} />}
      {settings && <SettingsModal onClose={() => setSettings(false)} />}
    </div>
  );
}
