import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { store, useSnapshot, useUi } from '../core/store';
import type { ID, Perspective, RepetitionRule, Row, Snapshot, TaskRow, ProjectRow } from '../core/types';
import { relativeDateLabel, shortNumericDate, timeLabel } from '../core/format';
import { PERSPECTIVE_META } from './PerspectivesBar';
import {
  CalendarDueIcon,
  CheckIcon,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CloseIcon,
  EmptyFlagArt,
  EmptyForecastArt,
  EmptyInboxArt,
  EmptyNearbyArt,
  EmptyProjectsArt,
  EmptyReviewArt,
  EmptyTagsArt,
  FlagOutlineIcon,
  FolderIcon,
  MinusIcon,
  NoteIcon,
  NoteOutlineIcon,
  ProjectSmallIcon,
  RepeatIcon,
  SidebarIcon,
  TagOutlineIcon,
  CalendarIcon,
  ClockIcon,
} from './Icons';
import { DateInput, ProjectPicker, TagPicker } from './Fields';
import { Menu, MenuItem } from './Popover';
import '../styles/outline.css';

export const DRAG_TYPE = 'text/focus-task-ids';

/* ---------------- helpers ---------------- */

/** id whose name field should receive focus once rendered */
let pendingFocus: ID | null = null;
const focusListeners = new Set<() => void>();
export function requestNameFocus(id: ID) {
  pendingFocus = id;
  for (const l of focusListeners) l();
}

const PERSPECTIVE_COLOR: Record<Perspective, string> = Object.fromEntries(PERSPECTIVE_META.map((m) => [m.id, m.color])) as Record<Perspective, string>;

/** Presentation of a repeat rule (mirrors core/src/repeat.rs describe_rule). */
function describeRule(rule: RepetitionRule): string {
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const every = rule.every <= 1 ? `Every ${rule.unit}` : `Every ${rule.every} ${rule.unit}s`;
  const days = rule.unit === 'week' && rule.weekdays.length ? ` on ${rule.weekdays.map((d) => WD[d]).join(', ')}` : '';
  const method = rule.method === 'startAfterCompletion' ? ' (defer another)' : rule.method === 'dueAfterCompletion' ? ' (due again)' : '';
  return every + days + method;
}

