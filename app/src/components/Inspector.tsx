import React, { useEffect, useRef, useState } from 'react';
import { store, useSnapshot, useUi } from '../core/store';
import type { Folder, ID, Project, ProjectInfo, RepetitionRule, Snapshot, Tag, Task, TaskInfo } from '../core/types';
import { addDays, addMonths, addWeeks, formatDuration, fullDateLabel, shortNumericDate } from '../core/format';
import { DateInput, ProjectPicker, TagPicker } from './Fields';
import { CheckCircleIcon, ClearIcon, FlagOutlineIcon, MinusCircleIcon, ParallelIcon, PauseIcon, PlayIcon, SequentialIcon, SingleActionsIcon, TodayIcon } from './Icons';
import '../styles/inspector.css';

/* ---------------- primitives ---------------- */

function TitleField({ value, onCommit, placeholder }: { value: string; onCommit: (v: string) => void; placeholder: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current && document.activeElement !== ref.current && ref.current.textContent !== value) ref.current.textContent = value;
  }, [value]);
  return (
    <div
      ref={ref}
      className="insp-title"
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-placeholder={placeholder}
      onBlur={() => {
        const v = ref.current?.textContent ?? '';
        if (v !== value) onCommit(v);
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          ref.current?.blur();
        }
        if (e.key === 'Escape') {
          if (ref.current) ref.current.textContent = value;
          ref.current?.blur();
        }
      }}
    />
  );
}

function NoteField({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setText(value), [value]);
  // grow with content
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.max(54, el.scrollHeight) + 'px';
  }, [text]);
  return (
    <textarea
      ref={ref}
      className="insp-note"
      placeholder="Note"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text !== value && onCommit(text)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') (e.target as HTMLTextAreaElement).blur();
      }}
    />
  );
}

function Section({ title, value, children }: { title: string; value?: string; children: React.ReactNode }) {
  return (
    <>
      <div className="insp-sep" />
      <div className="insp-sec">
        {title}
        {value && <span className="val">{value}</span>}
      </div>
      {children}
    </>
  );
}

function DateSection({ title, value, onChange, defaultHour, inherited }: { title: string; value: number | null; onChange: (v: number | null) => void; defaultHour: number; inherited?: number | null }) {
  const bump = (fn: (t: number) => number) => {
    const base = value ?? new Date().setHours(defaultHour, 0, 0, 0);
    onChange(fn(base));
  };
  return (
    <Section title={title} value={value === null && inherited ? `${fullDateLabel(inherited)} (inherited)` : undefined}>
      <DateInput value={value} onChange={onChange} defaultHour={defaultHour} />
      <div className="date-quick">
        <button title="Today" onClick={() => onChange(new Date().setHours(defaultHour, 0, 0, 0))}>
          <TodayIcon />
        </button>
        <button onClick={() => bump((t) => addDays(t, 1))}>+1d</button>
        <button onClick={() => bump((t) => addWeeks(t, 1))}>+1w</button>
        <button onClick={() => bump((t) => addMonths(t, 1))}>+1m</button>
        <button title="Clear" onClick={() => onChange(null)}>
          <ClearIcon />
        </button>
      </div>
    </Section>
  );
}

function useRepeatDescription(rule: RepetitionRule | null): string | undefined {
  const [text, setText] = useState<string | undefined>();
  useEffect(() => {
    let alive = true;
    if (!rule) { setText(undefined); return; }
    void store.api.describeRepetition(rule).then((t) => alive && setText(t));
    return () => { alive = false; };
  }, [rule?.every, rule?.unit, rule?.method, rule?.weekdays?.join(',')]);
  return text;
}

