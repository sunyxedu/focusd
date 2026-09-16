import React, { useEffect, useRef, useState } from 'react';
import { store, useSnapshot } from '../core/store';
import type { ID, SidebarRow, Snapshot } from '../core/types';
import { addDays, dayKey, startOfDay } from '../core/format';
import {
  ChevronRight, FolderIcon, GearIcon, PauseIcon, PlusIcon, ProjectSmallIcon, TagOutlineIcon, SequentialIcon,
  SingleActionsIcon, CheckCircleIcon, MinusCircleIcon, UndoIcon,
} from './Icons';
import { Menu, MenuItem } from './Popover';
import '../styles/sidebar.css';

/** Drag payload type used by the outline for task rows (kept in sync with Outline.tsx). */
const TASK_DRAG_TYPE = 'text/focus-task-ids';
const SB_DRAG_TYPE = 'text/focus-sidebar';

type DropPos = 'into' | 'before' | 'after';

/* ---------------- selection helpers ---------------- */
function useSidebarSelection(snap: Snapshot) {
  const sel = snap.sidebar.selection;
  const setSel = (ids: ID[]) => {
    store.select([]);
    void store.api.setSidebarSelection(ids);
  };
  const click = (id: ID, e: React.MouseEvent, rows?: SidebarRow[]) => {
    if (e.metaKey || e.ctrlKey) setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
    else if (e.shiftKey && rows && sel.length) {
      const ids = rows.map((r) => r.id!).filter(Boolean);
      const a = ids.indexOf(sel[sel.length - 1]);
      const b = ids.indexOf(id);
      if (a >= 0 && b >= 0) setSel(ids.slice(Math.min(a, b), Math.max(a, b) + 1));
      else setSel([id]);
    } else if (sel.length === 1 && sel[0] === id) setSel([]);
    else setSel([id]);
  };
  return { sel, setSel, click };
}

/** Parent id + ordered sibling ids of a sidebar entity, from the raw snapshot maps. */
function siblingsOf(snap: Snapshot, id: ID): { parent: ID | null; siblings: ID[] } {
  const byRank = <T extends { id: ID; rank: number }>(xs: T[]) => xs.sort((a, b) => a.rank - b.rank).map((x) => x.id);
  if (snap.projects[id]) {
    const parent = snap.projects[id].folderId;
    return { parent, siblings: byRank(Object.values(snap.projects).filter((p) => p.folderId === parent)) };
  }
  if (snap.folders[id]) {
    const parent = snap.folders[id].parentId;
    return { parent, siblings: byRank(Object.values(snap.folders).filter((f) => f.parentId === parent)) };
  }
  const parent = snap.tags[id]?.parentId ?? null;
  return { parent, siblings: byRank(Object.values(snap.tags).filter((t) => t.parentId === parent)) };
}

/** `after` argument that places `moved` before `target` among target's siblings. */
function afterForBefore(snap: Snapshot, moved: ID, target: ID): ID | null {
  const { siblings } = siblingsOf(snap, target);
  const list = siblings.filter((x) => x !== moved);
  const i = list.indexOf(target);
  // '' is the core's "insert as first sibling" sentinel
  return i > 0 ? list[i - 1] : '';
}

function useDropPos(kindOfTarget: (id: ID) => 'container' | 'leaf') {
  const [dropTarget, setDropTarget] = useState<{ id: ID; pos: DropPos } | null>(null);
  const onDragOver = (e: React.DragEvent, id: ID) => {
    const isSb = e.dataTransfer.types.includes(SB_DRAG_TYPE);
    if (!isSb && !e.dataTransfer.types.includes(TASK_DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const r = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - r.top;
    let pos: DropPos = 'into';
    if (isSb) pos = y < r.height / 3 ? 'before' : y > (2 * r.height) / 3 ? 'after' : kindOfTarget(id) === 'container' ? 'into' : 'after';
    setDropTarget({ id, pos });
  };
  const styleFor = (id: ID): React.CSSProperties | undefined =>
    dropTarget?.id === id && dropTarget.pos !== 'into'
      ? { boxShadow: dropTarget.pos === 'before' ? 'inset 0 2px 0 var(--c-accent)' : 'inset 0 -2px 0 var(--c-accent)' }
      : undefined;
  const classFor = (id: ID) => (dropTarget?.id === id && dropTarget.pos === 'into' ? ' drop-target' : '');
  return { dropTarget, setDropTarget, onDragOver, styleFor, classFor };
}

/* ---------------- editable label ---------------- */
function EditableLabel({ value, editing, onCommit, placeholder, dim }: { value: string; editing: boolean; onCommit: (v: string | null) => void; placeholder: string; dim?: boolean }) {
  const [text, setText] = useState(value);
  const done = useRef(false);
  useEffect(() => {
    if (editing) {
      setText(value);
      done.current = false;
    }
  }, [editing, value]);
  const commit = (v: string | null) => {
    if (done.current) return;
    done.current = true;
    onCommit(v);
  };
  if (!editing)
    return (
      <span className={'label' + (dim ? ' dim' : '')}>
        {value || <span className="placeholder">{placeholder}</span>}
      </span>
    );
  return (
    <span className="label">
      <input
        autoFocus
        value={text}
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => commit(text)}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') commit(text);
          if (e.key === 'Escape') commit(null);
        }}
      />
    </span>
  );
}

