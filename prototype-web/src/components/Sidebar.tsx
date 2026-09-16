import React, { useRef, useState } from 'react';
import { store, useDB, useDerived } from '../model/store';
import { Folder, ID, Project, Tag } from '../model/types';
import { forecastBuckets, reviewProjects } from '../model/rows';
import { addDays, dayKey, startOfDay } from '../model/dates';
import { ChevronRight, FolderIcon, GearIcon, PauseIcon, PlusIcon, ProjectSmallIcon, TagOutlineIcon, SequentialIcon, SingleActionsIcon, CheckCircleIcon, MinusCircleIcon, UndoIcon } from './Icons';
import { Menu, MenuItem } from './Popover';
import { DRAG_TYPE } from './Outline';

function useSidebarSelection() {
  const db = useDB();
  const p = db.ui.perspective;
  const sel = db.ui.sidebarSelection[p] ?? [];
  const setSel = (ids: ID[]) => store.ui({ sidebarSelection: { ...db.ui.sidebarSelection, [p]: ids }, selection: [], pinnedIds: [] });
  const click = (id: ID, e: React.MouseEvent) => {
    if (e.metaKey) setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
    else if (sel.length === 1 && sel[0] === id && !e.shiftKey) setSel([]);
    else setSel([id]);
  };
  return { sel, setSel, click };
}

function EditableLabel({ value, editing, onCommit, placeholder, dim }: { value: string; editing: boolean; onCommit: (v: string | null) => void; placeholder: string; dim?: boolean }) {
  const [text, setText] = useState(value);
  if (!editing) return <span className="label" style={dim ? { color: '#9a9aa0' } : undefined}>{value || <span style={{ color: '#b0b0b5' }}>{placeholder}</span>}</span>;
  return (
    <span className="label">
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onCommit(text)}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') onCommit(text);
          if (e.key === 'Escape') onCommit(null);
        }}
      />
    </span>
  );
}