function atHour(dayMs: number, hour: number): number {
  const d = new Date(dayMs);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

/** Ordered sibling ids of a task (same parent) or project (same folder). */
function siblingsOf(snap: Snapshot, id: ID): ID[] {
  const t = snap.tasks[id];
  if (t) {
    return Object.values(snap.tasks)
      .filter((x) => x.parentId === t.parentId)
      .sort((a, b) => a.rank - b.rank)
      .map((x) => x.id);
  }
  const p = snap.projects[id];
  if (p) {
    return Object.values(snap.projects)
      .filter((x) => x.folderId === p.folderId)
      .sort((a, b) => a.rank - b.rank)
      .map((x) => x.id);
  }
  return [];
}

function projectOf(snap: Snapshot, id: ID): ID | null {
  let cur: ID | null = snap.tasks[id]?.parentId ?? null;
  while (cur) {
    if (snap.projects[cur]) return cur;
    cur = snap.tasks[cur]?.parentId ?? null;
  }
  return null;
}

/** Resolve once the store snapshot contains `id` (snapshot refresh is async
 *  and a stale in-flight refresh would otherwise prune the selection). */
async function whenInSnapshot(id: ID): Promise<void> {
  for (let i = 0; i < 40; i++) {
    const s = store.snapshot;
    if (s && (s.tasks[id] || s.projects[id]) && s.content.rows.some((r) => r.kind !== 'header' && r.kind !== 'event' && r.id === id)) return;
    await new Promise((r) => setTimeout(r, 25));
  }
}

/** Set the due date on tasks/projects (keeps defer/planned). */
async function setDue(snap: Snapshot, ids: ID[], due: number | null) {
  for (const id of ids) {
    const item = snap.tasks[id] ?? snap.projects[id];
    if (item) await store.api.setItemDates(id, item.deferDate, item.plannedDate, due);
  }
}

/** Create a new item appropriate to the current perspective / selection (⌘N). */
export async function newItemInContext(): Promise<ID | null> {
  const snap = store.snapshot;
  if (!snap) return null;
  const api = store.api;
  const p = snap.perspective;
  const sel = store.ui.selection;
  const selId = sel[sel.length - 1];
  const sb = snap.ui.sidebarSelection[p] ?? [];
  let id: ID | null = null;
  if (selId && snap.tasks[selId]) {
    const t = snap.tasks[selId];
    const parentTask = t.parentId && snap.tasks[t.parentId] ? t.parentId : null;
    id = await api.addTask({
      name: '',
      parent: parentTask,
      project: !parentTask && t.parentId && snap.projects[t.parentId] ? t.parentId : null,
      after: t.id,
      tagIds: p === 'tags' ? t.tagIds : [],
      dueDate: p === 'forecast' ? t.dueDate : null,
      flagged: p === 'flagged',
    });
  } else if (selId && snap.projects[selId]) {
    id = await api.addTask({ name: '', project: selId });
  } else {
    switch (p) {
      case 'inbox':
        id = await api.addTask({ name: '' });
        break;
      case 'projects': {
        const proj = sb.find((x) => snap.projects[x]) ?? snap.focusIds.find((x) => snap.projects[x]);
        if (proj) id = await api.addTask({ name: '', project: proj });
        else {
          const folder = sb.find((x) => snap.folders[x]) ?? null;
          id = await api.addProject('', folder);
          await api.setSidebarSelection([]);
        }
        break;
      }
      case 'tags':
        id = await api.addTask({ name: '', tagIds: sb.filter((x) => snap.tags[x]) });
        break;
      case 'forecast': {
        const sd = snap.ui.forecastSelectedDay;
        const base = sd && sd !== 'past' && sd !== 'future' ? new Date(sd + 'T00:00:00').getTime() : Date.now();
        id = await api.addTask({ name: '', dueDate: atHour(base, snap.settings.defaultDueHour) });
        break;
      }
      case 'flagged':
        id = await api.addTask({ name: '', flagged: true });
        break;
      case 'review': {
        const first = snap.sidebar.rows.find((r) => r.kind === 'reviewProject')?.id ?? null;
        const proj = sb[0] ?? first;
        id = proj ? await api.addTask({ name: '', project: proj }) : await api.addTask({ name: '' });
        break;
      }
      default:
        id = await api.addTask({ name: '' });
    }
  }
  if (id) {
    await whenInSnapshot(id);
    store.select([id]);
    requestNameFocus(id);
  }
  return id;
}

/* ---------------- Status circle ---------------- */
function StatusCircle({ row }: { row: TaskRow | ProjectRow }) {
  const info = row.info;
  const done = row.kind === 'task' ? row.info.effectiveCompleted : row.info.effectiveStatus === 'done';
  const dropped = row.kind === 'task' ? row.info.effectiveDropped : row.info.effectiveStatus === 'dropped';
  const flagged = row.kind === 'task' ? row.info.effectiveFlagged : row.project.flagged;
  const blocked = info.blocked || info.deferred;
  const cls = ['circle'];
  if (done) cls.push('done');
  else if (dropped) cls.push('dropped');
  if (flagged) cls.push('flagged');
  if (!done && !dropped) {
    if (info.dueState === 'overdue') cls.push('overdue');
    else if (info.dueState === 'dueSoon') cls.push('duesoon');
    if (blocked) cls.push('blocked');
  }
  return (
    <button
      className="status"
      title={done ? 'Mark Incomplete' : 'Mark Complete'}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        void store.api.toggleComplete([row.id]);
      }}
    >
      <span className={cls.join(' ')}>{done ? <CheckIcon /> : dropped ? <MinusIcon /> : null}</span>
    </button>
  );
}

/* ---------------- Editable name ---------------- */
function NameField({ id, value, onCommit, onEnter, onTab, placeholder, className }: { id: ID; value: string; onCommit: (v: string) => void; onEnter: () => void; onTab: () => void; placeholder?: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [, bump] = useState(0);
  useLayoutEffect(() => {
    if (ref.current && ref.current.textContent !== value && document.activeElement !== ref.current) ref.current.textContent = value;
  }, [value]);
  useEffect(() => {
    const l = () => bump((n) => n + 1);
    focusListeners.add(l);
    return () => { focusListeners.delete(l); };
  }, []);
  useEffect(() => {
    if (pendingFocus === id && ref.current) {
      pendingFocus = null;
      ref.current.focus();
      const sel = window.getSelection();
      if (sel && ref.current.firstChild) sel.selectAllChildren(ref.current);
    }
  });
  const commit = () => {
    const v = (ref.current?.textContent ?? '').replace(/\n+$/g, '');
    if (v !== value) onCommit(v);
  };
  return (
    <div
      ref={ref}
      className={className ?? 'name'}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-placeholder={placeholder}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') return; // handled by the outline (moves selection)
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          commit();
          onEnter();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          ref.current?.blur();
        } else if (e.key === 'Tab' && !e.shiftKey) {
          e.preventDefault();
          commit();
          onTab();
        }
      }}
    />
  );
}

/* ---------------- Row ---------------- */
type Field = 'project' | 'tags' | 'due' | 'defer' | 'note' | null;

interface RowProps {
  row: Row;
  snap: Snapshot;
  selected: boolean;
  hasKids: boolean;
  noteExpanded: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  dropInto: boolean;
  onContextMenu: (e: React.MouseEvent) => void;
  editField: Field;
  setEditField: (f: Field | ((f: Field) => Field)) => void;
}

