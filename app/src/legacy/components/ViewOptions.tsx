import React from 'react';
import { store, useDB } from '../model/store';
import { Availability, ViewOptions } from '../model/types';
import { Popover } from './Popover';

const AVAIL: { id: Availability; label: string; hint: string }[] = [
  { id: 'firstAvailable', label: 'First available', hint: 'Only first available item per project' },
  { id: 'available', label: 'Available', hint: 'Items not blocked, deferred, or on hold' },
  { id: 'remaining', label: 'Remaining', hint: 'Items not completed or dropped' },
  { id: 'everything', label: 'Everything', hint: 'All items, including completed and dropped' },
];

export function ViewOptionsPopover({ anchor, onClose }: { anchor: HTMLElement | null; onClose: () => void }) {
  const db = useDB();
  const p = db.ui.perspective;
  const vo = db.viewOptions[p];
  const set = (patch: Partial<ViewOptions>) => store.setViewOptions(p, patch);
  const names: Record<string, string> = { inbox: 'Inbox', projects: 'Projects', tags: 'Tags', forecast: 'Forecast', flagged: 'Flagged', nearby: 'Nearby', review: 'Review' };

  const Radio = ({ a }: { a: (typeof AVAIL)[number] }) => (
    <label className="opt">
      <input type="radio" name="avail" checked={vo.availability === a.id} onChange={() => set({ availability: a.id })} />
      <span>
        {a.label}
        <span className="hint">{a.hint}</span>
      </span>
    </label>
  );
  const Check = ({ k, label, hint }: { k: keyof ViewOptions; label: string; hint?: string }) => (
    <label className="opt">
      <input type="checkbox" checked={!!vo[k]} onChange={(e) => set({ [k]: e.target.checked } as Partial<ViewOptions>)} />
      <span>
        {label}
        {hint && <span className="hint">{hint}</span>}
      </span>
    </label>
  );

  return (
    <Popover anchor={anchor} onClose={onClose} width={336}>
      {p === 'forecast' ? (
        <>
          <h4>In Forecast, include:</h4>
          <Check k="forecastIncludePlanned" label="Items on planned date" />
          <Check k="forecastIncludeDeferred" label="Items on defer date" />
          <Check k="forecastIncludeNotification" label="Items on notification date" />
          <Check k="forecastCalendarEvents" label="Calendar events" />
          <button className="opt-btn" disabled>
            Choose Calendars
          </button>
          <h4>Today includes:</h4>
          <Check k="forecastTodayFlagged" label="Flagged items" />
          <div className="opt-select">
            <span>Items tagged:</span>
            <select value={vo.forecastTagId ?? ''} onChange={(e) => set({ forecastTagId: e.target.value || null })}>
              <option value="">None</option>
              {Object.values(db.tags)
                .sort((a, b) => a.rank - b.rank)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </div>
          <h4>Structure:</h4>
          <div className="opt-seg">
            <button className={vo.forecastStructure === 'flexible' ? 'on' : ''} onClick={() => set({ forecastStructure: 'flexible' })}>
              Flexible
            </button>
            <button className={vo.forecastStructure === 'organized' ? 'on' : ''} onClick={() => set({ forecastStructure: 'organized' })}>
              Organized
            </button>
          </div>
          <Check k="forecastPreserveHierarchy" label="Preserve hierarchy" />
          <Check k="forecastKeepSorted" label="Keep sorted" />
        </>
      ) : p === 'nearby' ? (
        <>
          <h4>In Nearby, show:</h4>
          {AVAIL.map((a) => (
            <Radio key={a.id} a={a} />
          ))}
        </>
      ) : (
        <>
          <h4>In {names[p]}, show:</h4>
          {AVAIL.map((a) => (
            <Radio key={a.id} a={a} />
          ))}
          {p === 'projects' && (
            <>
              <h4>Structure:</h4>
              <Check k="showInbox" label="Show Inbox" />
              <Check k="showFoldersInOutline" label="Show folders in outline" />
            </>
          )}
          {p === 'tags' && (
            <>
              <h4>Structure:</h4>
              <Check k="sortByDueAndFlagged" label="Sort by due date & flagged" />
            </>
          )}
          {p === 'review' && (
            <>
              <h4>Structure:</h4>
              <Check k="reviewHideBlocked" label="Hide blocked projects" hint="Excludes on hold and deferred" />
              <Check k="reviewSortByNextReview" label="Sort by next review" />
              <Check k="showFoldersInOutline" label="Show folders in outline" />
            </>
          )}
          {p === 'flagged' && (
            <>
              <h4>Group actions by:</h4>
              <div className="opt-select">
                <select value={vo.flaggedGroupBy} onChange={(e) => set({ flaggedGroupBy: e.target.value as ViewOptions['flaggedGroupBy'] })}>
                  <option value="ungrouped">Ungrouped</option>
                  <option value="project">Project</option>
                  <option value="tag">Tag</option>
                  <option value="due">Due</option>
                  <option value="defer">Defer</option>
                </select>
              </div>
            </>
          )}
        </>
      )}
      <h4>Mac layout:</h4>
      <Check k="keepSidebarHidden" label="Keep sidebar hidden" />
      <div style={{ padding: '4px 0 2px 20px' }}>Choose your row layout:</div>
      {(['default', 'customFluid', 'customColumns'] as const).map((l) => (
        <label key={l} className="opt">
          <input type="radio" name="layout" checked={vo.rowLayout === l} onChange={() => set({ rowLayout: l })} />
          <span>{l === 'default' ? 'Default' : l === 'customFluid' ? 'Custom Fluid' : 'Custom Columns'}</span>
        </label>
      ))}
      <button className="opt-btn" disabled>
        Edit Default Layout
      </button>
    </Popover>
  );
}
