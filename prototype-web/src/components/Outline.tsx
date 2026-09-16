import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { store, useDB, useDerived } from '../model/store';
import { buildContent, forecastBuckets, reviewProjects, Row } from '../model/rows';
import { ID, ItemPatch } from '../model/types';
import { relativeDateLabel, shortNumericDate, timeLabel, parseNaturalDate, fullDateLabel } from '../model/dates';
import { describeRule } from '../model/repeat';
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

export const DRAG_TYPE = 'text/hf-task-ids';

/** id whose name field should receive focus once rendered */
let pendingFocus: ID | null = null;
export function requestNameFocus(id: ID) {
  pendingFocus = id;
}

/** Create a new item appropriate to the current perspective / selection (⌘N). */
export function newItemInContext(): ID | null {
  const db = store.db;
  const p = db.ui.perspective;
  const sel = db.ui.selection;
  const selId = sel[sel.length - 1];
  let id: ID | null = null;
  if (selId && db.tasks[selId]) {
    const t = db.tasks[selId];
    // new sibling after the selection (or child if group is expanded)
    id = store.addTask({ name: '', parentId: t.parentId, tagIds: p === 'tags' ? t.tagIds : [], dueDate: p === 'forecast' ? t.dueDate : null, flagged: p === 'flagged' }, { after: t.id });
  } else if (selId && db.projects[selId]) {
    id = store.addTask({ name: '', parentId: selId });
  } else {
    switch (p) {
      case 'inbox':
        id = store.addTask({ name: '' });
        break;
      case 'projects': {
        const sb = db.ui.sidebarSelection.projects ?? [];
        const proj = sb.find((x) => db.projects[x]) ?? db.ui.focusIds.find((x) => db.projects[x]);
        if (proj) id = store.addTask({ name: '', parentId: proj });
        else {
          const folder = sb.find((x) => db.folders[x]) ?? null;
          id = store.addProject({ name: '', folderId: folder });
          store.ui({ sidebarSelection: { ...db.ui.sidebarSelection, projects: [] } });
        }
        break;
      }
      case 'tags': {
        const sb = (db.ui.sidebarSelection.tags ?? []).filter((x) => db.tags[x]);
        id = store.addTask({ name: '', tagIds: sb });
        break;
      }
      case 'forecast': {
        const sd = db.ui.forecastSelectedDay;
        const base = sd && sd !== 'past' && sd !== 'future' ? new Date(sd).getTime() : Date.now();
        const due = new Date(base);
        due.setHours(db.settings.defaultDueHour, 0, 0, 0);
        id = store.addTask({ name: '', dueDate: due.getTime() });
        break;
      }
      case 'flagged':
        id = store.addTask({ name: '', flagged: true });
        break;
      case 'review': {
        const list = reviewProjects(db, store.derived, db.viewOptions.review);
        const proj = (db.ui.sidebarSelection.review ?? [])[0] ?? list[0]?.project.id;
        id = proj ? store.addTask({ name: '', parentId: proj }) : store.addTask({ name: '' });
        break;
      }
      default:
        id = store.addTask({ name: '' });
    }
  }
  if (id) {
    store.ui({ selection: [id] });
    requestNameFocus(id);
  }
  return id;
}

/* ---------------- Status circle ---------------- */
function StatusCircle({ row }: { row: Row }) {
  if (row.type !== 'task' && row.type !== 'project') return <span className="status" />;
  const info = row.info;
  const done = row.type === 'task' ? row.info.effectiveCompleted : row.info.effectiveStatus === 'done';
  const dropped = row.type === 'task' ? row.info.effectiveDropped : row.info.effectiveStatus === 'dropped';
  const flagged = row.type === 'task' ? row.info.effectiveFlagged : row.project.flagged;
  const blocked = row.type === 'task' ? row.info.blocked || row.info.deferred : row.info.blocked || row.info.deferred;
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
        store.toggleComplete([row.id]);
      }}
    >
      <span className={cls.join(' ')}>{done ? <CheckIcon /> : dropped ? <MinusIcon /> : null}</span>
    </button>
  );
}

/* ---------------- Editable name ---------------- */
function NameField({ id, value, onCommit, onEnter, onTab, placeholder, className }: { id: ID; value: string; onCommit: (v: string) => void; onEnter: () => void; onTab: () => void; placeholder?: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current && ref.current.textContent !== value && document.activeElement !== ref.current) ref.current.textContent = value;
  }, [value]);
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
  selected: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  dropInto: boolean;
  onContextMenu: (e: React.MouseEvent) => void;
  editField: Field;
  setEditField: (f: Field | ((f: Field) => Field)) => void;
}