/* ---------------- Projects sidebar ---------------- */
function ProjectsSidebar() {
  const db = useDB();
  const d = useDerived();
  const { sel, click, setSel } = useSidebarSelection();
  const [editing, setEditing] = useState<ID | null>(null);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; id: ID } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: ID; pos: 'into' | 'before' | 'after' } | null>(null);
  const vo = db.viewOptions.projects;
  const focus = db.ui.focusIds;

  const projectIcon = (p: Project) => {
    const info = d.projectInfo[p.id];
    const color = info.effectiveStatus === 'active' ? 'var(--c-projects)' : '#9a9aa0';
    const style = { color };
    if (p.status === 'done') return <CheckCircleIcon style={style} />;
    if (p.status === 'dropped') return <MinusCircleIcon style={style} />;
    if (p.type === 'sequential') return <SequentialIcon style={style} />;
    if (p.type === 'singleActions') return <SingleActionsIcon style={style} />;
    return <ProjectSmallIcon style={style} />;
  };

  const onDragOver = (e: React.DragEvent, id: ID, kind: 'project' | 'folder') => {
    if (!e.dataTransfer.types.includes(DRAG_TYPE) && !e.dataTransfer.types.includes('text/hf-sidebar')) return;
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - r.top;
    const isSidebarDrag = e.dataTransfer.types.includes('text/hf-sidebar');
    let pos: 'into' | 'before' | 'after' = 'into';
    if (isSidebarDrag) pos = y < r.height / 3 ? 'before' : y > (2 * r.height) / 3 ? 'after' : kind === 'folder' ? 'into' : 'after';
    setDropTarget({ id, pos });
    e.dataTransfer.dropEffect = 'move';
  };
  const onDrop = (e: React.DragEvent, id: ID, kind: 'project' | 'folder') => {
    e.preventDefault();
    const target = dropTarget;
    setDropTarget(null);
    const taskIds = e.dataTransfer.getData(DRAG_TYPE);
    if (taskIds) {
      if (kind === 'project') store.moveTasks(taskIds.split(','), id);
      return;
    }
    const sb = e.dataTransfer.getData('text/hf-sidebar');
    if (!sb || !target) return;
    const [k, movedId] = sb.split(':');
    if (movedId === id) return;
    if (k === 'project') {
      if (kind === 'folder' && target.pos === 'into') store.moveProject(movedId, id);
      else if (kind === 'project') {
        const tp = db.projects[id];
        if (target.pos === 'before') {
          const sibs = (d.projectsInFolder[tp.folderId ?? 'root'] ?? []).filter((x) => x.id !== movedId);
          const i = sibs.findIndex((x) => x.id === id);
          store.moveProject(movedId, tp.folderId, i > 0 ? sibs[i - 1].id : null);
          if (i === 0) store.mutate((db2) => (db2.projects[movedId] = { ...db2.projects[movedId], rank: tp.rank - 1 }));
        } else store.moveProject(movedId, tp.folderId, id);
      } else if (kind === 'folder') {
        const tf = db.folders[id];
        store.moveProject(movedId, tf.parentId);
      }
    } else if (k === 'folder' && kind === 'folder' && target.pos === 'into') {
      store.updateFolder(movedId, { parentId: id });
    } else if (k === 'folder' && kind === 'folder') {
      store.updateFolder(movedId, { parentId: db.folders[id].parentId, rank: db.folders[id].rank + (target.pos === 'after' ? 0.5 : -0.5) });
    }
  };

  const rows: JSX.Element[] = [];
  const renderFolder = (f: Folder, depth: number) => {
    const open = db.ui.expanded[f.id] !== false;
    const hasKids = (d.foldersIn[f.id]?.length ?? 0) + (d.projectsInFolder[f.id]?.length ?? 0) > 0;
    rows.push(
      <div
        key={f.id}
        className={'sb-row' + (sel.includes(f.id) ? ' on' : '') + (dropTarget?.id === f.id ? ' drop-target' : '') + (f.status === 'dropped' ? ' dim' : '')}
        style={{ paddingLeft: 4 + depth * 19 }}
        draggable
        onDragStart={(e) => e.dataTransfer.setData('text/hf-sidebar', 'folder:' + f.id)}
        onDragOver={(e) => onDragOver(e, f.id, 'folder')}
        onDragLeave={() => setDropTarget(null)}
        onDrop={(e) => onDrop(e, f.id, 'folder')}
        onClick={(e) => click(f.id, e)}
        onDoubleClick={() => setEditing(f.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ anchor: e.currentTarget, id: f.id });
        }}
      >
        <button className={'disclosure' + (hasKids ? ' has' : '') + (open ? ' open' : '')} onClick={(e) => {
          e.stopPropagation();
          store.ui({ expanded: { ...db.ui.expanded, [f.id]: !open } });
        }}>
          <ChevronRight />
        </button>
        <span className="icon">
          <FolderIcon style={{ color: '#7a7a80' }} />
        </span>
        <EditableLabel value={f.name} editing={editing === f.id} placeholder="Untitled Folder" onCommit={(v) => {
          setEditing(null);
          if (v !== null) store.updateFolder(f.id, { name: v });
        }} />
      </div>,
    );
    if (open) {
      for (const k of d.foldersIn[f.id] ?? []) renderFolder(k, depth + 1);
      for (const p of d.projectsInFolder[f.id] ?? []) renderProject(p, depth + 1);
    }
  };
  const renderProject = (p: Project, depth: number) => {
    const info = d.projectInfo[p.id];
    if (!info.remaining && vo.availability !== 'everything') return;
    const dim = info.effectiveStatus !== 'active';
    rows.push(
      <div
        key={p.id}
        className={'sb-row' + (sel.includes(p.id) ? ' on' : '') + (dropTarget?.id === p.id && dropTarget.pos === 'into' ? ' drop-target' : '') + (dim ? ' dim' : '')}
        style={{ paddingLeft: 4 + depth * 19, boxShadow: dropTarget?.id === p.id && dropTarget.pos !== 'into' ? (dropTarget.pos === 'before' ? 'inset 0 2px 0 var(--c-accent)' : 'inset 0 -2px 0 var(--c-accent)') : undefined }}
        draggable
        onDragStart={(e) => e.dataTransfer.setData('text/hf-sidebar', 'project:' + p.id)}
        onDragOver={(e) => onDragOver(e, p.id, 'project')}
        onDragLeave={() => setDropTarget(null)}
        onDrop={(e) => onDrop(e, p.id, 'project')}
        onClick={(e) => click(p.id, e)}
        onDoubleClick={() => setEditing(p.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ anchor: e.currentTarget, id: p.id });
        }}
      >
        <span className="disclosure" />
        <span className="icon">{projectIcon(p)}</span>
        <EditableLabel value={p.name} editing={editing === p.id} placeholder="Untitled Project" onCommit={(v) => {
          setEditing(null);
          if (v !== null) store.updateProject(p.id, { name: v });
        }} />
        {info.effectiveStatus === 'onHold' && (
          <span className="aux">
            <PauseIcon />
          </span>
        )}
        {info.dueState !== 'none' && <span className="aux" style={{ color: info.dueState === 'overdue' ? 'var(--c-overdue)' : 'var(--c-duesoon)' }}>●</span>}
      </div>,
    );
  };
  if (focus.length) {
    for (const id of focus) {
      if (db.folders[id]) renderFolder(db.folders[id], 0);
      else if (db.projects[id]) renderProject(db.projects[id], 0);
    }
  } else {
    for (const f of d.foldersIn['root'] ?? []) renderFolder(f, 0);
    for (const p of d.projectsInFolder['root'] ?? []) renderProject(p, 0);
  }

  const menuItems = (): MenuItem[] => {
    if (!menu) return [];
    const p = db.projects[menu.id];
    const f = db.folders[menu.id];
    if (p)
      return [
        { label: 'Rename', onSelect: () => setEditing(p.id) },
        { label: 'Focus', onSelect: () => store.ui({ focusIds: [p.id] }) },
        { separator: true, label: '' },
        { label: 'Active', checked: p.status === 'active', onSelect: () => store.updateProject(p.id, { status: 'active' }) },
        { label: 'On Hold', checked: p.status === 'onHold', onSelect: () => store.updateProject(p.id, { status: 'onHold' }) },
        { label: 'Completed', checked: p.status === 'done', onSelect: () => store.updateProject(p.id, { status: 'done' }) },
        { label: 'Dropped', checked: p.status === 'dropped', onSelect: () => store.updateProject(p.id, { status: 'dropped' }) },
        { separator: true, label: '' },
        { label: 'Parallel', checked: p.type === 'parallel', onSelect: () => store.updateProject(p.id, { type: 'parallel' }) },
        { label: 'Sequential', checked: p.type === 'sequential', onSelect: () => store.updateProject(p.id, { type: 'sequential' }) },
        { label: 'Single Actions', checked: p.type === 'singleActions', onSelect: () => store.updateProject(p.id, { type: 'singleActions' }) },
        { separator: true, label: '' },
        { label: 'Mark Reviewed', onSelect: () => store.markReviewed([p.id]) },
        { label: 'Delete Project', onSelect: () => store.deleteItems([p.id]) },
      ];
    if (f)
      return [
        { label: 'Rename', onSelect: () => setEditing(f.id) },
        { label: 'Focus', onSelect: () => store.ui({ focusIds: [f.id] }) },
        { label: 'New Project in Folder', onSelect: () => { const id = store.addProject({ name: '', folderId: f.id }); setSel([id]); setEditing(id); } },
        { label: 'New Folder in Folder', onSelect: () => { const id = store.addFolder({ name: '', parentId: f.id }); setEditing(id); } },
        { separator: true, label: '' },
        { label: f.status === 'dropped' ? 'Mark Active' : 'Drop Folder', onSelect: () => store.updateFolder(f.id, { status: f.status === 'dropped' ? 'active' : 'dropped' }) },
        { label: 'Delete Folder', onSelect: () => store.deleteItems([f.id]) },
      ];
    return [];
  };

  const [addMenu, setAddMenu] = useState<HTMLElement | null>(null);
  const [gearMenu, setGearMenu] = useState<HTMLElement | null>(null);
  return (
    <>
      <div className="sidebar-scroll" onClick={(e) => { if (e.target === e.currentTarget) setSel([]); }}>
        {rows}
      </div>
      <div className="sidebar-footer">
        <button title="Add Project or Folder" onClick={(e) => setAddMenu(e.currentTarget)}>
          <PlusIcon />
        </button>
        <button title="Actions" onClick={(e) => setGearMenu(e.currentTarget)}>
          <GearIcon />
        </button>
      </div>
      {menu && <Menu anchor={menu.anchor} onClose={() => setMenu(null)} items={menuItems()} />}
      {addMenu && (
        <Menu
          anchor={addMenu}
          onClose={() => setAddMenu(null)}
          items={[
            { label: 'New Project', sub: '⇧⌘N', onSelect: () => { const folder = sel.find((id) => db.folders[id]) ?? (sel[0] && db.projects[sel[0]]?.folderId) ?? null; const id = store.addProject({ name: '', folderId: folder }); setSel([id]); setEditing(id); } },
            { label: 'New Folder', onSelect: () => { const parent = sel.find((id) => db.folders[id]) ?? null; const id = store.addFolder({ name: '', parentId: parent }); setEditing(id); } },
          ]}
        />
      )}
      {gearMenu && (
        <Menu
          anchor={gearMenu}
          onClose={() => setGearMenu(null)}
          items={[
            { label: 'Expand All', onSelect: () => store.ui({ expanded: Object.fromEntries(Object.keys(db.folders).map((k) => [k, true])) }) },
            { label: 'Collapse All', onSelect: () => store.ui({ expanded: Object.fromEntries(Object.keys(db.folders).map((k) => [k, false])) }) },
            { separator: true, label: '' },
            { label: 'Unfocus', disabled: !focus.length, onSelect: () => store.ui({ focusIds: [] }) },
          ]}
        />
      )}
    </>
  );
}

