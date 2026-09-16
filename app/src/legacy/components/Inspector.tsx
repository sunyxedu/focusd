import React, { useEffect, useRef, useState } from 'react';
import { store, useDB, useDerived } from '../model/store';
import { ID, ItemPatch, Project, RepetitionRule, Task, Tag, Folder } from '../model/types';
import { addDays, addMonths, addWeeks, formatDuration, fullDateLabel, parseDuration, shortNumericDate } from '../model/dates';
import { describeRule } from '../model/repeat';
import { DateInput, ProjectPicker, TagPicker } from './Fields';
import { CheckCircleIcon, ClearIcon, FlagOutlineIcon, MinusCircleIcon, ParallelIcon, PauseIcon, PlayIcon, SequentialIcon, SingleActionsIcon, TodayIcon } from './Icons';

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
  useEffect(() => setText(value), [value]);
  return (
    <textarea
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

function RepeatSection({ rule, onChange }: { rule: RepetitionRule | null; onChange: (r: RepetitionRule | null) => void }) {
  if (!rule)
    return (
      <Section title="Repeat">
        <button className="insp-btn" onClick={() => onChange({ every: 1, unit: 'week', method: 'fixed' })}>
          Add Repetition
        </button>
      </Section>
    );
  const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  return (
    <Section title="Repeat" value={describeRule(rule)}>
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
        <select value={rule.unit} onChange={(e) => onChange({ ...rule, unit: e.target.value as RepetitionRule['unit'], weekdays: e.target.value === 'week' ? rule.weekdays : undefined })}>
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
            <button key={i} className={rule.weekdays?.includes(i) ? 'on' : ''} onClick={() => {
              const set = new Set(rule.weekdays ?? []);
              set.has(i) ? set.delete(i) : set.add(i);
              onChange({ ...rule, weekdays: [...set].sort() });
            }}>
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
  return (
    <Section title="Estimated Duration">
      <div className="datefield">
        <input
          value={text}
          placeholder="None"
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            const v = parseDuration(text);
            if (text.trim() === '') onChange(null);
            else if (v !== null) onChange(v);
            else setText(value === null ? '' : formatDuration(value));
          }}
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

function TaskInspector({ task }: { task: Task }) {
  const db = useDB();
  const d = useDerived();
  const info = d.taskInfo[task.id];
  const up = (patch: Partial<Task>) => store.updateTask(task.id, patch);
  const projectId = info?.project?.id ?? null;
  return (
    <>
      <TitleField value={task.name} placeholder="Untitled Item" onCommit={(v) => up({ name: v })} />
      <NoteField value={task.note} onCommit={(v) => up({ note: v })} />
      <Section title="Status" value={task.completedAt ? 'Completed' : task.droppedAt ? 'Dropped' : info?.available ? 'Available' : info?.deferred ? 'Deferred' : info?.blocked ? 'Blocked' : 'Active'}>
        <div className="seg-row">
          <div className="seg">
            <button className={!task.completedAt && !task.droppedAt ? 'on' : ''} title="Active" onClick={() => up({ completedAt: null, droppedAt: null })}>
              <PlayIcon />
            </button>
            <button className={task.completedAt ? 'on' : ''} title="Completed" onClick={() => !task.completedAt && store.toggleComplete([task.id])}>
              <CheckCircleIcon />
            </button>
            <button className={task.droppedAt ? 'on' : ''} title="Dropped" onClick={() => !task.droppedAt && store.drop([task.id])}>
              <MinusCircleIcon />
            </button>
          </div>
          <button className={'flag-btn' + (task.flagged ? ' on' : '')} title="Flagged" onClick={() => up({ flagged: !task.flagged })}>
            <FlagOutlineIcon style={task.flagged ? { fill: 'currentColor' } : undefined} />
          </button>
        </div>
      </Section>
      <Section title="Project">
        <ProjectPicker value={projectId} onChange={(pid) => store.moveTasks([task.id], pid)} />
        {task.parentId && db.tasks[task.parentId] && <div className="insp-meta">Inside group “{db.tasks[task.parentId].name}”</div>}
      </Section>
      {info?.hasChildren && (
        <Section title="Type" value={task.sequential ? 'Sequential' : 'Parallel'}>
          <div className="seg">
            <button className={!task.sequential ? 'on' : ''} onClick={() => up({ sequential: false })} title="Parallel">
              <ParallelIcon />
            </button>
            <button className={task.sequential ? 'on' : ''} onClick={() => up({ sequential: true })} title="Sequential">
              <SequentialIcon />
            </button>
          </div>
          <label className="check">
            <input type="checkbox" checked={task.completedByChildren} onChange={(e) => up({ completedByChildren: e.target.checked })} />
            Complete with last action
          </label>
        </Section>
      )}
      <Section title="Tags">
        <TagPicker tagIds={task.tagIds} onChange={(ids) => up({ tagIds: ids })} />
      </Section>
      <DateSection title="Defer" value={task.deferDate} inherited={info?.effectiveDeferDate} onChange={(v) => up({ deferDate: v })} defaultHour={db.settings.defaultDeferHour} />
      <DateSection title="Planned" value={task.plannedDate} inherited={info?.effectivePlannedDate} onChange={(v) => up({ plannedDate: v })} defaultHour={db.settings.defaultDeferHour} />
      <DateSection title="Due" value={task.dueDate} inherited={info?.effectiveDueDate} onChange={(v) => up({ dueDate: v })} defaultHour={db.settings.defaultDueHour} />
      <RepeatSection rule={task.repetition} onChange={(r) => up({ repetition: r })} />
      <DurationSection value={task.estimatedMinutes} onChange={(v) => up({ estimatedMinutes: v })} />
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

function ProjectInspector({ project }: { project: Project }) {
  const db = useDB();
  const d = useDerived();
  const info = d.projectInfo[project.id];
  const up = (patch: Partial<Project>) => store.updateProject(project.id, patch);
  const statusLabel = { active: 'Active', onHold: 'On Hold', done: 'Completed', dropped: 'Dropped' }[project.status];
  const typeLabel = { parallel: 'Parallel', sequential: 'Sequential', singleActions: 'Single Actions' }[project.type];
  const iv = project.reviewInterval;
  return (
    <>
      <TitleField value={project.name} placeholder="Untitled Project" onCommit={(v) => up({ name: v })} />
      <NoteField value={project.note} onCommit={(v) => up({ note: v })} />
      <Section title="Status" value={statusLabel}>
        <div className="seg-row">
          <div className="seg">
            <button className={project.status === 'active' ? 'on' : ''} title="Active" onClick={() => up({ status: 'active' })}>
              <PlayIcon />
            </button>
            <button className={project.status === 'onHold' ? 'on' : ''} title="On Hold" onClick={() => up({ status: 'onHold' })}>
              <PauseIcon />
            </button>
            <button className={project.status === 'done' ? 'on' : ''} title="Completed" onClick={() => up({ status: 'done' })}>
              <CheckCircleIcon />
            </button>
            <button className={project.status === 'dropped' ? 'on' : ''} title="Dropped" onClick={() => up({ status: 'dropped' })}>
              <MinusCircleIcon />
            </button>
          </div>
          <button className={'flag-btn' + (project.flagged ? ' on' : '')} title="Flagged" onClick={() => up({ flagged: !project.flagged })}>
            <FlagOutlineIcon style={project.flagged ? { fill: 'currentColor' } : undefined} />
          </button>
        </div>
      </Section>
      <Section title="Project Type" value={typeLabel}>
        <div className="seg">
          <button className={project.type === 'parallel' ? 'on' : ''} title="Parallel" onClick={() => up({ type: 'parallel' })}>
            <ParallelIcon />
          </button>
          <button className={project.type === 'sequential' ? 'on' : ''} title="Sequential" onClick={() => up({ type: 'sequential' })}>
            <SequentialIcon />
          </button>
          <button className={project.type === 'singleActions' ? 'on' : ''} title="Single Actions" onClick={() => up({ type: 'singleActions' })}>
            <SingleActionsIcon />
          </button>
        </div>
        <label className="check">
          <input type="checkbox" checked={project.completedByChildren} onChange={(e) => up({ completedByChildren: e.target.checked })} />
          Complete with last action
        </label>
      </Section>
      <Section title="Folder">
        <div className="insp-row">
          <select style={{ flex: 1 }} value={project.folderId ?? ''} onChange={(e) => store.moveProject(project.id, e.target.value || null)}>
            <option value="">None</option>
            {Object.values(db.folders)
              .sort((a, b) => a.rank - b.rank)
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name || 'Untitled Folder'}
                </option>
              ))}
          </select>
        </div>
      </Section>
      <Section title="Tags">
        <TagPicker tagIds={project.tagIds} onChange={(ids) => up({ tagIds: ids })} />
      </Section>
      <DateSection title="Defer" value={project.deferDate} onChange={(v) => up({ deferDate: v })} defaultHour={db.settings.defaultDeferHour} />
      <DateSection title="Planned" value={project.plannedDate} onChange={(v) => up({ plannedDate: v })} defaultHour={db.settings.defaultDeferHour} />
      <DateSection title="Due" value={project.dueDate} onChange={(v) => up({ dueDate: v })} defaultHour={db.settings.defaultDueHour} />
      <RepeatSection rule={project.repetition} onChange={(r) => up({ repetition: r })} />
      <Section title="Review" value={project.nextReviewAt ? `Next ${shortNumericDate(project.nextReviewAt)}` : undefined}>
        <div className="insp-row">
          <label>Every</label>
          <input type="number" min={1} value={iv.steps} onChange={(e) => up({ reviewInterval: { ...iv, steps: Math.max(1, +e.target.value || 1) } })} />
          <select value={iv.unit} onChange={(e) => up({ reviewInterval: { ...iv, unit: e.target.value as typeof iv.unit } })}>
            <option value="day">Days</option>
            <option value="week">Weeks</option>
            <option value="month">Months</option>
            <option value="year">Years</option>
          </select>
        </div>
        <div className="insp-row">
          <label>Next review</label>
          <DateInput className="datefield" value={project.nextReviewAt} onChange={(v) => up({ nextReviewAt: v })} defaultHour={0} compact />
        </div>
        <div className="insp-meta">{project.lastReviewedAt ? `Last reviewed ${shortNumericDate(project.lastReviewedAt)}` : 'Never reviewed'}</div>
        <button className="insp-btn" style={{ marginTop: 6 }} onClick={() => store.markReviewed([project.id])}>
          Mark Reviewed
        </button>
      </Section>
      <DurationSection value={project.estimatedMinutes} onChange={(v) => up({ estimatedMinutes: v })} />
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

function TagInspector({ tag }: { tag: Tag }) {
  const d = useDerived();
  const up = (patch: Partial<Tag>) => store.updateTag(tag.id, patch);
  const c = d.tagTaskCounts[tag.id];
  return (
    <>
      <TitleField value={tag.name} placeholder="Untitled Tag" onCommit={(v) => up({ name: v })} />
      <NoteField value={tag.note} onCommit={(v) => up({ note: v })} />
      <Section title="Status" value={{ active: 'Active', onHold: 'On Hold', dropped: 'Dropped' }[tag.status]}>
        <div className="seg">
          <button className={tag.status === 'active' ? 'on' : ''} title="Active" onClick={() => up({ status: 'active' })}>
            <PlayIcon />
          </button>
          <button className={tag.status === 'onHold' ? 'on' : ''} title="On Hold" onClick={() => up({ status: 'onHold' })}>
            <PauseIcon />
          </button>
          <button className={tag.status === 'dropped' ? 'on' : ''} title="Dropped" onClick={() => up({ status: 'dropped' })}>
            <MinusCircleIcon />
          </button>
        </div>
        <label className="check">
          <input type="checkbox" checked={tag.allowsNextAction} onChange={(e) => up({ allowsNextAction: e.target.checked })} />
          Allows next action
        </label>
      </Section>
      <div className="insp-sep" />
      <div className="insp-meta">
        {c?.available ?? 0} available, {c?.remaining ?? 0} remaining
      </div>
    </>
  );
}

function FolderInspector({ folder }: { folder: Folder }) {
  const up = (patch: Partial<Folder>) => store.updateFolder(folder.id, patch);
  return (
    <>
      <TitleField value={folder.name} placeholder="Untitled Folder" onCommit={(v) => up({ name: v })} />
      <NoteField value={folder.note} onCommit={(v) => up({ note: v })} />
      <Section title="Status" value={folder.status === 'active' ? 'Active' : 'Dropped'}>
        <div className="seg">
          <button className={folder.status === 'active' ? 'on' : ''} onClick={() => up({ status: 'active' })}>
            <PlayIcon />
          </button>
          <button className={folder.status === 'dropped' ? 'on' : ''} onClick={() => up({ status: 'dropped' })}>
            <MinusCircleIcon />
          </button>
        </div>
      </Section>
    </>
  );
}

function MultiInspector({ ids }: { ids: ID[] }) {
  const db = useDB();
  const items = ids.map((id) => db.tasks[id] ?? db.projects[id]).filter(Boolean) as (Task | Project)[];
  const allFlagged = items.every((i) => i.flagged);
  const apply = (patch: ItemPatch) => store.mutate((db2) => {
    for (const id of ids) {
      if (db2.tasks[id]) db2.tasks[id] = { ...db2.tasks[id], ...(patch as Partial<Task>) };
      if (db2.projects[id]) db2.projects[id] = { ...db2.projects[id], ...(patch as Partial<Project>) };
    }
  });
  const common = <T,>(get: (i: Task | Project) => T): T | null => {
    const first = get(items[0]);
    return items.every((i) => get(i) === first) ? first : null;
  };
  return (
    <>
      <div className="insp-title" style={{ color: '#7a7a80' }}>
        {items.length} items selected
      </div>
      <Section title="Status">
        <div className="seg-row">
          <div className="seg">
            <button onClick={() => store.mutate((db2) => ids.forEach((id) => { if (db2.tasks[id]) db2.tasks[id] = { ...db2.tasks[id], completedAt: null, droppedAt: null }; if (db2.projects[id]) db2.projects[id] = { ...db2.projects[id], status: 'active', completedAt: null, droppedAt: null }; }))} title="Active">
              <PlayIcon />
            </button>
            <button onClick={() => store.toggleComplete(ids.filter((id) => !db.tasks[id]?.completedAt && db.projects[id]?.status !== 'done'))} title="Completed">
              <CheckCircleIcon />
            </button>
            <button onClick={() => store.drop(ids.filter((id) => !db.tasks[id]?.droppedAt && db.projects[id]?.status !== 'dropped'))} title="Dropped">
              <MinusCircleIcon />
            </button>
          </div>
          <button className={'flag-btn' + (allFlagged ? ' on' : '')} onClick={() => apply({ flagged: !allFlagged })}>
            <FlagOutlineIcon style={allFlagged ? { fill: 'currentColor' } : undefined} />
          </button>
        </div>
      </Section>
      <Section title="Tags">
        <TagPicker tagIds={common((i) => i.tagIds.join(',')) !== null ? items[0].tagIds : []} onChange={(t) => apply({ tagIds: t })} />
      </Section>
      <DateSection title="Defer" value={common((i) => i.deferDate)} onChange={(v) => apply({ deferDate: v })} defaultHour={db.settings.defaultDeferHour} />
      <DateSection title="Planned" value={common((i) => i.plannedDate)} onChange={(v) => apply({ plannedDate: v })} defaultHour={db.settings.defaultDeferHour} />
      <DateSection title="Due" value={common((i) => i.dueDate)} onChange={(v) => apply({ dueDate: v })} defaultHour={db.settings.defaultDueHour} />
    </>
  );
}

export function Inspector() {
  const db = useDB();
  const sel = db.ui.selection.filter((id) => db.tasks[id] || db.projects[id]);
  const p = db.ui.perspective;
  const sbSel = (db.ui.sidebarSelection[p] ?? []).filter((id) => db.tags[id] || db.folders[id] || db.projects[id]);
  let body: React.ReactNode;
  if (sel.length === 1) {
    const id = sel[0];
    body = db.tasks[id] ? <TaskInspector task={db.tasks[id]} /> : <ProjectInspector project={db.projects[id]} />;
  } else if (sel.length > 1) body = <MultiInspector ids={sel} />;
  else if (sbSel.length === 1) {
    const id = sbSel[0];
    body = db.tags[id] ? <TagInspector tag={db.tags[id]} /> : db.folders[id] ? <FolderInspector folder={db.folders[id]} /> : <ProjectInspector project={db.projects[id]} />;
  } else body = <div className="insp-empty">No Selection</div>;
  return <div className="inspector">{body}</div>;
}