const RowView = React.memo(function RowView({ row, selected, onSelect, onDragStart, onDragOver, onDrop, dropInto, onContextMenu, editField, setEditField }: RowProps) {
  const db = useDB();
  const d = useDerived();
  const indent = row.depth * 24;
  const collapsed = !!db.ui.collapsedInContent[row.id];

  if (row.type === 'header') {
    const hasKids = true;
    return (
      <div className={'row header' + (row.dayKey ? ' fday' : '')} style={{ paddingLeft: 12 + indent }} onDragOver={onDragOver} onDrop={onDrop}>
        <button className={'disclosure' + (hasKids ? ' has' : '') + (collapsed ? '' : ' open')} onClick={() => store.ui({ collapsedInContent: { ...db.ui.collapsedInContent, [row.id]: !collapsed } })}>
          <ChevronRight />
        </button>
        <span className="status" style={{ visibility: 'hidden' }} />
        <span className="name">
          {row.title}
          {row.sub && <span className="count">{row.sub}</span>}
        </span>
      </div>
    );
  }
  if (row.type === 'folder') {
    return (
      <div className={'row header' + (selected ? ' selected' : '')} style={{ paddingLeft: 12 + indent }} onMouseDown={onSelect} onDragOver={onDragOver} onDrop={onDrop}>
        <button className={'disclosure has' + (collapsed ? '' : ' open')} onClick={() => store.ui({ collapsedInContent: { ...db.ui.collapsedInContent, [row.id]: !collapsed } })}>
          <ChevronRight />
        </button>
        <span className="status" style={{ visibility: 'visible', color: '#8a8a90' }}>
          <FolderIcon style={{ width: 16, height: 16 }} />
        </span>
        <span className="name">{row.folder.name || 'Untitled Folder'}</span>
      </div>
    );
  }

  const isProject = row.type === 'project';
  const item = isProject ? row.project : row.task;
  const info = row.info;
  const hasKids = isProject ? (d.childrenOf[row.id]?.length ?? 0) > 0 : row.info.hasChildren;
  const done = isProject ? row.info.effectiveStatus === 'done' : row.info.effectiveCompleted;
  const dropped = isProject ? row.info.effectiveStatus === 'dropped' : row.info.effectiveDropped;
  const flat = !isProject && !!row.flat;
  const dim = !done && !dropped && (isProject ? row.info.effectiveStatus !== 'active' || row.info.deferred : row.info.isGroup && !flat ? row.info.blocked || row.info.deferred : !row.info.available);
  const isGroup = !isProject && row.info.isGroup && !flat;
  const due = isProject ? row.project.dueDate : row.info.effectiveDueDate;
  const defer = isProject ? row.project.deferDate : row.info.effectiveDeferDate;
  const planned = isProject ? row.project.plannedDate : row.info.effectivePlannedDate;
  const flagged = isProject ? row.project.flagged : row.info.effectiveFlagged;
  const project = !isProject ? row.info.project : null;
  const showProject = !isProject && row.showProject && project;
  const tagNames = item.tagIds.map((id) => db.tags[id]?.name).filter(Boolean) as string[];
  const noteOpen = !!db.ui.noteExpanded[row.id] || editField === 'note';
  const dueCls = info.dueState === 'overdue' ? ' overdue' : info.dueState === 'dueSoon' ? ' duesoon' : '';

  const update = (patch: ItemPatch) => store.updateItem(row.id, patch);
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
            defaultHour={field === 'due' ? db.settings.defaultDueHour : db.settings.defaultDeferHour}
            onChange={(v) => update(field === 'due' ? { dueDate: v } : { deferDate: v })}
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
        {value === null ? label : `${label}: ${relativeDateLabel(value, d.now)}${timeLabel(value) ? ' ' + timeLabel(value) : ''}`}
      </span>
    );
  };

  return (
    <div
      className={'row' + (isProject ? ' project' : '') + (isGroup ? ' group' : '') + (selected ? ' selected' : '') + (done ? ' done' : '') + (dim ? ' dim' : '') + (dropInto ? ' drop-into' : '') + (selected && editField ? ' editing' : '')}
      style={{ paddingLeft: 12 + indent }}
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
          store.ui({ collapsedInContent: { ...db.ui.collapsedInContent, [row.id]: !collapsed } });
        }}
      >
        <ChevronRight />
      </button>
      <div className="row-inner">
        <StatusCircle row={row} />
        <div className="body">
          <NameField
            id={row.id}
            value={item.name}
            placeholder={isProject ? 'Untitled Project' : 'Untitled Item'}
            onCommit={(v) => update({ name: v })}
            onEnter={() => newItemInContext()}
            onTab={() => setEditField(isProject ? 'due' : 'project')}
          />
          {showDetails && (
            <div className="details">
              {!isProject && (editField === 'project' ? (
                <span className="det">
                  <ProjectPicker
                    className="field-edit"
                    value={project?.id ?? null}
                    autoFocus
                    onChange={(pid) => {
                      store.moveTasks([row.id], pid);
                      setEditField('tags');
                    }}
                    onClose={() => setEditField((f) => (f === 'project' ? null : f) as Field)}
                  />
                </span>
              ) : (showProject || selected) && (
                <span
                  className={'det' + (project ? '' : ' placeholder')}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditField('project');
                  }}
                >
                  <ProjectSmallIcon />
                  {project ? project.name || 'Untitled Project' : row.task.parentId && db.tasks[row.task.parentId] ? db.tasks[row.task.parentId].name : 'Project'}
                </span>
              ))}
              {editField === 'tags' ? (
                <span className="det">
                  <TagPicker inline tagIds={item.tagIds} autoFocus onChange={(ids) => update({ tagIds: ids })} onClose={() => setEditField(null)} />
                </span>
              ) : (tagNames.length > 0 || (selected && !isProject)) && (
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
              )}
              {dateDet('Due', due, 'due', dueCls)}
              {(defer !== null || editField === 'defer') && dateDet('Defer', defer, 'defer', '')}
              {planned !== null && (
                <span className="det">
                  <CalendarIcon />
                  Planned: {relativeDateLabel(planned, d.now)}
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
                if (e.target.value !== item.note) update({ note: e.target.value });
                if (!e.target.value) store.ui({ noteExpanded: { ...db.ui.noteExpanded, [row.id]: false } });
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
              if (item.note) store.ui({ noteExpanded: { ...db.ui.noteExpanded, [row.id]: !db.ui.noteExpanded[row.id] } });
              else {
                store.ui({ selection: [row.id] });
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
              store.toggleFlag([row.id]);
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
  const db = useDB();
  const d = useDerived();
  const model = useMemo(() => buildContent(db, d), [db, d]);
  const rows = model.rows;
  const sel = db.ui.selection;
  const p = db.ui.perspective;
  const listRef = useRef<HTMLDivElement>(null);
  const [editField, setEditFieldRaw] = useState<{ id: ID; field: Field } | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{ index: number; pos: 'before' | 'after' | 'into'; id: ID } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; id: ID } | null>(null);
  const anchorRef = useRef<ID | null>(null);

  useEffect(() => {
    setEditFieldRaw(null);
  }, [p]);

  const selectableIds = useMemo(() => rows.filter((r) => r.type === 'task' || r.type === 'project' || r.type === 'folder').map((r) => r.id), [rows]);

  const select = useCallback(
    (id: ID, e: React.MouseEvent | { metaKey?: boolean; shiftKey?: boolean }) => {
      if (e.metaKey) store.ui({ selection: sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id] });
      else if (e.shiftKey && anchorRef.current) {
        const a = selectableIds.indexOf(anchorRef.current);
        const b = selectableIds.indexOf(id);
        if (a >= 0 && b >= 0) store.ui({ selection: selectableIds.slice(Math.min(a, b), Math.max(a, b) + 1) });
        else store.ui({ selection: [id] });
        return;
      } else if (!(sel.length === 1 && sel[0] === id)) store.ui({ selection: [id] });
      anchorRef.current = id;
    },
    [sel, selectableIds],
  );

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
      if (e.shiftKey) store.ui({ selection: sel.includes(id) ? sel : [...sel, id] });
      else {
        store.ui({ selection: [id] });
        anchorRef.current = id;
      }
      document.querySelector(`[data-row-id="${id}"]`)?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === ' ') {
      e.preventDefault();
      if (sel.length) store.toggleComplete(sel);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (sel.length === 1 && !e.metaKey) requestNameFocus(sel[0]), store.touch();
      else newItemInContext();
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      if (sel.length) store.deleteItems(sel);
    } else if (e.key === 'Escape') {
      store.ui({ selection: [] });
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      if (!last) return;
      e.preventDefault();
      store.ui({ collapsedInContent: { ...db.ui.collapsedInContent, [last]: e.key === 'ArrowLeft' } });
    } else if (e.key === 'Tab' && last) {
      e.preventDefault();
      setEditFieldRaw({ id: last, field: db.tasks[last] ? 'project' : 'due' });
    }
  };

  // drag & drop
  const onDragStart = (row: Row) => (e: React.DragEvent) => {
    const ids = sel.includes(row.id) ? sel.filter((x) => db.tasks[x]) : [row.id];
    if (!db.tasks[row.id]) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData(DRAG_TYPE, ids.join(','));
    e.dataTransfer.setData('text/plain', ids.map((id) => db.tasks[id]?.name ?? '').join('\n'));
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOver = (row: Row, index: number) => (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - r.top;
    let pos: 'before' | 'after' | 'into';
    const canInto = row.type === 'project' || row.type === 'task' || (row.type === 'header' && row.id === '__inbox');
    if (row.type === 'header' && !canInto) pos = 'after';
    else if (y < r.height * 0.3) pos = 'before';
    else if (y > r.height * 0.7 || !canInto) pos = 'after';
    else pos = 'into';
    if (row.type === 'header') pos = row.id === '__inbox' ? 'into' : 'after';
    setDropIndicator({ index, pos, id: row.id });
  };
  const onDrop = (row: Row) => (e: React.DragEvent) => {
    e.preventDefault();
    const ind = dropIndicator;
    setDropIndicator(null);
    const ids = e.dataTransfer.getData(DRAG_TYPE)?.split(',').filter(Boolean);
    if (!ids?.length || !ind) return;
    if (row.type === 'header') {
      if (row.id === '__inbox') store.moveTasks(ids, null);
      else if (row.id.startsWith('tag:')) {
        const tid = row.id.slice(4);
        if (db.tags[tid]) store.addTagToItems(ids, tid);
      } else if (row.id.startsWith('day:')) {
        const k = row.id.slice(4);
        if (k !== 'past' && k !== 'future') {
          const due = new Date(k).setHours(db.settings.defaultDueHour, 0, 0, 0);
          store.mutate((db2) => ids.forEach((id) => db2.tasks[id] && (db2.tasks[id] = { ...db2.tasks[id], dueDate: due })));
        }
      }
      return;
    }
    if (row.type === 'folder') return;
    if (ind.pos === 'into') {
      store.moveTasks(ids, row.id);
      store.ui({ collapsedInContent: { ...db.ui.collapsedInContent, [row.id]: false } });
      return;
    }
    if (row.type === 'project') {
      if (ind.pos === 'after') store.moveTasks(ids, row.id, null);
      return;
    }
    const t = row.task;
    if (ind.pos === 'after') store.moveTasks(ids, t.parentId, t.id);
    else {
      const sibs = (t.parentId ? d.childrenOf[t.parentId] : d.inbox) ?? [];
      const i = sibs.findIndex((s) => s.id === t.id);
      const prev = sibs.slice(0, i).reverse().find((s) => !ids.includes(s.id));
      if (prev) store.moveTasks(ids, t.parentId, prev.id);
      else {
        store.moveTasks(ids, t.parentId, null);
        store.mutate((db2) => {
          let r = t.rank - ids.length;
          for (const id of ids) if (db2.tasks[id]) db2.tasks[id] = { ...db2.tasks[id], rank: r++ };
        });
      }
    }
  };

  // context menu
  const ctxItems = (): MenuItem[] => {
    if (!ctxMenu) return [];
    const ids = sel.includes(ctxMenu.id) ? sel : [ctxMenu.id];
    const t = db.tasks[ctxMenu.id];
    const pr = db.projects[ctxMenu.id];
    const items: MenuItem[] = [
      { label: t?.completedAt || pr?.status === 'done' ? 'Mark Incomplete' : 'Complete', sub: 'Space', onSelect: () => store.toggleComplete(ids) },
      { label: 'Drop', onSelect: () => store.drop(ids) },
      { label: (t ?? pr)?.flagged ? 'Unflag' : 'Flag', sub: '⇧⌘F', onSelect: () => store.toggleFlag(ids) },
      { separator: true, label: '' },
      { label: 'Due Today', onSelect: () => store.mutate((db2) => ids.forEach((id) => { const due = new Date().setHours(db2.settings.defaultDueHour, 0, 0, 0); if (db2.tasks[id]) db2.tasks[id] = { ...db2.tasks[id], dueDate: due }; if (db2.projects[id]) db2.projects[id] = { ...db2.projects[id], dueDate: due }; })) },
      { label: 'Due Tomorrow', onSelect: () => store.mutate((db2) => ids.forEach((id) => { const due = new Date(Date.now() + 86400000).setHours(db2.settings.defaultDueHour, 0, 0, 0); if (db2.tasks[id]) db2.tasks[id] = { ...db2.tasks[id], dueDate: due }; if (db2.projects[id]) db2.projects[id] = { ...db2.projects[id], dueDate: due }; })) },
      { label: 'Clear Due Date', onSelect: () => store.mutate((db2) => ids.forEach((id) => { if (db2.tasks[id]) db2.tasks[id] = { ...db2.tasks[id], dueDate: null }; if (db2.projects[id]) db2.projects[id] = { ...db2.projects[id], dueDate: null }; })) },
      { separator: true, label: '' },
    ];
    if (t) {
      items.push({ label: 'Move to Inbox', disabled: t.parentId === null, onSelect: () => store.moveTasks(ids, null) });
      items.push({ label: 'Convert to Project', onSelect: () => {
        const pid = store.addProject({ name: t.name, note: t.note, flagged: t.flagged, tagIds: t.tagIds, deferDate: t.deferDate, dueDate: t.dueDate, plannedDate: t.plannedDate });
        const kids = d.childrenOf[t.id] ?? [];
        store.moveTasks(kids.map((k) => k.id), pid);
        store.deleteItems([t.id]);
        store.ui({ selection: [pid] });
      } });
      items.push({ label: 'Show in Projects', disabled: !t.parentId, onSelect: () => {
        const proj = row_projectOf(t.id);
        if (proj) {
          store.ui({ perspective: 'projects', sidebarSelection: { ...db.ui.sidebarSelection, projects: [proj] }, selection: [t.id] });
        }
      } });
      items.push({ separator: true, label: '' });
    }
    if (pr) {
      items.push({ label: 'Mark Reviewed', onSelect: () => store.markReviewed(ids) });
      items.push({ label: pr.status === 'onHold' ? 'Make Active' : 'Put On Hold', onSelect: () => store.updateProject(pr.id, { status: pr.status === 'onHold' ? 'active' : 'onHold' }) });
      items.push({ separator: true, label: '' });
    }
    items.push({ label: 'Delete', sub: '⌫', onSelect: () => store.deleteItems(ids) });
    return items;
  };
  const row_projectOf = (id: ID): ID | null => {
    let cur: ID | null = db.tasks[id]?.parentId ?? null;
    while (cur) {
      if (db.projects[cur]) return cur;
      cur = db.tasks[cur]?.parentId ?? null;
    }
    return null;
  };

  const EmptyArt = { inbox: EmptyInboxArt, projects: EmptyProjectsArt, tags: EmptyTagsArt, forecast: EmptyForecastArt, flagged: EmptyFlagArt, nearby: EmptyNearbyArt, review: EmptyReviewArt }[p];
  const setEditField = (id: ID) => (f: Field | ((f: Field) => Field)) => setEditFieldRaw((cur) => {
    const next = typeof f === 'function' ? f(cur?.id === id ? cur.field : null) : f;
    return next ? { id, field: next } : null;
  });

  return (
    <div className="content">
      <Header model={model} />
      {p === 'forecast' && <ForecastStrip />}
      {rows.length === 0 ? (
        <div className="empty" onClick={() => store.ui({ selection: [] })}>
          <EmptyArt />
          {(db.ui.search || p === 'nearby' || p !== 'inbox') && <div className="msg">{db.ui.search ? 'No matching items' : model.emptyMessage}</div>}
        </div>
      ) : (
        <div
          ref={listRef}
          className="outline"
          tabIndex={0}
          onKeyDown={onKeyDown}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) store.ui({ selection: [] });
          }}
          onDragLeave={(e) => {
            if (e.currentTarget === e.target) setDropIndicator(null);
          }}
        >
          {rows.map((row, i) => (
            <React.Fragment key={row.key}>
              {dropIndicator && dropIndicator.index === i && dropIndicator.pos === 'before' && <div className="drop-line" style={{ marginLeft: row.depth * 24 }} />}
              <RowView
                row={row}
                selected={sel.includes(row.id)}
                onSelect={(e) => {
                  if (e.button === 2) {
                    if (!sel.includes(row.id)) store.ui({ selection: [row.id] });
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
                  e.preventDefault();
                  setCtxMenu({ x: e.clientX, y: e.clientY, id: row.id });
                }}
                editField={editField?.id === row.id ? editField.field : null}
                setEditField={setEditField(row.id)}
              />
              {dropIndicator && dropIndicator.index === i && dropIndicator.pos === 'after' && <div className="drop-line" style={{ marginLeft: row.depth * 24 }} />}
            </React.Fragment>
          ))}
        </div>
      )}
      {ctxMenu && <CtxMenuAt x={ctxMenu.x} y={ctxMenu.y} items={ctxItems()} onClose={() => setCtxMenu(null)} />}
    </div>
  );
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