/* ---------------- Tags sidebar ---------------- */
function TagsSidebar() {
  const db = useDB();
  const d = useDerived();
  const { sel, click, setSel } = useSidebarSelection();
  const [editing, setEditing] = useState<ID | null>(null);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; id: ID } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: ID; pos: 'into' | 'before' | 'after' } | null>(null);

  const rows: JSX.Element[] = [];
  const render = (t: Tag, depth: number) => {
    const open = db.ui.expanded[t.id] !== false;
    const kids = d.tagChildren[t.id] ?? [];
    const dim = t.status !== 'active';
    rows.push(
      <div
        key={t.id}
        className={'sb-row' + (sel.includes(t.id) ? ' on' : '') + (dropTarget?.id === t.id && dropTarget.pos === 'into' ? ' drop-target' : '') + (dim ? ' dim' : '')}
        style={{ paddingLeft: 6 + depth * 16, boxShadow: dropTarget?.id === t.id && dropTarget.pos !== 'into' ? (dropTarget.pos === 'before' ? 'inset 0 2px 0 var(--c-accent)' : 'inset 0 -2px 0 var(--c-accent)') : undefined }}
        draggable
        onDragStart={(e) => e.dataTransfer.setData('text/hf-sidebar', 'tag:' + t.id)}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(DRAG_TYPE) && !e.dataTransfer.types.includes('text/hf-sidebar')) return;
          e.preventDefault();
          const r = e.currentTarget.getBoundingClientRect();
          const y = e.clientY - r.top;
          const sbDrag = e.dataTransfer.types.includes('text/hf-sidebar');
          setDropTarget({ id: t.id, pos: sbDrag ? (y < r.height / 3 ? 'before' : y > (2 * r.height) / 3 ? 'after' : 'into') : 'into' });
        }}
        onDragLeave={() => setDropTarget(null)}
        onDrop={(e) => {
          e.preventDefault();
          const target = dropTarget;
          setDropTarget(null);
          const ids = e.dataTransfer.getData(DRAG_TYPE);
          if (ids) {
            store.addTagToItems(ids.split(','), t.id);
            return;
          }
          const sb = e.dataTransfer.getData('text/hf-sidebar');
          if (!sb || !target) return;
          const [k, moved] = sb.split(':');
          if (k !== 'tag' || moved === t.id) return;
          if (target.pos === 'into') store.moveTag(moved, t.id);
          else {
            const sibs = (d.tagChildren[t.parentId ?? 'root'] ?? []).filter((x) => x.id !== moved);
            const i = sibs.findIndex((x) => x.id === t.id);
            if (target.pos === 'after') store.moveTag(moved, t.parentId, t.id);
            else if (i > 0) store.moveTag(moved, t.parentId, sibs[i - 1].id);
            else {
              store.moveTag(moved, t.parentId, null);
              store.mutate((db2) => (db2.tags[moved] = { ...db2.tags[moved], rank: t.rank - 1 }));
            }
          }
        }}
        onClick={(e) => click(t.id, e)}
        onDoubleClick={() => setEditing(t.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ anchor: e.currentTarget, id: t.id });
        }}
      >
        <button className={'disclosure' + (kids.length ? ' has' : '') + (open ? ' open' : '')} onClick={(e) => {
          e.stopPropagation();
          store.ui({ expanded: { ...db.ui.expanded, [t.id]: !open } });
        }}>
          <ChevronRight />
        </button>
        <span className="icon">
          <TagOutlineIcon style={{ color: dim ? '#9a9aa0' : 'var(--c-tags)' }} />
        </span>
        <EditableLabel value={t.name} editing={editing === t.id} placeholder="Untitled Tag" onCommit={(v) => {
          setEditing(null);
          if (v !== null) store.updateTag(t.id, { name: v });
        }} />
        {t.status === 'onHold' && (
          <span className="aux">
            <PauseIcon />
          </span>
        )}
        {t.status === 'dropped' && (
          <span className="aux">
            <MinusCircleIcon />
          </span>
        )}
      </div>,
    );
    if (open) for (const k of kids) render(k, depth + 1);
  };
  for (const t of d.tagChildren['root'] ?? []) render(t, 0);
  rows.push(
    <div
      key="__untagged"
      className={'sb-row' + (sel.includes('__untagged') ? ' on' : '')}
      style={{ paddingLeft: 6 }}
      onClick={(e) => click('__untagged', e)}
    >
      <span className="disclosure" />
      <span className="icon">
        <TagOutlineIcon style={{ color: 'var(--c-tags)' }} />
      </span>
      <span className="label">Untagged</span>
    </div>,
  );

  const menuItems = (): MenuItem[] => {
    if (!menu) return [];
    const t = db.tags[menu.id];
    if (!t) return [];
    return [
      { label: 'Rename', onSelect: () => setEditing(t.id) },
      { label: 'New Child Tag', onSelect: () => { const id = store.addTag({ name: '', parentId: t.id }); store.ui({ expanded: { ...db.ui.expanded, [t.id]: true } }); setEditing(id); } },
      { separator: true, label: '' },
      { label: 'Active', checked: t.status === 'active', onSelect: () => store.updateTag(t.id, { status: 'active' }) },
      { label: 'On Hold', checked: t.status === 'onHold', onSelect: () => store.updateTag(t.id, { status: 'onHold' }) },
      { label: 'Dropped', checked: t.status === 'dropped', onSelect: () => store.updateTag(t.id, { status: 'dropped' }) },
      { separator: true, label: '' },
      { label: 'Allows next action', checked: t.allowsNextAction, onSelect: () => store.updateTag(t.id, { allowsNextAction: !t.allowsNextAction }) },
      { separator: true, label: '' },
      { label: 'Delete Tag', onSelect: () => store.deleteItems([t.id]) },
    ];
  };
  const [gearMenu, setGearMenu] = useState<HTMLElement | null>(null);
  return (
    <>
      <div className="sidebar-scroll" onClick={(e) => { if (e.target === e.currentTarget) setSel([]); }}>
        {rows}
      </div>
      <div className="sidebar-footer">
        <button title="New Tag" onClick={() => { const parent = sel.find((id) => db.tags[id]) ?? null; const id = store.addTag({ name: '', parentId: parent }); if (parent) store.ui({ expanded: { ...db.ui.expanded, [parent]: true } }); setEditing(id); }}>
          <PlusIcon />
        </button>
        <button title="Actions" onClick={(e) => setGearMenu(e.currentTarget)}>
          <GearIcon />
        </button>
      </div>
      {menu && <Menu anchor={menu.anchor} onClose={() => setMenu(null)} items={menuItems()} />}
      {gearMenu && (
        <Menu
          anchor={gearMenu}
          onClose={() => setGearMenu(null)}
          items={[
            { label: 'Expand All', onSelect: () => store.ui({ expanded: { ...db.ui.expanded, ...Object.fromEntries(Object.keys(db.tags).map((k) => [k, true])) } }) },
            { label: 'Collapse All', onSelect: () => store.ui({ expanded: { ...db.ui.expanded, ...Object.fromEntries(Object.keys(db.tags).map((k) => [k, false])) } }) },
          ]}
        />
      )}
    </>
  );
}