const RowView = React.memo(function RowView({ row, snap, selected, hasKids, noteExpanded, onSelect, onDragStart, onDragOver, onDrop, dropInto, onContextMenu, editField, setEditField }: RowProps) {
  const api = store.api;
  // Focusd: the disclosure column is fixed; bodies indent 27px per level
  // below the project (projects hide their status column entirely).
  const indent = Math.max(row.depth - 1, 0) * 27;
  const collapsed = row.kind === 'event' ? false : row.collapsed;
  const toggleCollapsed = () => void api.setCollapsed(row.key, !collapsed);

  if (row.kind === 'header') {
    return (
      <div className={'row header' + (row.dayKey ? ' fday' : '')} style={{ paddingLeft: 12 + indent }} onDragOver={onDragOver} onDrop={onDrop}>
        <button className={'disclosure has' + (collapsed ? '' : ' open')} onClick={toggleCollapsed}>
          <ChevronRight />
        </button>
        <span className="status" style={{ visibility: 'hidden' }} />
        <span className="name">
          {row.title}
          {row.sub && <span className="count">{row.sub}</span>}
          {row.count !== null && !row.sub && row.dayKey === null && row.id !== '__inbox' && <span className="count">{row.count}</span>}
        </span>
      </div>
    );
  }
  if (row.kind === 'event') {
    return (
      <div className={'row event' + (selected ? ' selected' : '')} style={{ paddingLeft: 12 }} data-row-id={row.id} onMouseDown={onSelect}>
        <span className="disclosure" />
        <div className="row-inner">
          {indent > 0 && <span className="indent" style={{ width: indent }} />}
          <span className="status event-bar" style={{ background: row.event.color || 'var(--c-forecast)' }} />
          <div className="body">
            <div className="name event-title">
              {row.event.title}
              {row.event.location && <span className="event-loc">{row.event.location}</span>}
            </div>
          </div>
          <div className="trail">
            <span className="event-time">{row.event.allDay ? 'all day' : row.timeLabel}</span>
          </div>
        </div>
      </div>
    );
  }
  if (row.kind === 'folder') {
    return (
      <div className={'row header' + (selected ? ' selected' : '')} style={{ paddingLeft: 12 + indent }} data-row-id={row.id} onMouseDown={onSelect} onDragOver={onDragOver} onDrop={onDrop} onContextMenu={onContextMenu}>
        <button className={'disclosure has' + (collapsed ? '' : ' open')} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); toggleCollapsed(); }}>
          <ChevronRight />
        </button>
        <span className="status" style={{ visibility: 'visible', color: '#8a8a90' }}>
          <FolderIcon style={{ width: 16, height: 16 }} />
        </span>
        <span className="name">{row.folder.name || 'Untitled Folder'}</span>
      </div>
    );
  }

  const isProject = row.kind === 'project';
  const item = isProject ? row.project : row.task;
  const info = row.info;
  const done = row.kind === 'project' ? row.info.effectiveStatus === 'done' : row.info.effectiveCompleted;
  const dropped = row.kind === 'project' ? row.info.effectiveStatus === 'dropped' : row.info.effectiveDropped;
  const flat = row.kind === 'task' && !!row.flat;
  const dim =
    !done && !dropped && (row.kind === 'project' ? row.info.effectiveStatus !== 'active' || row.info.deferred : row.info.isGroup && !flat ? row.info.blocked || row.info.deferred : !row.info.available);
  const isGroup = row.kind === 'task' && row.info.isGroup && !flat;
  const due = row.kind === 'project' ? row.project.dueDate : row.info.effectiveDueDate;
  const defer = row.kind === 'project' ? row.project.deferDate : row.info.effectiveDeferDate;
  const planned = row.kind === 'project' ? row.project.plannedDate : row.info.effectivePlannedDate;
  const flagged = row.kind === 'project' ? row.project.flagged : row.info.effectiveFlagged;
  const project = row.kind === 'task' ? row.info.project : null;
  const showProject = row.kind === 'task' && row.showProject && !!project;
  const tagNames = item.tagIds.map((id) => snap.tags[id]?.name).filter(Boolean) as string[];
  const noteOpen = noteExpanded || editField === 'note';
  const dueCls = info.dueState === 'overdue' ? ' overdue' : info.dueState === 'dueSoon' ? ' duesoon' : '';
  const now = snap.now;

  const setDates = (patch: { due?: number | null; defer?: number | null }) =>
    void api.setItemDates(row.id, 'defer' in patch ? patch.defer! : item.deferDate, item.plannedDate, 'due' in patch ? patch.due! : item.dueDate);
  const showDetails = (selected && !isProject) || showProject || tagNames.length > 0 || due !== null || (defer !== null && info.deferred) || planned !== null || item.repetition || item.estimatedMinutes;

  const dateDet = (label: string, value: number | null, field: 'due' | 'defer', cls = '') => {
    if (editField === field)
      return (
        <span className="det" key={field}>
          <DateInput
            value={value}
            compact
            autoFocus
            className="field-edit"
            defaultHour={field === 'due' ? snap.settings.defaultDueHour : snap.settings.defaultDeferHour}
            onChange={(v) => setDates(field === 'due' ? { due: v } : { defer: v })}
            onDone={() => setEditField(null)}
          />
        </span>
      );
    if (value === null && (!selected || isProject)) return null;
    return (
      <span
        key={field}
        className={'det' + cls + (value === null ? ' placeholder' : '')}
        onClick={(e) => {
          e.stopPropagation();
          setEditField(field);
        }}
      >
        {field === 'due' ? <CalendarDueIcon /> : <CalendarIcon />}
        {value === null ? label : `${label}: ${relativeDateLabel(value, now)}${timeLabel(value) ? ' ' + timeLabel(value) : ''}`}
      </span>
    );
  };

  return (
    <div
      className={'row' + (isProject ? ' project' : '') + (isGroup ? ' group' : '') + (selected ? ' selected' : '') + (done ? ' done' : '') + (dim ? ' dim' : '') + (dropInto ? ' drop-into' : '') + (selected && editField ? ' editing' : '')}
      style={{ paddingLeft: 12 }}
      data-row-id={row.id}
      draggable={!editField}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onMouseDown={onSelect}
      onContextMenu={onContextMenu}
    >
      <button
        className={'disclosure' + (hasKids && !flat ? ' has' : '') + (collapsed ? '' : ' open')}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          toggleCollapsed();
        }}
      >
        <ChevronRight />
      </button>
      <div className="row-inner">
        {indent > 0 && <span className="indent" style={{ width: indent }} />}
        <StatusCircle row={row} />
        <div className="body">
          <NameField
            id={row.id}
            value={item.name}
            placeholder={isProject ? 'Untitled Project' : 'Untitled Item'}
            onCommit={(v) => void api.rename(row.id, v)}
            onEnter={() => void newItemInContext()}
            onTab={() => setEditField(isProject ? 'due' : 'project')}
          />
          {showDetails && (
            <div className="details">
              {row.kind === 'task' &&
                (editField === 'project' ? (
                  <span className="det">
                    <ProjectPicker
                      className="field-edit"
                      value={project?.id ?? null}
                      autoFocus
                      onChange={(pid) => {
                        void api.moveTasks([row.id], pid, null);
                        setEditField('tags');
                      }}
                      onClose={() => setEditField((f) => (f === 'project' ? null : f) as Field)}
                    />
                  </span>
                ) : (
                  (showProject || selected) && (
                    <span
                      className={'det' + (project ? '' : ' placeholder')}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditField('project');
                      }}
                    >
                      <ProjectSmallIcon />
                      {project ? project.name || 'Untitled Project' : row.task.parentId && snap.tasks[row.task.parentId] ? snap.tasks[row.task.parentId].name : 'Project'}
                    </span>
                  )
                ))}
              {editField === 'tags' ? (
                <span className="det">
                  <TagPicker inline tagIds={item.tagIds} autoFocus onChange={(ids) => void api.setItemTags(row.id, ids)} onClose={() => setEditField(null)} />
                </span>
              ) : (
                (tagNames.length > 0 || (selected && !isProject)) && (
                  <span
                    className={'det' + (tagNames.length ? '' : ' placeholder')}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditField('tags');
                    }}
                  >
                    <TagOutlineIcon />
                    {tagNames.length ? tagNames.join(', ') : 'Tags'}
                  </span>
                )
              )}
              {dateDet('Due', due, 'due', dueCls)}
              {(defer !== null || editField === 'defer') && dateDet('Defer', defer, 'defer', '')}
              {planned !== null && (
                <span className="det">
                  <CalendarIcon />
                  Planned: {relativeDateLabel(planned, now)}
                </span>
              )}
              {item.repetition && (
                <span className="det">
                  <RepeatIcon />
                  {describeRule(item.repetition)}
                </span>
              )}
              {item.estimatedMinutes ? (
                <span className="det">
                  <ClockIcon />
                  {item.estimatedMinutes}m
                </span>
              ) : null}
            </div>
          )}
          {noteOpen ? (
            <textarea
              className="note-edit"
              autoFocus={editField === 'note'}
              placeholder="Add Note"
              defaultValue={item.note}
              rows={Math.max(2, item.note.split('\n').length + 1)}
              onMouseDown={(e) => e.stopPropagation()}
              onBlur={(e) => {
                if (e.target.value !== item.note) void api.setNote(row.id, e.target.value);
                if (!e.target.value) store.setUi((ui) => ({ noteExpanded: { ...ui.noteExpanded, [row.id]: false } }));
                setEditField(null);
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Escape') (e.target as HTMLTextAreaElement).blur();
              }}
            />
          ) : selected && !isProject && !item.note ? (
            <div
              className="details"
              onClick={(e) => {
                e.stopPropagation();
                setEditField('note');
              }}
            >
              <span className="det placeholder">Add Note</span>
            </div>
          ) : null}
        </div>
        <div className="trail">
          <button
            className={'note-ind' + (item.note ? '' : ' empty')}
            title={item.note ? 'Show/Hide Note' : 'Add Note'}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              if (item.note) store.setUi((ui) => ({ noteExpanded: { ...ui.noteExpanded, [row.id]: !ui.noteExpanded[row.id] } }));
              else {
                store.select([row.id]);
                setEditField('note');
              }
            }}
          >
            {item.note ? <NoteIcon /> : <NoteOutlineIcon />}
          </button>
          <button
            className={flagged ? 'on' : ''}
            title="Flag"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              void api.toggleFlag([row.id]);
            }}
          >
            {flagged ? <FlagOutlineIcon style={{ fill: 'currentColor' }} /> : <FlagOutlineIcon />}
          </button>
        </div>
      </div>
    </div>
  );
});