/** Rename handling shared by every sidebar: fresh (just created) items are deleted when left unnamed. */
function useRename() {
  const [editing, setEditing] = useState<ID | null>(null);
  const fresh = useRef(new Set<ID>());
  const begin = (id: ID, isFresh = false) => {
    if (isFresh) fresh.current.add(id);
    setEditing(id);
  };
  const commit = (id: ID, v: string | null) => {
    setEditing(null);
    const wasFresh = fresh.current.delete(id);
    if (v === null) {
      if (wasFresh) void store.api.deleteItems([id]);
      return;
    }
    const name = v.trim();
    if (!name && wasFresh) {
      void store.api.deleteItems([id]);
      return;
    }
    void store.api.rename(id, name);
  };
  useEffect(() => {
    const on = (e: Event) => begin((e as CustomEvent<ID>).detail, true);
    window.addEventListener('focus:edit-sidebar', on);
    return () => window.removeEventListener('focus:edit-sidebar', on);
  }, []);
  return { editing, begin, commit };
}

function ProjectIcon({ row }: { row: SidebarRow }) {
  const color = row.status === 'active' ? 'var(--c-projects)' : '#9a9aa0';
  const style = { color };
  const raw = row.id ? store.snapshot?.projects[row.id]?.status : undefined;
  if (raw === 'done') return <CheckCircleIcon style={style} />;
  if (raw === 'dropped') return <MinusCircleIcon style={style} />;
  if (row.projectType === 'sequential') return <SequentialIcon style={style} />;
  if (row.projectType === 'singleActions') return <SingleActionsIcon style={style} />;
  return <ProjectSmallIcon style={style} />;
}