/* ---------------- Forecast sidebar (calendar) ---------------- */
function ForecastSidebar() {
  const db = useDB();
  const d = useDerived();
  const { days, items } = forecastBuckets(db, d, db.viewOptions.forecast);
  const selected = db.ui.forecastSelectedDay;
  const select = (k: string | null) => store.ui({ forecastSelectedDay: selected === k ? null : k, selection: [] });
  const today = startOfDay(d.now);
  const weekStart = db.settings.weekStartsOn;
  // 5-week grid starting from the week containing today
  const dow = (new Date(today).getDay() - weekStart + 7) % 7;
  const gridStart = addDays(today, -dow);
  const cells: number[] = [];
  for (let i = 0; i < 35; i++) cells.push(addDays(gridStart, i));
  const past = days[0];
  const future = days[days.length - 1];
  const countFor = (t: number) => {
    const k = dayKey(t);
    if (t < today) return 0;
    const day = days.find((x) => x.key === k);
    if (day) return day.count;
    // beyond 14 days: count due exactly that day from the future bucket
    return items['future'].filter((x) => {
      const dt = 'task' in x ? x.effectiveDueDate ?? x.effectivePlannedDate : x.project.dueDate ?? x.project.plannedDate;
      return dt !== null && dayKey(dt) === k;
    }).length;
  };
  const wdNames = weekStart === 1 ? ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] : ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return (
    <>
      <div className="sidebar-scroll">
        <div className={'fc-block' + (selected === 'past' ? ' on' : '')} onClick={() => select('past')}>
          <div className="t">Past</div>
          <div className="n" style={past.count ? { color: 'var(--c-overdue)' } : undefined}>{past.count}</div>
        </div>
        <div className="fc-cal">
          <div className="fc-wd">
            {wdNames.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          <div className="fc-grid">
            {cells.map((t) => {
              const dt = new Date(t);
              const k = dayKey(t);
              const isToday = t === today;
              const n = countFor(t);
              const label = dt.getDate() === 1 ? months[dt.getMonth()] : isToday ? 'Today' : String(dt.getDate());
              const dayInfo = days.find((x) => x.key === k);
              return (
                <div key={k} className={'fc-day' + (isToday ? ' today' : '') + (selected === k ? ' on' : '') + (t < today ? ' pad' : '')} onClick={() => t >= today && select(k)}>
                  {t >= today && label}
                  {n > 0 && <span className={'cnt' + (dayInfo && dayInfo.isToday && past.count ? ' overdue' : '')}>{n}</span>}
                </div>
              );
            })}
          </div>
        </div>
        <div className={'fc-block' + (selected === 'future' ? ' on' : '')} onClick={() => select('future')}>
          <div className="t">Future</div>
          <div className="n">{future.count}</div>
        </div>
      </div>
      <div className="sidebar-footer">
        <button title="New Action" onClick={() => {
          const due = selected && selected !== 'past' && selected !== 'future' ? new Date(selected).setHours(db.settings.defaultDueHour, 0, 0, 0) : new Date(today).setHours(db.settings.defaultDueHour, 0, 0, 0);
          const id = store.addTask({ name: '', dueDate: due });
          store.ui({ selection: [id] });
        }}>
          <PlusIcon />
        </button>
        <button title="Actions" onClick={() => store.ui({ forecastSelectedDay: null })}>
          <GearIcon />
        </button>
      </div>
    </>
  );
}