/* ---------------- Content (header + outline) ---------------- */
export function Content() {
  const snap = useSnapshot();
  const ui = useUi();
  const rows = snap?.content.rows ?? [];
  const sel = ui.selection;
  const p = snap?.perspective ?? 'inbox';
  const listRef = useRef<HTMLDivElement>(null);
  const [editField, setEditFieldRaw] = useState<{ id: ID; field: Field } | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{ index: number; pos: 'before' | 'after' | 'into'; id: ID } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; id: ID } | null>(null);
  const anchorRef = useRef<ID | null>(null);

  useEffect(() => {
    setEditFieldRaw(null);
  }, [p]);

  /** ids that have at least one child task (projects / groups) */
  const parentsWithKids = useMemo(() => {
    const s = new Set<ID>();
    if (snap) for (const t of Object.values(snap.tasks)) if (t.parentId) s.add(t.parentId);
    return s;
  }, [snap?.tasks]);

  const selectableIds = useMemo(() => rows.filter((r) => r.kind !== 'header' && r.kind !== 'event').map((r) => r.id), [rows]);

  const select = useCallback(
    (id: ID, e: React.MouseEvent | { metaKey?: boolean; shiftKey?: boolean }) => {
      if (e.metaKey) store.select(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
      else if (e.shiftKey && anchorRef.current) {
        const a = selectableIds.indexOf(anchorRef.current);
        const b = selectableIds.indexOf(id);
        if (a >= 0 && b >= 0) store.select(selectableIds.slice(Math.min(a, b), Math.max(a, b) + 1));
        else store.select([id]);
        return;
      } else if (!(sel.length === 1 && sel[0] === id)) store.select([id]);
      anchorRef.current = id;
    },
    [sel, selectableIds],
  );

  // App-level commands: edit a row's name, move selection among siblings
  useEffect(() => {
    const onEdit = (e: Event) => {
      const id = (e as CustomEvent<ID>).detail;
      store.select([id]);
      requestNameFocus(id);
    };
    const onMove = (e: Event) => {
      const delta = (e as CustomEvent<number>).detail;
      const s = store.snapshot;
      const ids = store.ui.selection;
      if (!s || !ids.length) return;
      const id = ids[0];
      const sibs = siblingsOf(s, id).filter((x) => !ids.includes(x) || x === id);
      const i = sibs.indexOf(id);
      if (i < 0) return;
      const target = delta < 0 ? i - 1 : i + 1;
      if (target < 0 || target >= sibs.length) return;
      if (s.tasks[id]) {
        const parent = s.tasks[id].parentId;
        // after = the sibling now at `target` (moving down) or the one before it (moving up)
        const after = delta > 0 ? sibs[target] : target - 1 >= 0 ? sibs[target - 1] : null;
        if (after === null) void moveTasksFirst(s, ids.filter((x) => s.tasks[x]), parent);
        else void store.api.moveTasks(ids.filter((x) => s.tasks[x]), parent, after);
      } else if (s.projects[id]) {
        const folder = s.projects[id].folderId;
        const after = delta > 0 ? sibs[target] : target - 1 >= 0 ? sibs[target - 1] : '';
        void store.api.moveProject(id, folder, after);
      }
    };
    window.addEventListener('focus:edit-name', onEdit);
    window.addEventListener('focus:move', onMove);
    return () => {
      window.removeEventListener('focus:edit-name', onEdit);
      window.removeEventListener('focus:move', onMove);
    };
  }, []);

  if (!snap) return <div className="content" />;
  const api = store.api;

  // keyboard navigation within the outline
  const onKeyDown = (e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    const editable = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable;
    if (editable && !((e.key === 'ArrowUp' || e.key === 'ArrowDown') && (e.target as HTMLElement).isContentEditable)) return;
    if (editable) {
      (e.target as HTMLElement).blur();
      listRef.current?.focus({ preventScroll: true });
    }
    const last = sel[sel.length - 1];
    const idx = last ? selectableIds.indexOf(last) : -1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = e.key === 'ArrowDown' ? Math.min(idx + 1, selectableIds.length - 1) : Math.max(idx - 1, 0);
      const id = selectableIds[next];
      if (!id) return;
      if (e.shiftKey) store.select(sel.includes(id) ? sel : [...sel, id]);
      else {
        store.select([id]);
        anchorRef.current = id;
      }
      document.querySelector(`[data-row-id="${id}"]`)?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === ' ') {
      e.preventDefault();
      if (sel.length) void api.toggleComplete(sel);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (sel.length === 1 && !e.metaKey) requestNameFocus(sel[0]);
      else void newItemInContext();
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      if (sel.length) void api.deleteItems(sel);
    } else if (e.key === 'Escape') {
      store.select([]);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      if (!last) return;
      e.preventDefault();
      const row = rows.find((r) => r.kind !== 'header' && r.kind !== 'event' && r.id === last);
      if (row) void api.setCollapsed(row.key, e.key === 'ArrowLeft');
    } else if (e.key === 'Tab' && last) {
      e.preventDefault();
      setEditFieldRaw({ id: last, field: snap.tasks[last] ? 'project' : 'due' });
    }
  };

  // drag & drop
  const onDragStart = (row: Row) => (e: React.DragEvent) => {
    if (row.kind === 'header' || !snap.tasks[row.id]) {
      e.preventDefault();
      return;
    }
    const ids = sel.includes(row.id) ? sel.filter((x) => snap.tasks[x]) : [row.id];
    e.dataTransfer.setData(DRAG_TYPE, ids.join(','));
    e.dataTransfer.setData('text/plain', ids.map((id) => snap.tasks[id]?.name ?? '').join('\n'));
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOver = (row: Row, index: number) => (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - r.top;
    let pos: 'before' | 'after' | 'into';
    const canInto = row.kind === 'project' || row.kind === 'task';
    if (y < r.height * 0.3) pos = 'before';
    else if (y > r.height * 0.7 || !canInto) pos = 'after';
    else pos = 'into';
    if (row.kind === 'header') pos = 'into';
    if (row.kind === 'event') return;
    setDropIndicator({ index, pos, id: row.id });
  };
  const onDrop = (row: Row) => (e: React.DragEvent) => {
    e.preventDefault();
    const ind = dropIndicator;
    setDropIndicator(null);
    const ids = e.dataTransfer.getData(DRAG_TYPE)?.split(',').filter(Boolean);
    if (!ids?.length || !ind) return;
    if (row.kind === 'header') {
      if (row.id === '__inbox') void api.moveTasks(ids, null, null);
      else if (row.id.startsWith('tag:')) {
        const tid = row.id.slice(4);
        if (snap.tags[tid]) void api.addTagToItems(ids, tid);
      } else if (row.id.startsWith('fg:') && snap.tags[row.id.slice(3)]) {
        void api.addTagToItems(ids, row.id.slice(3));
      } else if (row.dayKey && row.dayKey !== 'past' && row.dayKey !== 'future') {
        void setDue(snap, ids, atHour(new Date(row.dayKey + 'T00:00:00').getTime(), snap.settings.defaultDueHour));
      }
      return;
    }
    if (row.kind === 'folder' || row.kind === 'event') return;
    if (ind.pos === 'into') {
      void api.moveTasks(ids, row.id, null).then(() => api.setCollapsed(row.key, false));
      return;
    }
    if (row.kind === 'project') {
      if (ind.pos === 'after') void api.moveTasks(ids, row.id, null);
      return;
    }
    const t = row.task;
    if (ind.pos === 'after') void api.moveTasks(ids, t.parentId, t.id);
    else {
      const sibs = siblingsOf(snap, t.id);
      const i = sibs.indexOf(t.id);
      const prev = sibs.slice(0, i).reverse().find((s) => !ids.includes(s));
      if (prev) void api.moveTasks(ids, t.parentId, prev);
      else void moveTasksFirst(snap, ids, t.parentId);
    }
  };

  // context menu
  const ctxItems = (): MenuItem[] => {
    if (!ctxMenu) return [];
    const ids = sel.includes(ctxMenu.id) ? sel : [ctxMenu.id];
    const t = snap.tasks[ctxMenu.id];
    const pr = snap.projects[ctxMenu.id];
    const today = atHour(Date.now(), snap.settings.defaultDueHour);
    const items: MenuItem[] = [
      { label: t?.completedAt || pr?.status === 'done' ? 'Mark Incomplete' : 'Complete', sub: 'Space', onSelect: () => void api.toggleComplete(ids) },
      { label: 'Drop', onSelect: () => void api.dropItems(ids) },
      { label: (t ?? pr)?.flagged ? 'Unflag' : 'Flag', sub: '⇧⌘L', onSelect: () => void api.toggleFlag(ids) },
      { separator: true, label: '' },
      { label: 'Due Today', onSelect: () => void setDue(snap, ids, today) },
      { label: 'Due Tomorrow', onSelect: () => void setDue(snap, ids, today + 86400000) },
      { label: 'Clear Due Date', onSelect: () => void setDue(snap, ids, null) },
      { separator: true, label: '' },
    ];
    if (t) {
      items.push({ label: 'Move to Inbox', disabled: t.parentId === null, onSelect: () => void api.moveTasks(ids, null, null) });
      items.push({
        label: 'Convert to Project',
        onSelect: () =>
          void (async () => {
            const pid = await api.addProject(t.name, null);
            await api.setNote(pid, t.note);
            if (t.flagged) await api.toggleFlag([pid]);
            if (t.tagIds.length) await api.setItemTags(pid, t.tagIds);
            if (t.deferDate || t.dueDate || t.plannedDate) await api.setItemDates(pid, t.deferDate, t.plannedDate, t.dueDate);
            const kids = Object.values(snap.tasks).filter((k) => k.parentId === t.id).sort((a, b) => a.rank - b.rank).map((k) => k.id);
            if (kids.length) await api.moveTasks(kids, pid, null);
            await api.deleteItems([t.id]);
            store.select([pid]);
          })(),
      });
      items.push({
        label: 'Show in Projects',
        disabled: !t.parentId,
        onSelect: () =>
          void (async () => {
            const proj = projectOf(snap, t.id);
            if (!proj) return;
            await store.goToPerspective('projects');
            await api.setSidebarSelection([proj]);
            store.select([t.id]);
          })(),
      });
      items.push({ separator: true, label: '' });
    }
    if (pr) {
      items.push({ label: 'Mark Reviewed', onSelect: () => void api.markReviewed(ids) });
      items.push({ label: pr.status === 'onHold' ? 'Make Active' : 'Put On Hold', onSelect: () => void api.setProjectStatus(pr.id, pr.status === 'onHold' ? 'active' : 'onHold') });
      items.push({ separator: true, label: '' });
    }
    items.push({ label: 'Delete', sub: '⌫', onSelect: () => void api.deleteItems(ids) });
    return items;
  };

  const EmptyArt = { inbox: EmptyInboxArt, projects: EmptyProjectsArt, tags: EmptyTagsArt, forecast: EmptyForecastArt, flagged: EmptyFlagArt, nearby: EmptyNearbyArt, review: EmptyReviewArt }[p];
  const setEditField = (id: ID) => (f: Field | ((f: Field) => Field)) =>
    setEditFieldRaw((cur) => {
      const next = typeof f === 'function' ? f(cur?.id === id ? cur.field : null) : f;
      return next ? { id, field: next } : null;
    });

  return (
    <div className="content">
      <Header snap={snap} />
      {p === 'forecast' && <ForecastStrip snap={snap} />}
      {rows.length === 0 ? (
        <div className="empty" onClick={() => store.select([])}>
          <EmptyArt />
          {(ui.search || p !== 'inbox') && <div className="msg">{ui.search ? 'No matching items' : snap.content.emptyMessage}</div>}
        </div>
      ) : (
        <div
          ref={listRef}
          className="outline"
          tabIndex={0}
          onKeyDown={onKeyDown}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) store.select([]);
          }}
          onDragLeave={(e) => {
            if (e.currentTarget === e.target) setDropIndicator(null);
          }}
        >
          {rows.map((row, i) => (
            <React.Fragment key={row.key}>
              {dropIndicator && dropIndicator.index === i && dropIndicator.pos === 'before' && <div className="drop-line" style={{ marginLeft: row.depth * 27 }} />}
              <RowView
                row={row}
                snap={snap}
                selected={row.kind !== 'header' && row.kind !== 'event' && sel.includes(row.id)}
                hasKids={row.kind === 'task' ? row.info.hasChildren : parentsWithKids.has(row.id)}
                noteExpanded={row.kind !== 'header' && row.kind !== 'event' && !!ui.noteExpanded[row.id]}
                onSelect={(e) => {
                  if (row.kind === 'header' || row.kind === 'event') return;
                  if (e.button === 2) {
                    if (!sel.includes(row.id)) store.select([row.id]);
                    return;
                  }
                  select(row.id, e);
                  const t = e.target as HTMLElement;
                  if (!t.isContentEditable && t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA') listRef.current?.focus({ preventScroll: true });
                }}
                onDragStart={onDragStart(row)}
                onDragOver={onDragOver(row, i)}
                onDrop={onDrop(row)}
                dropInto={dropIndicator?.id === row.id && dropIndicator.pos === 'into'}
                onContextMenu={(e) => {
                  if (row.kind === 'header' || row.kind === 'event') return;
                  e.preventDefault();
                  setCtxMenu({ x: e.clientX, y: e.clientY, id: row.id });
                }}
                editField={editField?.id === row.id ? editField.field : null}
                setEditField={setEditField(row.id)}
              />
              {dropIndicator && dropIndicator.index === i && dropIndicator.pos === 'after' && <div className="drop-line" style={{ marginLeft: row.depth * 27 }} />}
            </React.Fragment>
          ))}
        </div>
      )}
      {ctxMenu && <CtxMenuAt x={ctxMenu.x} y={ctxMenu.y} items={ctxItems()} onClose={() => setCtxMenu(null)} />}
    </div>
  );
}

