// Phone ("compact") layout, mirroring Focusd for iPhone: a Home screen
// listing the perspectives, then a navigation stack (sidebar list → outline),
// with the Inspector and Quick Entry presented as bottom sheets. Reuses the
// desktop components (Sidebar, Content, Inspector) restyled by compact.css.
import React, { useEffect, useRef, useState } from 'react';
import { store, useSnapshot, useUi } from '../core/store';
import type { Perspective } from '../core/types';
import { PERSPECTIVE_META } from './PerspectivesBar';
import { Sidebar } from './Sidebar';
import { Content } from './Outline';
import { Inspector } from './Inspector';
import { ViewOptionsPopover } from './ViewOptions';
import { ChevronLeft, ChevronRight, EyeIcon, GearIcon, InboxPlusIcon, InfoIcon, SearchIcon } from './Icons';
import '../styles/compact.css';

const LIST_PERSPECTIVES: Perspective[] = ['projects', 'tags', 'review'];

function Home({ onQuickEntry, onSettings }: { onQuickEntry: () => void; onSettings: () => void }) {
  const snap = useSnapshot();
  if (!snap) return null;
  const badges = snap.settings.showBadges ? snap.badges : { inbox: 0, forecast: 0, flagged: 0, review: 0 };
  return (
    <div className="c-screen c-home">
      <div className="c-nav">
        <div className="c-nav-title large">Perspectives</div>
      </div>
      <div className="c-scroll">
        <div className="c-group">
          {PERSPECTIVE_META.map((m) => {
            const badge = (badges as unknown as Record<string, number>)[m.id] ?? 0;
            return (
              <button key={m.id} className="c-item" onClick={() => void store.goToPerspective(m.id)}>
                <m.Icon style={{ color: m.color }} />
                <span className="c-item-label">{m.label}</span>
                {badge > 0 && <span className={'c-badge ' + m.id}>{badge}</span>}
                <ChevronRight className="c-chev" />
              </button>
            );
          })}
        </div>
      </div>
      <div className="c-bottombar">
        <button className="c-bb-btn" title="Settings" onClick={onSettings}>
          <GearIcon />
        </button>
        <span className="c-bb-spacer" />
        <button className="c-bb-btn accent" title="New Inbox Item" onClick={onQuickEntry}>
          <InboxPlusIcon />
        </button>
      </div>
    </div>
  );
}

function Screen({ onQuickEntry }: { onQuickEntry: () => void }) {
  const snap = useSnapshot();
  const ui = useUi();
  const p = snap?.perspective ?? 'inbox';
  const hasList = LIST_PERSPECTIVES.includes(p);
  const [sub, setSub] = useState<'list' | 'outline'>(hasList ? 'list' : 'outline');
  const [search, setSearch] = useState(false);
  const [vo, setVo] = useState(false);
  const voRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSub(LIST_PERSPECTIVES.includes(p) ? 'list' : 'outline');
    setSearch(false);
  }, [p]);

  if (!snap) return null;
  const meta = PERSPECTIVE_META.find((m) => m.id === p)!;
  const showList = hasList && sub === 'list';
  const selName =
    snap.sidebar.selection.length === 1
      ? (snap.projects[snap.sidebar.selection[0]] ?? snap.folders[snap.sidebar.selection[0]] ?? snap.tags[snap.sidebar.selection[0]])?.name ??
        (snap.sidebar.selection[0] === '__untagged' ? 'Untagged' : null)
      : null;
  const title = showList ? meta.label : selName || meta.label;
  const backLabel = showList || !hasList ? 'Home' : meta.label;
  const back = () => {
    if (hasList && sub === 'outline') {
      setSub('list');
      store.select([]);
    } else {
      store.setUi({ compactScreen: 'home', inspectorVisible: false, selection: [] });
    }
  };
  // A tap on a sidebar row (after the Sidebar's own click handler selected it)
  // pushes the outline.
  const onListClick = (e: React.MouseEvent) => {
    const row = (e.target as HTMLElement).closest('.sb-row');
    if (!row || (e.target as HTMLElement).closest('.disclosure')) return;
    window.setTimeout(() => setSub('outline'), 0);
  };
  const canInspect = ui.selection.length > 0 || (!showList && hasList && snap.sidebar.selection.length === 1);
  const openInspector = () => {
    if (!ui.selection.length && snap.sidebar.selection.length === 1) store.select([snap.sidebar.selection[0]]);
    store.setUi({ inspectorVisible: true });
  };

  return (
    <div className="c-screen" data-sub={showList ? 'list' : 'outline'}>
      <div className="c-nav">
        <button className="c-back" onClick={back}>
          <ChevronLeft />
          <span>{backLabel}</span>
        </button>
        <div className="c-nav-title" style={{ color: meta.color }}>
          {title}
        </div>
        <div className="c-nav-right">
          <button className={'c-nav-btn' + (search ? ' on' : '')} title="Search" onClick={() => setSearch((s) => !s)}>
            <SearchIcon />
          </button>
          <button ref={voRef} className={'c-nav-btn' + (vo ? ' on' : '')} title="View Options" data-view-options onClick={() => setVo((v) => !v)}>
            <EyeIcon />
          </button>
          {!showList && (
            <button className="c-nav-btn" title="Inspector" disabled={!canInspect} onClick={openInspector}>
              <InfoIcon />
            </button>
          )}
        </div>
      </div>
      {search && (
        <div className="c-search">
          <SearchIcon />
          <input
            autoFocus
            data-search
            placeholder="Search"
            value={ui.search}
            onChange={(e) => store.setUi({ search: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                store.setUi({ search: '' });
                setSearch(false);
              }
            }}
          />
          <button
            onClick={() => {
              store.setUi({ search: '' });
              setSearch(false);
            }}
          >
            Cancel
          </button>
        </div>
      )}
      <div className="c-body">
        {showList ? (
          <div ref={listRef} className="c-list" onClick={onListClick}>
            <Sidebar />
          </div>
        ) : (
          <Content />
        )}
      </div>
      {!showList && (
        <div className="c-bottombar">
          <span className="c-bb-spacer" />
          <button className="c-bb-btn accent" title="New Inbox Item" onClick={onQuickEntry}>
            <InboxPlusIcon />
          </button>
        </div>
      )}
      {vo && <ViewOptionsPopover anchor={voRef.current} onClose={() => setVo(false)} />}
      {ui.inspectorVisible && ui.selection.length > 0 && (
        <div className="c-sheet-bg" onMouseDown={(e) => e.target === e.currentTarget && store.setUi({ inspectorVisible: false })}>
          <div className="c-sheet">
            <div className="c-sheet-bar">
              <span />
              <span className="c-sheet-title">Inspector</span>
              <button className="c-done" onClick={() => store.setUi({ inspectorVisible: false })}>
                Done
              </button>
            </div>
            <Inspector />
          </div>
        </div>
      )}
    </div>
  );
}

export function CompactShell({ onQuickEntry, onSettings }: { onQuickEntry: () => void; onSettings: () => void }) {
  const ui = useUi();
  return (
    <div className="c-root">
      {ui.compactScreen === 'home' ? <Home onQuickEntry={onQuickEntry} onSettings={onSettings} /> : <Screen onQuickEntry={onQuickEntry} />}
    </div>
  );
}