/* ---------------- Review sidebar ---------------- */
function ReviewSidebar() {
  const db = useDB();
  const d = useDerived();
  const { sel, click, setSel } = useSidebarSelection();
  const list = reviewProjects(db, d, db.viewOptions.review);
  const effective = sel.length ? sel : list.length ? [list[0].project.id] : [];
  return (
    <>
      <div className="sidebar-scroll" onClick={(e) => { if (e.target === e.currentTarget) setSel([]); }}>
        {list.map((p) => (
          <div key={p.project.id} className={'sb-row' + (effective.includes(p.project.id) ? ' on' : '') + (p.effectiveStatus !== 'active' ? ' dim' : '')} style={{ paddingLeft: 6 }} onClick={(e) => click(p.project.id, e)}>
            <span className="disclosure" />
            <span className="icon">
              <ProjectSmallIcon style={{ color: p.effectiveStatus === 'active' ? 'var(--c-projects)' : '#9a9aa0' }} />
            </span>
            <span className="label">{p.project.name || 'Untitled Project'}</span>
            {p.needsReview && <span className="review-dot" />}
          </div>
        ))}
      </div>
      <div className="sidebar-footer">
        <button title="New Project" onClick={() => { const id = store.addProject({ name: 'Untitled Project' }); setSel([id]); }}>
          <PlusIcon />
        </button>
        <button title="Mark All Reviewed" onClick={() => store.markReviewed(list.map((p) => p.project.id))}>
          <UndoIcon />
        </button>
      </div>
    </>
  );
}

/* ---------------- Inbox / Flagged / Nearby sidebars (empty) ---------------- */
function PlainSidebar() {
  return (
    <>
      <div className="sidebar-scroll" />
      <div className="sidebar-footer">
        <button title="New Action" onClick={() => { const id = store.addTask({ name: '' }); store.ui({ selection: [id] }); }}>
          <PlusIcon />
        </button>
        <button title="Actions">
          <GearIcon />
        </button>
      </div>
    </>
  );
}

export function Sidebar() {
  const db = useDB();
  const p = db.ui.perspective;
  return (
    <div className="sidebar">
      {p === 'projects' ? <ProjectsSidebar /> : p === 'tags' ? <TagsSidebar /> : p === 'forecast' ? <ForecastSidebar /> : p === 'review' ? <ReviewSidebar /> : <PlainSidebar />}
    </div>
  );
}