/* ---------------- Projects sidebar ---------------- */
function ProjectsSidebar({ snap }: { snap: Snapshot }) {
  const api = store.api;
  const rows = snap.sidebar.rows;
  const { sel, click, setSel } = useSidebarSelection(snap);
  const { editing, begin, commit } = useRename();
  const [menu, setMenu] = useState<{ anchor: HTMLElement; id: ID } | null>(null);
  const [addMenu, setAddMenu] = useState<HTMLElement | null>(null);
  const [gearMenu, setGearMenu] = useState<HTMLElement | null>(null);
  const dnd = useDropPos((id) => (snap.folders[id] ? 'container' : 'leaf'));
  const focus = snap.focusIds;

  const onDrop = (e: React.DragEvent, id: ID) => {
    e.preventDefault();
    const target = dnd.dropTarget;
    dnd.setDropTarget(null);
    const taskIds = e.dataTransfer.getData(TASK_DRAG_TYPE);
    if (taskIds) {
      if (snap.projects[id]) void api.moveTasks(taskIds.split(','), id, null);
      return;
    }
    const sb = e.dataTransfer.getData(SB_DRAG_TYPE);
    if (!sb || !target) return;
    const [k, moved] = sb.split(':');
    if (moved === id) return;
    const targetIsFolder = !!snap.folders[id];
    if (k === 'project') {
      if (targetIsFolder && target.pos === 'into') return void api.moveProject(moved, id, null);
      if (targetIsFolder) return void api.moveProject(moved, snap.folders[id].parentId, target.pos === 'after' ? null : afterForBefore(snap, moved, id));
      const tp = snap.projects[id];
      if (target.pos === 'after') return void api.moveProject(moved, tp.folderId, id);
      return void api.moveProject(moved, tp.folderId, afterForBefore(snap, moved, id));
    }
    if (k === 'folder') {
      if (!targetIsFolder) return;
      if (target.pos === 'into') return void api.moveFolder(moved, id, null);
      const tf = snap.folders[id];
      if (target.pos === 'after') return void api.moveFolder(moved, tf.parentId, id);
      return void api.moveFolder(moved, tf.parentId, afterForBefore(snap, moved, id));
    }
  };

  const newProject = async (folder: ID | null) => {
    const id = await api.addProject('', folder);
    if (folder) await api.setSidebarExpanded(folder, true);
    setSel([id]);
    begin(id, true);
  };
  const newFolder = async (parent: ID | null) => {
    const id = await api.addFolder('', parent);
    if (parent) await api.setSidebarExpanded(parent, true);
    begin(id, true);
  };

  const menuItems = (): MenuItem[] => {
    if (!menu) return [];
    const id = menu.id;
    const p = snap.projects[id];
    const f = snap.folders[id];
    if (p)
      return [
        { label: 'Rename', onSelect: () => begin(p.id) },
        { label: 'Focus', onSelect: () => void api.setFocus([p.id]) },
        { separator: true, label: '' },
        { label: 'Active', checked: p.status === 'active', onSelect: () => void api.setProjectStatus(p.id, 'active') },
        { label: 'On Hold', checked: p.status === 'onHold', onSelect: () => void api.setProjectStatus(p.id, 'onHold') },
        { label: 'Completed', checked: p.status === 'done', onSelect: () => void api.setProjectStatus(p.id, 'done') },
        { label: 'Dropped', checked: p.status === 'dropped', onSelect: () => void api.setProjectStatus(p.id, 'dropped') },
        { separator: true, label: '' },
        { label: 'Parallel', checked: p.projectType === 'parallel', onSelect: () => void api.setProjectType(p.id, 'parallel') },
        { label: 'Sequential', checked: p.projectType === 'sequential', onSelect: () => void api.setProjectType(p.id, 'sequential') },
        { label: 'Single Actions', checked: p.projectType === 'singleActions', onSelect: () => void api.setProjectType(p.id, 'singleActions') },
        { separator: true, label: '' },
        { label: 'Mark Reviewed', sub: '⇧⌘R', onSelect: () => void api.markReviewed([p.id]) },
        { label: 'Delete Project', onSelect: () => void api.deleteItems([p.id]) },
      ];
    if (f)
      return [
        { label: 'Rename', onSelect: () => begin(f.id) },
        { label: 'Focus', onSelect: () => void api.setFocus([f.id]) },
        { label: 'New Project in Folder', onSelect: () => void newProject(f.id) },
        { label: 'New Folder in Folder', onSelect: () => void newFolder(f.id) },
        { separator: true, label: '' },
        { label: f.status === 'dropped' ? 'Mark Active' : 'Drop Folder', onSelect: () => void api.setFolderStatus(f.id, f.status === 'dropped' ? 'active' : 'dropped') },
        { label: 'Delete Folder', onSelect: () => void api.deleteItems([f.id]) },
      ];
    return [];
  };

  const selectedFolder = sel.find((id) => snap.folders[id]) ?? null;
  const folderForNewProject = selectedFolder ?? (sel[0] && snap.projects[sel[0]]?.folderId) ?? null;

  return (
    <>
      <div className="sidebar-scroll" onClick={(e) => { if (e.target === e.currentTarget) setSel([]); }}>
        {rows.map((row) => {
          const id = row.id!;
          const isFolder = row.kind === 'folder';
          return (
            <div
              key={row.key}
              data-sidebar-id={id}
              className={'sb-row' + (row.selected ? ' on' : '') + dnd.classFor(id) + (row.dim ? ' dim' : '')}
              style={{ paddingLeft: 4 + row.depth * 19, ...dnd.styleFor(id) }}
              draggable={editing !== id}
              onDragStart={(e) => e.dataTransfer.setData(SB_DRAG_TYPE, (isFolder ? 'folder:' : 'project:') + id)}
              onDragOver={(e) => dnd.onDragOver(e, id)}
              onDragLeave={() => dnd.setDropTarget(null)}
              onDrop={(e) => onDrop(e, id)}
              onClick={(e) => click(id, e, rows)}
              onDoubleClick={() => begin(id)}
              onContextMenu={(e) => {
                e.preventDefault();
                if (!sel.includes(id)) setSel([id]);
                setMenu({ anchor: e.currentTarget, id });
              }}
            >
              {isFolder ? (
                <button
                  className={'disclosure' + (row.hasChildren ? ' has' : '') + (row.expanded ? ' open' : '')}
                  onClick={(e) => {
                    e.stopPropagation();
                    void api.setSidebarExpanded(row.key, !row.expanded);
                  }}
                >
                  <ChevronRight />
                </button>
              ) : (
                <span className="disclosure" />
              )}
              <span className="icon">{isFolder ? <FolderIcon style={{ color: '#7a7a80' }} /> : <ProjectIcon row={row} />}</span>
              <EditableLabel value={row.name} editing={editing === id} placeholder={isFolder ? 'Untitled Folder' : 'Untitled Project'} onCommit={(v) => commit(id, v)} />
              {row.status === 'onHold' && (
                <span className="aux">
                  <PauseIcon />
                </span>
              )}
              {row.dueState !== 'none' && (
                <span className="aux dot" style={{ color: row.dueState === 'overdue' ? 'var(--c-overdue)' : 'var(--c-duesoon)' }}>
                  ●
                </span>
              )}
            </div>
          );
        })}
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
            { label: 'New Project', sub: '⇧⌘N', onSelect: () => void newProject(folderForNewProject) },
            { label: 'New Folder', sub: '⌥⌘N', onSelect: () => void newFolder(selectedFolder) },
          ]}
        />
      )}
      {gearMenu && (
        <Menu
          anchor={gearMenu}
          onClose={() => setGearMenu(null)}
          items={[
            { label: 'Expand All', onSelect: () => void api.expandAllSidebar(true) },
            { label: 'Collapse All', onSelect: () => void api.expandAllSidebar(false) },
            { separator: true, label: '' },
            { label: 'Focus', disabled: !sel.some((id) => snap.projects[id] || snap.folders[id]), onSelect: () => void api.setFocus(sel.filter((id) => snap.projects[id] || snap.folders[id])) },
            { label: 'Unfocus', disabled: !focus.length, onSelect: () => void api.setFocus([]) },
          ]}
        />
      )}
    </>
  );
}