function RepeatSection({ rule, onChange }: { rule: RepetitionRule | null; onChange: (r: RepetitionRule | null) => void }) {
  const desc = useRepeatDescription(rule);
  if (!rule)
    return (
      <Section title="Repeat">
        <button className="insp-btn" onClick={() => onChange({ every: 1, unit: 'week', method: 'fixed', weekdays: [] })}>
          Add Repetition
        </button>
      </Section>
    );
  const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  return (
    <Section title="Repeat" value={desc}>
      <div className="insp-row">
        <label>Schedule</label>
        <select value={rule.method} onChange={(e) => onChange({ ...rule, method: e.target.value as RepetitionRule['method'] })}>
          <option value="fixed">Regularly</option>
          <option value="startAfterCompletion">Defer another</option>
          <option value="dueAfterCompletion">Due again</option>
        </select>
      </div>
      <div className="insp-row">
        <label>Every</label>
        <input type="number" min={1} value={rule.every} onChange={(e) => onChange({ ...rule, every: Math.max(1, +e.target.value || 1) })} />
        <select value={rule.unit} onChange={(e) => onChange({ ...rule, unit: e.target.value as RepetitionRule['unit'], weekdays: e.target.value === 'week' ? rule.weekdays : [] })}>
          <option value="minute">Minutes</option>
          <option value="hour">Hours</option>
          <option value="day">Days</option>
          <option value="week">Weeks</option>
          <option value="month">Months</option>
          <option value="year">Years</option>
        </select>
      </div>
      {rule.unit === 'week' && rule.method === 'fixed' && (
        <div className="insp-weekdays">
          {days.map((dname, i) => (
            <button
              key={i}
              className={rule.weekdays.includes(i) ? 'on' : ''}
              onClick={() => {
                const set = new Set(rule.weekdays);
                set.has(i) ? set.delete(i) : set.add(i);
                onChange({ ...rule, weekdays: [...set].sort((a, b) => a - b) });
              }}
            >
              {dname}
            </button>
          ))}
        </div>
      )}
      <button className="insp-btn" style={{ marginTop: 4 }} onClick={() => onChange(null)}>
        Remove Repetition
      </button>
    </Section>
  );
}