function Header({ model }: { model: ReturnType<typeof buildContent> }) {
  const db = useDB();
  const d = useDerived();
  const p = db.ui.perspective;
  const sel = db.ui.selection;
  const nProjects = sel.filter((id) => db.projects[id]).length;
  const nTasks = sel.filter((id) => db.tasks[id]).length;
  let selLabel = '';
  if (nProjects && !nTasks) selLabel = `${nProjects} project${nProjects > 1 ? 's' : ''} selected`;
  else if (nTasks && !nProjects) selLabel = `${nTasks} ${nTasks > 1 ? 'items' : 'item'} selected`;
  else if (nTasks || nProjects) selLabel = `${nTasks + nProjects} items selected`;

  let subtitle: React.ReactNode = model.subtitle;
  let right: React.ReactNode = null;
  if (p === 'review') {
    const list = reviewProjects(db, d, db.viewOptions.review);
    const cur = (db.ui.sidebarSelection.review ?? [])[0] ?? list[0]?.project.id;
    const idx = list.findIndex((x) => x.project.id === cur);
    const proj = cur ? db.projects[cur] : null;
    if (proj) {
      const iv = proj.reviewInterval;
      subtitle = (
        <>
          Project {idx + 1} of {list.length} • <a href="#">Review every {iv.steps === 1 ? iv.unit : `${iv.steps} ${iv.unit}s`}</a> • {proj.lastReviewedAt ? `Last reviewed ${shortNumericDate(proj.lastReviewedAt)}` : 'Never reviewed'}
        </>
      );
      const go = (delta: number) => {
        const n = list[idx + delta];
        if (n) store.ui({ sidebarSelection: { ...db.ui.sidebarSelection, review: [n.project.id] }, selection: [] });
      };
      right = (
        <>
          <button className="btn-plain" disabled={idx <= 0} onClick={() => go(-1)} title="Previous project">
            <ChevronUp />
          </button>
          <button className="btn-plain" disabled={idx >= list.length - 1} onClick={() => go(1)} title="Next project">
            <ChevronDown />
          </button>
          <button
            className="btn-primary"
            onClick={() => {
              store.markReviewed([proj.id]);
              const n = list[idx + 1] ?? list[0];
              if (n && n.project.id !== proj.id) store.ui({ sidebarSelection: { ...db.ui.sidebarSelection, review: [n.project.id] }, selection: [] });
            }}
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
        <div className="title" style={{ color: model.color }}>
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
            <button onClick={() => store.ui({ selection: [] })} title="Deselect">
              <CloseIcon />
            </button>
          </span>
        )}
      </div>
    </div>
  );
}

function ForecastStrip() {
  const db = useDB();
  const d = useDerived();
  const { days } = forecastBuckets(db, d, db.viewOptions.forecast);
  const sel = db.ui.forecastSelectedDay;
  return (
    <div className="forecast-strip">
      {days.map((day) => (
        <div key={day.key} className={'fs-day' + (day.isToday ? ' today' : '') + (sel === day.key ? ' on' : '')} onClick={() => store.ui({ forecastSelectedDay: sel === day.key ? null : day.key, selection: [] })}>
          <div>{day.short}</div>
          <div className={'n' + (day.count ? ' has' : '') + (day.key === 'past' && day.count ? ' overdue' : '')}>{day.count}</div>
        </div>
      ))}
    </div>
  );
}

// re-export for other modules
export { parseNaturalDate, fullDateLabel };