/* ---------------- Tags sidebar ---------------- */
function TagsSidebar({ snap }: { snap: Snapshot }) {
  const api = store.api;
  const rows = snap.sidebar.rows;
  const { sel, click, setSel } = useSidebarSelection(snap);
  const { editing, begin, commit } = useRename();
  const [menu, setMenu] = useState<{ anchor: HTMLElement; id: ID } | null>(null);
  const [gearMenu, setGearMenu] = useState<HTMLElement | null>(null);
  const dnd = useDropPos(() => 'container');

  const newTag = async (parent: ID | null) => {
    const id = await api.addTag('', parent);
    if (parent) await api.setSidebarExpanded(parent, true);
    begin(id, true);
  };

  const onDrop = (e: React.DragEvent, id: ID) => {
    e.preventDefault();
    const target = dnd.dropTarget;
    dnd.setDropTarget(null);
    const ids = e.dataTransfer.getData(TASK_DRAG_TYPE);
    if (ids) {
      void api.addTagToItems(ids.split(','), id);
      return;
    }
    const sb = e.dataTransfer.getData(SB_DRAG_TYPE);
    if (!sb || !target) return;
    const [k, moved] = sb.split(':');
    if (k !== 'tag' || moved === id) return;
    const t = snap.tags[id];
    if (target.pos === 'into') void api.moveTag(moved, id, null);
    else if (target.pos === 'after') void api.moveTag(moved, t.parentId, id);
    else void api.moveTag(moved, t.parentId, afterForBefore(snap, moved, id));
  };

  const menuItems = (): MenuItem[] => {
    if (!menu) return [];
    const t = snap.tags[menu.id];
    if (!t) return [];
    return [
      { label: 'Rename', onSelect: () => begin(t.id) },
      { label: 'New Child Tag', onSelect: () => void newTag(t.id) },
      { separator: true, label: '' },
      { label: 'Active', checked: t.status === 'active', onSelect: () => void api.setTagStatus(t.id, 'active') },
      { label: 'On Hold', checked: t.status === 'onHold', onSelect: () => void api.setTagStatus(t.id, 'onHold') },
      { label: 'Dropped', checked: t.status === 'dropped', onSelect: () => void api.setTagStatus(t.id, 'dropped') },
      { separator: true, label: '' },
      { label: 'Allows next action', checked: t.allowsNextAction, onSelect: () => void api.setTagAllowsNextAction(t.id, !t.allowsNextAction) },
      { separator: true, label: '' },
      { label: 'Delete Tag', onSelect: () => void api.deleteItems([t.id]) },
    ];
  };

  return (
    <>
      <div className="sidebar-scroll" onClick={(e) => { if (e.target === e.currentTarget) setSel([]); }}>
        {rows.map((row) => {
          const id = row.id!;
          if (row.kind === 'untagged')
            return (
              <div
                key={row.key}
                data-sidebar-id={id}
                className={'sb-row' + (row.selected ? ' on' : '')}
                style={{ paddingLeft: 2 }}
                onClick={(e) => click(id, e, rows)}
              >
                <span className="disclosure" />
                <span className="icon">
                  <TagOutlineIcon style={{ color: 'var(--c-tags)' }} />
                </span>
                <span className="label">Untagged</span>
              </div>
            );
          return (
            <div
              key={row.key}
              data-sidebar-id={id}
              className={'sb-row' + (row.selected ? ' on' : '') + dnd.classFor(id) + (row.tagStatus === 'dropped' ? ' dim' : '')}
              style={{ paddingLeft: 2 + row.depth * 18, ...dnd.styleFor(id) }}
              draggable={editing !== id}
              onDragStart={(e) => e.dataTransfer.setData(SB_DRAG_TYPE, 'tag:' + id)}
              onDragOver={(e) => dnd.onDragOver(e, id)}
              onDragLeave={() => dnd.setDropTarget(null)}
              onDrop={(e) => onDrop(e, id)}
              onClick={(e) => click(id, e, rows)}
              onDoubleClick={() => begin(id)}
              onContextMenu={(e) => {
                e.preventDefault();
                if (!sel.includes(id)) setSel([id]);
                setMenu({ anchor: e.currentTarget, id });
              }}
            >
              <button
                className={'disclosure' + (row.hasChildren ? ' has' : '') + (row.expanded ? ' open' : '')}
                onClick={(e) => {
                  e.stopPropagation();
                  void api.setSidebarExpanded(row.key, !row.expanded);
                }}
              >
                <ChevronRight />
              </button>
              <span className="icon">
                <TagOutlineIcon style={{ color: row.tagStatus === 'dropped' ? '#9a9aa0' : 'var(--c-tags)' }} />
              </span>
              <EditableLabel value={row.name} editing={editing === id} placeholder="Untitled Tag" onCommit={(v) => commit(id, v)} />
              {row.tagStatus === 'onHold' && (
                <span className="aux">
                  <PauseIcon />
                </span>
              )}
              {row.tagStatus === 'dropped' && (
                <span className="aux">
                  <MinusCircleIcon />
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="sidebar-footer">
        <button title="New Tag" onClick={() => void newTag(sel.find((id) => snap.tags[id]) ?? null)}>
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
            { label: 'Expand All', onSelect: () => void api.expandAllSidebar(true) },
            { label: 'Collapse All', onSelect: () => void api.expandAllSidebar(false) },
          ]}
        />
      )}
    </>
  );
}

/* ---------------- Forecast sidebar (calendar) ---------------- */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function ForecastSidebar({ snap }: { snap: Snapshot }) {
  const api = store.api;
  const fc = snap.sidebar.forecast;
  const selected = snap.sidebar.forecastSelectedDay;
  const select = (k: string) => {
    store.select([]);
    void api.setForecastSelectedDay(selected === k ? null : k);
  };
  const today = startOfDay(snap.now);
  const weekStart = snap.settings.weekStartsOn;
  const dow = (new Date(today).getDay() - weekStart + 7) % 7;
  const gridStart = addDays(today, -dow);
  const cells: number[] = [];
  for (let i = 0; i < 35; i++) cells.push(addDays(gridStart, i));
  const days = fc?.days ?? [];
  const past = days[0];
  const future = days[days.length - 1];
  const futureItems = fc?.items['future'] ?? [];
  const countFor = (t: number) => {
    if (t < today) return 0;
    const k = dayKey(t);
    const day = days.find((x) => x.key === k);
    if (day) return day.count;
    // beyond the 14-day window: count future items dated exactly that day
    return futureItems.filter((x) => {
      const dt = x.kind === 'task' ? x.effectiveDueDate ?? x.effectivePlannedDate : x.kind === 'project' ? x.project.dueDate ?? x.project.plannedDate : x.start;
      return dt != null && dayKey(dt) === k;
    }).length;
  };
  const wdNames = weekStart === 1 ? ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] : ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const pastCount = past?.count ?? 0;

  return (
    <>
      <div className="sidebar-scroll fc-scroll">
        <div className={'fc-block' + (selected === 'past' ? ' on' : '')} onClick={() => select('past')}>
          <div className="t">Past</div>
          <div className="n" style={pastCount ? { color: 'var(--c-overdue)' } : undefined}>{pastCount}</div>
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
              const isPad = t < today;
              const n = countFor(t);
              const label = dt.getDate() === 1 ? MONTHS[dt.getMonth()] : isToday ? 'Today' : String(dt.getDate());
              return (
                <div
                  key={k}
                  className={'fc-day' + (isToday ? ' today' : '') + (selected === k ? ' on' : '') + (isPad ? ' pad' : '')}
                  onClick={() => !isPad && select(k)}
                >
                  {!isPad && <span className="d">{label}</span>}
                  {n > 0 && <span className={'cnt' + (isToday && pastCount ? ' overdue' : '')}>{n}</span>}
                </div>
              );
            })}
          </div>
        </div>
        <div className={'fc-block' + (selected === 'future' ? ' on' : '')} onClick={() => select('future')}>
          <div className="t">Future</div>
          <div className="n">{future?.count ?? 0}</div>
        </div>
      </div>
      <div className="sidebar-footer">
        <button
          title="New Action"
          onClick={() => {
            const base = selected && selected !== 'past' && selected !== 'future' ? new Date(selected + 'T00:00:00').getTime() : today;
            const due = new Date(base).setHours(snap.settings.defaultDueHour, 0, 0, 0);
            void api.addTask({ name: '', dueDate: due }).then((id) => {
              store.select([id]);
              window.dispatchEvent(new CustomEvent('focus:edit-name', { detail: id }));
            });
          }}
        >
          <PlusIcon />
        </button>
        <button title="Show Today" onClick={() => void api.setForecastSelectedDay(null)}>
          <GearIcon />
        </button>
      </div>
    </>
  );
}