function DurationSection({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const [text, setText] = useState(value === null ? '' : formatDuration(value));
  useEffect(() => setText(value === null ? '' : formatDuration(value)), [value]);
  const commit = async () => {
    if (text.trim() === '') { onChange(null); return; }
    const v = await store.api.parseDuration(text);
    if (v !== null) onChange(v);
    else setText(value === null ? '' : formatDuration(value));
  };
  return (
    <Section title="Estimated Duration">
      <div className="datefield">
        <input
          value={text}
          placeholder="None"
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
      </div>
      <div className="date-quick">
        {[5, 15, 30, 60].map((m) => (
          <button key={m} onClick={() => onChange(m)}>
            {m < 60 ? `${m}m` : '1h'}
          </button>
        ))}
        <button title="Clear" onClick={() => onChange(null)}>
          <ClearIcon />
        </button>
      </div>
    </Section>
  );
}

/* ---------------- derived info lookup ---------------- */

function findTaskInfo(snap: Snapshot, id: ID): TaskInfo | null {
  for (const r of snap.content.rows) if (r.kind === 'task' && r.id === id) return r.info;
  return null;
}
function findProjectInfo(snap: Snapshot, id: ID): ProjectInfo | null {
  for (const r of snap.content.rows) if (r.kind === 'project' && r.id === id) return r.info;
  const e = snap.projectList.find((p) => p.project.id === id);
  return e ? e.info : null;
}

/** Row info from the snapshot when visible, else fetched from the core. */
function useTaskInfo(snap: Snapshot, id: ID): TaskInfo | null {
  const visible = findTaskInfo(snap, id);
  const [fetched, setFetched] = useState<TaskInfo | null>(null);
  useEffect(() => {
    if (visible) return;
    let alive = true;
    void store.api.taskInfo(id).then((i) => alive && setFetched(i));
    return () => { alive = false; };
  }, [id, snap.revision, visible]);
  return visible ?? fetched;
}

/* ---------------- inspectors ---------------- */

function TaskInspector({ task, snap }: { task: Task; snap: Snapshot }) {
  const api = store.api;
  const info = useTaskInfo(snap, task.id);
  const id = task.id;
  const dates = (d: Partial<{ defer: number | null; planned: number | null; due: number | null }>) =>
    api.setItemDates(id, d.defer !== undefined ? d.defer : task.deferDate, d.planned !== undefined ? d.planned : task.plannedDate, d.due !== undefined ? d.due : task.dueDate);
  const projectId = info?.project?.id ?? null;
  const parent = task.parentId ? snap.tasks[task.parentId] : undefined;
  const statusLabel = task.completedAt ? 'Completed' : task.droppedAt ? 'Dropped' : info?.available ? 'Available' : info?.deferred ? 'Deferred' : info?.blocked ? 'Blocked' : 'Active';
  const setActive = () => {
    if (task.completedAt) void api.toggleComplete([id]);
    else if (task.droppedAt) void api.dropItems([id]);
  };
  return (
    <>
      <TitleField value={task.name} placeholder="Untitled Item" onCommit={(v) => void api.rename(id, v)} />
      <Section title="Status" value={statusLabel}>
        <div className="seg-row">
          <div className="seg">
            <button className={!task.completedAt && !task.droppedAt ? 'on' : ''} title="Active" onClick={setActive}>
              <PlayIcon />
            </button>
            <button className={task.completedAt ? 'on' : ''} title="Completed" onClick={() => !task.completedAt && void api.toggleComplete([id])}>
              <CheckCircleIcon />
            </button>
            <button className={task.droppedAt ? 'on' : ''} title="Dropped" onClick={() => !task.droppedAt && void api.dropItems([id])}>
              <MinusCircleIcon />
            </button>
          </div>
          <button className={'flag-btn' + (task.flagged ? ' on' : '')} title="Flagged" onClick={() => void api.toggleFlag([id])}>
            <FlagOutlineIcon style={task.flagged ? { fill: 'currentColor' } : undefined} />
          </button>
        </div>
      </Section>
      <Section title="Project">
        <ProjectPicker value={projectId} onChange={(pid) => void api.assignProject([id], pid)} />
        {parent && <div className="insp-meta">Inside group “{parent.name}”</div>}
      </Section>
      {info?.hasChildren && (
        <Section title="Type" value={task.sequential ? 'Sequential' : 'Parallel'}>
          <div className="seg">
            <button className={!task.sequential ? 'on' : ''} onClick={() => void api.setSequential(id, false)} title="Parallel">
              <ParallelIcon />
            </button>
            <button className={task.sequential ? 'on' : ''} onClick={() => void api.setSequential(id, true)} title="Sequential">
              <SequentialIcon />
            </button>
          </div>
          <label className="check">
            <input type="checkbox" checked={task.completedByChildren} onChange={(e) => void api.setCompletedByChildren(id, e.target.checked)} />
            Complete with last action
          </label>
        </Section>
      )}
      <Section title="Tags">
        <TagPicker tagIds={task.tagIds} onChange={(ids) => void api.setItemTags(id, ids)} />
      </Section>
      <DateSection title="Defer" value={task.deferDate} inherited={info?.effectiveDeferDate} onChange={(v) => void dates({ defer: v })} defaultHour={snap.settings.defaultDeferHour} />
      <DateSection title="Planned" value={task.plannedDate} inherited={info?.effectivePlannedDate} onChange={(v) => void dates({ planned: v })} defaultHour={snap.settings.defaultDeferHour} />
      <DateSection title="Due" value={task.dueDate} inherited={info?.effectiveDueDate} onChange={(v) => void dates({ due: v })} defaultHour={snap.settings.defaultDueHour} />
      <RepeatSection rule={task.repetition} onChange={(r) => void api.setRepetition(id, r)} />
      <DurationSection value={task.estimatedMinutes} onChange={(v) => void api.setEstimate(id, v)} />
      <Section title="Note">
        <NoteField value={task.note} onCommit={(v) => void api.setNote(id, v)} />
      </Section>
      <div className="insp-sep" />
      <div className="insp-meta">
        Added {fullDateLabel(task.createdAt)}
        <br />
        Modified {fullDateLabel(task.modifiedAt)}
        {task.completedAt && (
          <>
            <br />
            Completed {fullDateLabel(task.completedAt)}
          </>
        )}
        {task.droppedAt && (
          <>
            <br />
            Dropped {fullDateLabel(task.droppedAt)}
          </>
        )}
      </div>
    </>
  );
}

function ProjectInspector({ project, snap }: { project: Project; snap: Snapshot }) {
  const api = store.api;
  const id = project.id;
  const info = findProjectInfo(snap, id);
  const statusLabel = { active: 'Active', onHold: 'On Hold', done: 'Completed', dropped: 'Dropped' }[project.status];
  const typeLabel = { parallel: 'Parallel', sequential: 'Sequential', singleActions: 'Single Actions' }[project.projectType];
  const iv = project.reviewInterval;
  const dates = (d: Partial<{ defer: number | null; planned: number | null; due: number | null }>) =>
    api.setItemDates(id, d.defer !== undefined ? d.defer : project.deferDate, d.planned !== undefined ? d.planned : project.plannedDate, d.due !== undefined ? d.due : project.dueDate);
  const folders = Object.values(snap.folders).sort((a, b) => a.rank - b.rank);
  return (
    <>
      <TitleField value={project.name} placeholder="Untitled Project" onCommit={(v) => void api.rename(id, v)} />
      <Section title="Status" value={statusLabel}>
        <div className="seg-row">
          <div className="seg">
            <button className={project.status === 'active' ? 'on' : ''} title="Active" onClick={() => void api.setProjectStatus(id, 'active')}>
              <PlayIcon />
            </button>
            <button className={project.status === 'onHold' ? 'on' : ''} title="On Hold" onClick={() => void api.setProjectStatus(id, 'onHold')}>
              <PauseIcon />
            </button>
            <button className={project.status === 'done' ? 'on' : ''} title="Completed" onClick={() => void api.setProjectStatus(id, 'done')}>
              <CheckCircleIcon />
            </button>
            <button className={project.status === 'dropped' ? 'on' : ''} title="Dropped" onClick={() => void api.setProjectStatus(id, 'dropped')}>
              <MinusCircleIcon />
            </button>
          </div>
          <button className={'flag-btn' + (project.flagged ? ' on' : '')} title="Flagged" onClick={() => void api.toggleFlag([id])}>
            <FlagOutlineIcon style={project.flagged ? { fill: 'currentColor' } : undefined} />
          </button>
        </div>
      </Section>
      <Section title="Project Type" value={typeLabel}>
        <div className="seg">
          <button className={project.projectType === 'parallel' ? 'on' : ''} title="Parallel" onClick={() => void api.setProjectType(id, 'parallel')}>
            <ParallelIcon />
          </button>
          <button className={project.projectType === 'sequential' ? 'on' : ''} title="Sequential" onClick={() => void api.setProjectType(id, 'sequential')}>
            <SequentialIcon />
          </button>
          <button className={project.projectType === 'singleActions' ? 'on' : ''} title="Single Actions" onClick={() => void api.setProjectType(id, 'singleActions')}>
            <SingleActionsIcon />
          </button>
        </div>
        <label className="check">
          <input type="checkbox" checked={project.completedByChildren} onChange={(e) => void api.setCompletedByChildren(id, e.target.checked)} />
          Complete with last action
        </label>
      </Section>
      {folders.length > 0 && (
        <Section title="Folder">
          <div className="insp-row">
            <select style={{ flex: 1 }} value={project.folderId ?? ''} onChange={(e) => void api.moveProject(id, e.target.value || null, null)}>
              <option value="">None</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name || 'Untitled Folder'}
                </option>
              ))}
            </select>
          </div>
        </Section>
      )}
      <Section title="Tags">
        <TagPicker tagIds={project.tagIds} onChange={(ids) => void api.setItemTags(id, ids)} />
      </Section>
      <DateSection title="Defer" value={project.deferDate} onChange={(v) => void dates({ defer: v })} defaultHour={snap.settings.defaultDeferHour} />
      <DateSection title="Planned" value={project.plannedDate} onChange={(v) => void dates({ planned: v })} defaultHour={snap.settings.defaultDeferHour} />
      <DateSection title="Due" value={project.dueDate} onChange={(v) => void dates({ due: v })} defaultHour={snap.settings.defaultDueHour} />
      <RepeatSection rule={project.repetition} onChange={(r) => void api.setRepetition(id, r)} />
      <Section title="Review" value={project.nextReviewAt ? `Next ${shortNumericDate(project.nextReviewAt)}` : undefined}>
        <div className="insp-row">
          <label>Every</label>
          <input type="number" min={1} value={iv.steps} onChange={(e) => void api.setReviewInterval(id, { ...iv, steps: Math.max(1, +e.target.value || 1) })} />
          <select value={iv.unit} onChange={(e) => void api.setReviewInterval(id, { ...iv, unit: e.target.value as typeof iv.unit })}>
            <option value="day">Days</option>
            <option value="week">Weeks</option>
            <option value="month">Months</option>
            <option value="year">Years</option>
          </select>
        </div>
        <div className="insp-row">
          <label>Next review</label>
          <div className="datefield readonly">
            <input readOnly value={project.nextReviewAt ? fullDateLabel(project.nextReviewAt) : ''} placeholder="None" />
          </div>
        </div>
        <div className="insp-meta">{project.lastReviewedAt ? `Last reviewed ${shortNumericDate(project.lastReviewedAt)}` : 'Never reviewed'}</div>
        <button className="insp-btn" style={{ marginTop: 6 }} onClick={() => void api.markReviewed([id])}>
          Mark Reviewed
        </button>
      </Section>
      <DurationSection value={project.estimatedMinutes} onChange={(v) => void api.setEstimate(id, v)} />
      <Section title="Note">
        <NoteField value={project.note} onCommit={(v) => void api.setNote(id, v)} />
      </Section>
      <div className="insp-sep" />
      <div className="insp-meta">
        {info?.remainingCount ?? 0} remaining, {info?.availableCount ?? 0} available
        <br />
        Added {fullDateLabel(project.createdAt)}
        <br />
        Modified {fullDateLabel(project.modifiedAt)}
      </div>
    </>
  );
}