/** Move tasks to the first position under `parent` (`after: ''` = first sibling). */
async function moveTasksFirst(_snap: Snapshot, ids: ID[], parent: ID | null) {
  await store.api.moveTasks(ids, parent, '');
}

function CtxMenuAt({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <span ref={setAnchor} style={{ position: 'fixed', left: x, top: y - 6, width: 1, height: 1 }} />
      {anchor && <Menu anchor={anchor} onClose={onClose} items={items} />}
    </>
  );
}

function Header({ snap }: { snap: Snapshot }) {
  const api = store.api;
  const p = snap.perspective;
  const model = snap.content;
  const sbSel = snap.sidebar.selection;
  const nProjects = sbSel.filter((id) => snap.projects[id]).length;
  const nFolders = sbSel.filter((id) => snap.folders[id]).length;
  const nTags = sbSel.filter((id) => snap.tags[id] || id === '__untagged').length;
  let selLabel = '';
  if (p !== 'review') {
    if (nTags) selLabel = `${nTags} tag${nTags > 1 ? 's' : ''} selected`;
    else if (nProjects && !nFolders) selLabel = `${nProjects} project${nProjects > 1 ? 's' : ''} selected`;
    else if (nFolders && !nProjects) selLabel = `${nFolders} folder${nFolders > 1 ? 's' : ''} selected`;
    else if (nProjects + nFolders) selLabel = `${nProjects + nFolders} items selected`;
  }

  let subtitle: React.ReactNode = model.subtitle;
  let right: React.ReactNode = null;
  if (p === 'review') {
    const list = snap.sidebar.rows.filter((r) => r.kind === 'reviewProject' && r.id).map((r) => r.id as ID);
    const cur = model.rows.find((r): r is ProjectRow => r.kind === 'project' && r.depth === 0);
    const proj = cur ? snap.projects[cur.id] : null;
    const idx = proj ? list.indexOf(proj.id) : -1;
    if (proj && model.reviewIndex !== null) {
      const iv = proj.reviewInterval;
      subtitle = (
        <>
          Project {model.reviewIndex} of {model.reviewTotal} • <a href="#" onClick={(e) => { e.preventDefault(); store.setUi({ inspectorVisible: true }); }}>Review every {iv.steps === 1 ? iv.unit : `${iv.steps} ${iv.unit}s`}</a> •{' '}
          {proj.lastReviewedAt ? `Last reviewed ${shortNumericDate(proj.lastReviewedAt)}` : 'Never reviewed'}
        </>
      );
      const go = async (delta: number) => {
        const n = list[idx + delta];
        if (n) {
          store.select([]);
          await api.setSidebarSelection([n]);
        }
      };
      right = (
        <>
          <button className="btn-plain" disabled={idx <= 0} onClick={() => void go(-1)} title="Previous project">
            <ChevronUp />
          </button>
          <button className="btn-plain" disabled={idx < 0 || idx >= list.length - 1} onClick={() => void go(1)} title="Next project">
            <ChevronDown />
          </button>
          <button
            className="btn-primary"
            onClick={() =>
              void (async () => {
                await api.markReviewed([proj.id]);
                const n = list[idx + 1] ?? list[0];
                if (n && n !== proj.id) {
                  store.select([]);
                  await api.setSidebarSelection([n]);
                }
              })()
            }
          >
            Mark Reviewed
          </button>
        </>
      );
    }
  }
  return (
    <div className="content-header">
      <div>
        <div className="title" style={{ color: PERSPECTIVE_COLOR[p] }}>
          {model.title}
        </div>
        {subtitle && <div className="subtitle">{subtitle}</div>}
      </div>
      <div className="right">
        {right}
        {selLabel && (
          <span className="sel">
            <SidebarIcon style={{ width: 14, height: 14 }} />
            {selLabel}
            <button onClick={() => void api.setSidebarSelection([])} title="Show all">
              <CloseIcon />
            </button>
          </span>
        )}
      </div>
    </div>
  );
}

function ForecastStrip({ snap }: { snap: Snapshot }) {
  const days = snap.sidebar.forecast?.days ?? [];
  const sel = snap.sidebar.forecastSelectedDay;
  return (
    <div className="forecast-strip">
      {days.map((day) => (
        <div
          key={day.key}
          className={'fs-day' + (day.isToday ? ' today' : '') + (sel === day.key ? ' on' : '')}
          onClick={() => {
            store.select([]);
            void store.api.setForecastSelectedDay(sel === day.key ? null : day.key);
          }}
        >
          <div>{day.short}</div>
          <div className={'n' + (day.count ? ' has' : '') + (day.key === 'past' && day.count ? ' overdue' : '')}>{day.count}</div>
        </div>
      ))}
    </div>
  );
}