/* ---------------- Review sidebar ---------------- */
function ReviewSidebar({ snap }: { snap: Snapshot }) {
  const api = store.api;
  const rows = snap.sidebar.rows;
  const { click, setSel } = useSidebarSelection(snap);
  const { editing, begin, commit } = useRename();
  return (
    <>
      <div className="sidebar-scroll" onClick={(e) => { if (e.target === e.currentTarget) setSel([]); }}>
        {rows.map((row) => {
          const id = row.id!;
          return (
            <div
              key={row.key}
              data-sidebar-id={id}
              className={'sb-row' + (row.selected ? ' on' : '') + (row.dim ? ' dim' : '')}
              style={{ paddingLeft: 6 }}
              onClick={(e) => click(id, e, rows)}
              onDoubleClick={() => begin(id)}
            >
              <span className="disclosure" />
              <span className="icon">
                <ProjectIcon row={row} />
              </span>
              <EditableLabel value={row.name} editing={editing === id} placeholder="Untitled Project" onCommit={(v) => commit(id, v)} />
              {row.needsReview && <span className="review-dot" />}
            </div>
          );
        })}
      </div>
      <div className="sidebar-footer">
        <button
          title="New Project"
          onClick={() => void api.addProject('').then((id) => { setSel([id]); begin(id, true); })}
        >
          <PlusIcon />
        </button>
        <button title="Mark All Reviewed" onClick={() => void api.markReviewed(rows.map((r) => r.id!))}>
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
        <button
          title="New Action"
          onClick={() => void store.api.addTask({ name: '' }).then((id) => {
            store.select([id]);
            window.dispatchEvent(new CustomEvent('focus:edit-name', { detail: id }));
          })}
        >
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
  const snap = useSnapshot();
  if (!snap) return <div className="sidebar" />;
  const p = snap.perspective;
  // Inbox, Flagged and Nearby have no sidebar pane.
  if (p === 'inbox' || p === 'flagged' || p === 'nearby') return null;
  return (
    <div className="sidebar" data-perspective={p}>
      {p === 'projects' ? <ProjectsSidebar snap={snap} /> : p === 'tags' ? <TagsSidebar snap={snap} /> : p === 'forecast' ? <ForecastSidebar snap={snap} /> : p === 'review' ? <ReviewSidebar snap={snap} /> : <PlainSidebar />}
    </div>
  );
}
