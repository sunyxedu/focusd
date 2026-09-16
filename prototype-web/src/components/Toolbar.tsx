import React, { useRef, useState } from 'react';
import { store, useDB } from '../model/store';
import { ChevronLeft, ChevronRight, EyeIcon, FocusIcon, InboxPlusIcon, InfoIcon, PlusIcon, SearchIcon, SidebarIcon } from './Icons';
import { ViewOptionsPopover } from './ViewOptions';
import { goToPerspective } from './PerspectivesBar';
import { newItemInContext } from './Outline';

export function Toolbar({ onQuickEntry }: { onQuickEntry: () => void }) {
  const db = useDB();
  const [vo, setVo] = useState(false);
  const voRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const canBack = db.ui.historyIndex > 0;
  const canFwd = db.ui.historyIndex < db.ui.history.length - 1;
  const focused = db.ui.focusIds.length > 0;
  const canFocus = db.ui.perspective === 'projects' && ((db.ui.sidebarSelection.projects?.length ?? 0) > 0 || db.ui.selection.some((id) => db.projects[id]));

  return (
    <div className="toolbar">
      <div className="tb-group">
        <button className={'tb-btn'} title="Hide/Show Sidebar (⌥⌘S)" onClick={() => store.ui({ sidebarVisible: !db.ui.sidebarVisible })}>
          <SidebarIcon />
        </button>
        <div className="tb-segment">
          <button
            className="tb-btn"
            disabled={!canBack}
            title="Back (⌘[)"
            onClick={() => {
              const i = db.ui.historyIndex - 1;
              goToPerspective(db.ui.history[i], false);
              store.ui({ historyIndex: i });
            }}
          >
            <ChevronLeft />
          </button>
          <button
            className="tb-btn"
            disabled={!canFwd}
            title="Forward (⌘])"
            onClick={() => {
              const i = db.ui.historyIndex + 1;
              goToPerspective(db.ui.history[i], false);
              store.ui({ historyIndex: i });
            }}
          >
            <ChevronRight />
          </button>
        </div>
        <button ref={voRef} className={'tb-btn' + (vo ? ' on' : '')} title="View Options (⇧⌘V)" onClick={() => setVo((v) => !v)} data-view-options>
          <EyeIcon />
        </button>
      </div>
      <div className="tb-center">
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
            title={focused ? 'Unfocus (⇧⌘U)' : 'Focus (⇧⌘F)'}
            onClick={() => {
              if (focused) store.ui({ focusIds: [] });
              else {
                const ids = (db.ui.sidebarSelection.projects?.length ? db.ui.sidebarSelection.projects : db.ui.selection.filter((id) => db.projects[id])) ?? [];
                store.ui({ focusIds: ids, sidebarSelection: { ...db.ui.sidebarSelection, projects: [] } });
              }
            }}
          >
            <FocusIcon />
          </button>
        </div>
      </div>
      <div className="tb-group">
        <label className="tb-search">
          <SearchIcon />
          <input
            ref={searchRef}
            data-search
            placeholder={db.ui.searchScope === 'here' ? 'Search Here' : db.ui.searchScope === 'remaining' ? 'Search Remaining' : 'Search Everything'}
            value={db.ui.search}
            onChange={(e) => store.ui({ search: e.target.value })}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape') {
                store.ui({ search: '' });
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
        </label>
        <button className={'tb-btn' + (db.ui.inspectorVisible ? ' on' : '')} title="Show/Hide Inspector (⌥⌘I)" onClick={() => store.ui({ inspectorVisible: !db.ui.inspectorVisible })}>
          <InfoIcon />
        </button>
      </div>
      {vo && <ViewOptionsPopover anchor={voRef.current} onClose={() => setVo(false)} />}
    </div>
  );
}