function TagInspector({ tag, snap }: { tag: Tag; snap: Snapshot }) {
  const api = store.api;
  const id = tag.id;
  // per-tag counts are only carried by the Tags sidebar rows
  const row = snap.sidebar.perspective === 'tags' ? snap.sidebar.rows.find((r) => r.id === id) : undefined;
  return (
    <>
      <TitleField value={tag.name} placeholder="Untitled Tag" onCommit={(v) => void api.rename(id, v)} />
      <NoteField value={tag.note} onCommit={(v) => void api.setNote(id, v)} />
      <Section title="Status" value={{ active: 'Active', onHold: 'On Hold', dropped: 'Dropped' }[tag.status]}>
        <div className="seg">
          <button className={tag.status === 'active' ? 'on' : ''} title="Active" onClick={() => void api.setTagStatus(id, 'active')}>
            <PlayIcon />
          </button>
          <button className={tag.status === 'onHold' ? 'on' : ''} title="On Hold" onClick={() => void api.setTagStatus(id, 'onHold')}>
            <PauseIcon />
          </button>
          <button className={tag.status === 'dropped' ? 'on' : ''} title="Dropped" onClick={() => void api.setTagStatus(id, 'dropped')}>
            <MinusCircleIcon />
          </button>
        </div>
        <label className="check">
          <input type="checkbox" checked={tag.allowsNextAction} onChange={(e) => void api.setTagAllowsNextAction(id, e.target.checked)} />
          Allows next action
        </label>
      </Section>
      {row && (
        <>
          <div className="insp-sep" />
          <div className="insp-meta">
            {row.availableCount} available, {row.remainingCount} remaining
          </div>
        </>
      )}
    </>
  );
}

