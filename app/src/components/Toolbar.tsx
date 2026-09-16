import React, { useEffect, useRef, useState } from 'react';
import { store, useSnapshot, useUi } from '../core/store';
import { isTauri } from '../core/backend';
import { ChevronLeft, ChevronRight, EyeIcon, FocusIcon, InboxPlusIcon, InfoIcon, PlusIcon, SearchIcon, SidebarIcon } from './Icons';
import { ViewOptionsPopover } from './ViewOptions';
import { newItemInContext } from './Outline';
import { Commands } from './Commands';
import '../styles/chrome.css';

export function Toolbar({ onQuickEntry }: { onQuickEntry: () => void }) {
  const snap = useSnapshot();
  const ui = useUi();
  const [vo, setVo] = useState(false);
  const voRef = useRef<HTMLButtonElement>(null);
  const [inset, setInset] = useState(false);

  useEffect(() => {
    const cls = document.body.classList;
    setInset(cls.contains('tauri') && cls.contains('mac'));
  }, []);

  if (!snap) return <div className="toolbar" />;

  const canBack = ui.historyIndex > 0;
  const canFwd = ui.historyIndex < ui.history.length - 1;
  const focused = snap.focusIds.length > 0;
  const focusCandidates = snap.perspective === 'projects'
    ? (snap.sidebar.selection.length ? snap.sidebar.selection : ui.selection).filter((id) => snap.projects[id] || snap.folders[id])
    : ui.selection.filter((id) => snap.projects[id] || snap.folders[id]);
  const canFocus = focusCandidates.length > 0;
  const tauri = isTauri();

  const drag = tauri ? { 'data-tauri-drag-region': true } : {};

  return (
    <div
      className={'toolbar' + (inset ? ' traffic-inset' : '')}
      {...drag}
      onDoubleClick={(e) => {
        if (!tauri || e.target !== e.currentTarget) return;
        void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().toggleMaximize());
      }}
    >
      <div className="tb-group" {...drag}>
        <button className="tb-btn" title="Hide/Show Sidebar (⌥⌘S)" onClick={() => store.setUi({ sidebarVisible: !ui.sidebarVisible })}>
          <SidebarIcon />
        </button>
        <div className="tb-segment">
          <button className="tb-btn" disabled={!canBack} title="Back (⌘[)" onClick={() => store.goBack()}>
            <ChevronLeft />
          </button>
          <button className="tb-btn" disabled={!canFwd} title="Forward (⌘])" onClick={() => store.goForward()}>
            <ChevronRight />
          </button>
        </div>
        <button ref={voRef} className={'tb-btn' + (vo ? ' on' : '')} title="View Options (⇧⌘V)" onClick={() => setVo((v) => !v)} data-view-options>
          <EyeIcon />
        </button>
      </div>
      <div className="tb-center" {...drag}>
        <div className="tb-segment">
          <button className="tb-btn" title="New Action (⌘N)" onClick={() => newItemInContext()}>
            <PlusIcon />
          </button>
          <button className="tb-btn" title="Quick Entry (⌃⌥Space)" onClick={onQuickEntry}>
            <InboxPlusIcon />
          </button>
          <button
            className={'tb-btn' + (focused ? ' on' : '')}
            disabled={!focused && !canFocus}
            title={focused ? `Unfocus (⇧⌘U)${snap.focusLabel ? ' — ' + snap.focusLabel : ''}` : 'Focus (⇧⌘F)'}
            aria-label={focused ? 'Unfocus' : 'Focus'}
            onClick={() => {
              if (focused) void store.api.setFocus([]);
              else {
                void store.api.setFocus(focusCandidates);
                void store.api.setSidebarSelection([]);
              }
            }}
          >
            <FocusIcon />
          </button>
        </div>
      </div>
      <div className="tb-group" {...drag}>
        <label className="tb-search">
          <SearchIcon />
          <input
            data-search
            placeholder="Search Here"
            value={ui.search}
            spellCheck={false}
            onChange={(e) => store.setUi({ search: e.target.value })}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape') {
                store.setUi({ search: '' });
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
        </label>
        <button className={'tb-btn' + (ui.inspectorVisible ? ' on' : '')} title="Show/Hide Inspector (⌥⌘I)" onClick={() => store.setUi({ inspectorVisible: !ui.inspectorVisible })}>
          <InfoIcon />
        </button>
      </div>
      {vo && <ViewOptionsPopover anchor={voRef.current} onClose={() => setVo(false)} />}
      <Commands />
    </div>
  );
}