function FolderInspector({ folder }: { folder: Folder }) {
  const api = store.api;
  const id = folder.id;
  return (
    <>
      <TitleField value={folder.name} placeholder="Untitled Folder" onCommit={(v) => void api.rename(id, v)} />
      <NoteField value={folder.note} onCommit={(v) => void api.setNote(id, v)} />
      <Section title="Status" value={folder.status === 'active' ? 'Active' : 'Dropped'}>
        <div className="seg">
          <button className={folder.status === 'active' ? 'on' : ''} title="Active" onClick={() => void api.setFolderStatus(id, 'active')}>
            <PlayIcon />
          </button>
          <button className={folder.status === 'dropped' ? 'on' : ''} title="Dropped" onClick={() => void api.setFolderStatus(id, 'dropped')}>
            <MinusCircleIcon />
          </button>
        </div>
      </Section>
    </>
  );
}

function MultiInspector({ ids, snap }: { ids: ID[]; snap: Snapshot }) {
  const api = store.api;
  const items = ids.map((id) => snap.tasks[id] ?? snap.projects[id]).filter(Boolean) as (Task | Project)[];
  const allFlagged = items.length > 0 && items.every((i) => i.flagged);
  const common = <T,>(get: (i: Task | Project) => T): T | null => {
    if (!items.length) return null;
    const first = get(items[0]);
    return items.every((i) => get(i) === first) ? first : null;
  };
  const isDone = (id: ID) => !!snap.tasks[id]?.completedAt || snap.projects[id]?.status === 'done';
  const isDropped = (id: ID) => !!snap.tasks[id]?.droppedAt || snap.projects[id]?.status === 'dropped';
  const setActive = async () => {
    for (const id of ids) {
      if (snap.projects[id]) {
        if (snap.projects[id].status !== 'active') await api.setProjectStatus(id, 'active');
      } else if (snap.tasks[id]?.completedAt) await api.toggleComplete([id]);
      else if (snap.tasks[id]?.droppedAt) await api.dropItems([id]);
    }
  };
  const setFlag = async () => {
    const targets = items.filter((i) => i.flagged === allFlagged).map((i) => i.id);
    if (targets.length) await api.toggleFlag(targets);
  };
  const setDates = async (field: 'defer' | 'planned' | 'due', v: number | null) => {
    for (const i of items) {
      await api.setItemDates(i.id, field === 'defer' ? v : i.deferDate, field === 'planned' ? v : i.plannedDate, field === 'due' ? v : i.dueDate);
    }
  };
  const setTags = async (tagIds: ID[]) => {
    for (const i of items) await api.setItemTags(i.id, tagIds);
  };
  return (
    <>
      <div className="insp-title insp-multi">{items.length} items selected</div>
      <Section title="Status">
        <div className="seg-row">
          <div className="seg">
            <button onClick={() => void setActive()} title="Active">
              <PlayIcon />
            </button>
            <button onClick={() => { const t = ids.filter((id) => !isDone(id)); if (t.length) void api.toggleComplete(t); }} title="Completed">
              <CheckCircleIcon />
            </button>
            <button onClick={() => { const t = ids.filter((id) => !isDropped(id)); if (t.length) void api.dropItems(t); }} title="Dropped">
              <MinusCircleIcon />
            </button>
          </div>
          <button className={'flag-btn' + (allFlagged ? ' on' : '')} title="Flagged" onClick={() => void setFlag()}>
            <FlagOutlineIcon style={allFlagged ? { fill: 'currentColor' } : undefined} />
          </button>
        </div>
      </Section>
      <Section title="Tags">
        <TagPicker tagIds={common((i) => i.tagIds.join(',')) !== null ? items[0].tagIds : []} onChange={(t) => void setTags(t)} />
      </Section>
      <DateSection title="Defer" value={common((i) => i.deferDate)} onChange={(v) => void setDates('defer', v)} defaultHour={snap.settings.defaultDeferHour} />
      <DateSection title="Planned" value={common((i) => i.plannedDate)} onChange={(v) => void setDates('planned', v)} defaultHour={snap.settings.defaultDeferHour} />
      <DateSection title="Due" value={common((i) => i.dueDate)} onChange={(v) => void setDates('due', v)} defaultHour={snap.settings.defaultDueHour} />
    </>
  );
}

/* ---------------- container ---------------- */

export function Inspector() {
  const snap = useSnapshot();
  const ui = useUi();
  if (!snap) return null;
  const sel = ui.selection.filter((id) => snap.tasks[id] || snap.projects[id]);
  const sbSel = snap.sidebar.selection.filter((id) => snap.tags[id] || snap.folders[id] || snap.projects[id]);
  let body: React.ReactNode;
  if (sel.length === 1) {
    const id = sel[0];
    body = snap.tasks[id] ? <TaskInspector key={id} task={snap.tasks[id]} snap={snap} /> : <ProjectInspector key={id} project={snap.projects[id]} snap={snap} />;
  } else if (sel.length > 1) body = <MultiInspector ids={sel} snap={snap} />;
  else if (sbSel.length === 1) {
    const id = sbSel[0];
    body = snap.tags[id] ? (
      <TagInspector key={id} tag={snap.tags[id]} snap={snap} />
    ) : snap.folders[id] ? (
      <FolderInspector key={id} folder={snap.folders[id]} />
    ) : (
      <ProjectInspector key={id} project={snap.projects[id]} snap={snap} />
    );
  } else body = <div className="insp-empty">No Selection</div>;
  return (
    <div className="inspector">
      <div className="insp-body">{body}</div>
      <div className="insp-footer">
        <button className="insp-hide" title="Hide Inspector (⌥⌘I)" onClick={() => store.setUi({ inspectorVisible: false })}>
          <MinusCircleIcon />
        </button>
      </div>
    </div>
  );
}
