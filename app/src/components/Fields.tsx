import React, { useEffect, useMemo, useRef, useState } from 'react';
import { store, useSnapshot } from '../core/store';
import type { ID, Snapshot, Tag } from '../core/types';
import { fullDateLabel } from '../core/format';
import { CalendarIcon, CloseIcon, PlusIcon, ProjectSmallIcon, TagOutlineIcon } from './Icons';
import { Popover } from './Popover';

/* ---------------- Date input with natural-language parsing (Rust) ---------------- */
export function DateInput({
  value,
  onChange,
  placeholder = 'None',
  defaultHour,
  className = 'datefield',
  autoFocus,
  onDone,
  compact,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  defaultHour: number;
  className?: string;
  autoFocus?: boolean;
  onDone?: () => void;
  compact?: boolean;
}) {
  const [text, setText] = useState(value === null ? '' : fullDateLabel(value));
  const [invalid, setInvalid] = useState(false);
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!editing) setText(value === null ? '' : fullDateLabel(value));
  }, [value, editing]);
  const commit = async () => {
    setEditing(false);
    const t = text.trim();
    if (!t) {
      setInvalid(false);
      if (value !== null) onChange(null);
      return;
    }
    if (value !== null && t === fullDateLabel(value)) return;
    const parsed = await store.api.parseDate(t, defaultHour);
    if (parsed === null) {
      setInvalid(true);
      setText(value === null ? '' : fullDateLabel(value));
      setTimeout(() => setInvalid(false), 800);
      return;
    }
    onChange(parsed);
  };
  return (
    <div className={className + (invalid ? ' invalid' : '')}>
      <input
        ref={ref}
        autoFocus={autoFocus}
        value={text}
        placeholder={placeholder}
        spellCheck={false}
        onFocus={() => setEditing(true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void commit().then(() => onDone?.());
            (e.target as HTMLInputElement).blur();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setText(value === null ? '' : fullDateLabel(value));
            setEditing(false);
            (e.target as HTMLInputElement).blur();
            onDone?.();
          } else if (e.key === 'Tab') {
            void commit();
          }
          e.stopPropagation();
        }}
      />
      {!compact && (
        <button
          title="Pick a date"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const inp = document.createElement('input');
            inp.type = 'datetime-local';
            inp.style.position = 'fixed';
            inp.style.opacity = '0';
            inp.style.pointerEvents = 'none';
            if (value !== null) {
              const d = new Date(value);
              const pad = (n: number) => String(n).padStart(2, '0');
              inp.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
            }
            document.body.appendChild(inp);
            inp.addEventListener('change', () => {
              if (inp.value) onChange(new Date(inp.value).getTime());
              inp.remove();
            });
            inp.addEventListener('blur', () => setTimeout(() => inp.remove(), 300));
            try {
              (inp as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
            } catch {
              inp.focus();
            }
          }}
        >
          <CalendarIcon />
        </button>
      )}
    </div>
  );
}

/* ---------------- Typeahead list ---------------- */
export interface Choice {
  id: string;
  label: string;
  sub?: string;
  icon?: React.ReactNode;
}

function useFiltered(choices: Choice[], q: string, allowCreate: boolean) {
  return useMemo(() => {
    const l = q.trim().toLowerCase();
    let list = l ? choices.filter((c) => c.label.toLowerCase().includes(l)) : choices;
    list = list.slice(0, 12);
    if (allowCreate && l && !choices.some((c) => c.label.toLowerCase() === l)) list = [...list, { id: '__create', label: `New: “${q.trim()}”` }];
    return list;
  }, [choices, q, allowCreate]);
}

export function Typeahead({
  choices,
  onPick,
  onCreate,
  placeholder,
  autoFocus,
  onClose,
  className,
  initial = '',
}: {
  choices: Choice[];
  onPick: (id: string) => void;
  onCreate?: (name: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  onClose?: () => void;
  className?: string;
  initial?: string;
}) {
  const [q, setQ] = useState(initial);
  const [idx, setIdx] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const list = useFiltered(choices, q, !!onCreate);
  useEffect(() => setIdx(0), [q]);
  const choose = (i: number) => {
    const c = list[i];
    if (!c) {
      if (onCreate && q.trim()) onCreate(q.trim());
      return;
    }
    if (c.id === '__create') onCreate?.(q.trim());
    else onPick(c.id);
    setQ('');
    setOpen(false);
  };
  return (
    <>
      <input
        ref={ref}
        className={className}
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={q}
        spellCheck={false}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setTimeout(() => setOpen(false), 120);
          onClose?.();
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setIdx((i) => Math.min(i + 1, list.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setIdx((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            choose(idx);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setOpen(false);
            ref.current?.blur();
            onClose?.();
          } else if (e.key === 'Tab') {
            if (q.trim()) {
              e.preventDefault();
              choose(idx);
            }
          }
        }}
      />
      {open && list.length > 0 && (
        <Popover anchor={ref.current} onClose={() => setOpen(false)} className="menu">
          {list.map((c, i) => (
            <div key={c.id} className={'mi' + (i === idx ? ' on' : '')} onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setIdx(i)} onClick={() => choose(i)}>
              {c.icon}
              <span>{c.label}</span>
              {c.sub && <span className="sub">{c.sub}</span>}
            </div>
          ))}
        </Popover>
      )}
    </>
  );
}

/* ---------------- Tag picker ---------------- */
export function tagPath(snap: Snapshot, id: ID): string {
  const parts: string[] = [];
  let cur: ID | null = id;
  while (cur) {
    const t: Tag | undefined = snap.tags[cur];
    if (!t) break;
    parts.unshift(t.name);
    cur = t.parentId;
  }
  return parts.join(' : ');
}

export function useTagChoices(): Choice[] {
  const snap = useSnapshot();
  return useMemo(() => {
    if (!snap) return [];
    return snap.tagList.map((e) => ({
      id: e.tag.id,
      label: e.tag.name,
      sub: e.tag.parentId ? tagPath(snap, e.tag.parentId) : undefined,
      icon: <TagOutlineIcon style={{ color: 'var(--c-tags)' }} />,
    }));
  }, [snap?.tagList, snap?.tags]);
}

export function TagPicker({ tagIds, onChange, autoFocus, onClose, inline }: { tagIds: ID[]; onChange: (ids: ID[]) => void; autoFocus?: boolean; onClose?: () => void; inline?: boolean }) {
  const snap = useSnapshot();
  const choices = useTagChoices().filter((c) => !tagIds.includes(c.id));
  const [adding, setAdding] = useState(!!autoFocus);
  const add = (id: ID) => onChange([...tagIds, id]);
  const create = async (name: string) => {
    const id = await store.api.addTag(name);
    onChange([...tagIds, id]);
  };
  return (
    <div className={inline ? 'tagbox inline' : 'tagbox'} onClick={() => setAdding(true)}>
      {tagIds.map((id) => (
        <span key={id} className="chip">
          {snap?.tags[id]?.name ?? '?'}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onChange(tagIds.filter((x) => x !== id));
            }}
          >
            <CloseIcon />
          </button>
        </span>
      ))}
      {adding ? (
        <Typeahead
          choices={choices}
          onPick={add}
          onCreate={(n) => void create(n)}
          placeholder="Tag"
          autoFocus
          onClose={() => {
            setAdding(false);
            onClose?.();
          }}
        />
      ) : (
        <button className="add" title="Add tag">
          <PlusIcon />
        </button>
      )}
    </div>
  );
}

/* ---------------- Project picker ---------------- */
export function useProjectChoices(): Choice[] {
  const snap = useSnapshot();
  return useMemo(() => {
    if (!snap) return [];
    return snap.projectList
      .filter((e) => e.project.status === 'active' || e.project.status === 'onHold')
      .map((e) => ({
        id: e.project.id,
        label: e.project.name || 'Untitled Project',
        sub: e.folderPath || undefined,
        icon: <ProjectSmallIcon style={{ color: 'var(--c-projects)' }} />,
      }));
  }, [snap?.projectList]);
}

export function ProjectPicker({ value, onChange, autoFocus, onClose, className }: { value: ID | null; onChange: (id: ID | null) => void; autoFocus?: boolean; onClose?: () => void; className?: string }) {
  const snap = useSnapshot();
  const choices = useProjectChoices();
  const [editing, setEditing] = useState(!!autoFocus);
  const name = value ? snap?.projects[value]?.name ?? '' : '';
  if (!editing)
    return (
      <div className={className ?? 'insp-proj'} onClick={() => setEditing(true)}>
        <ProjectSmallIcon />
        <input readOnly value={name} placeholder="Inbox" onFocus={() => setEditing(true)} />
        {value && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
            }}
            title="Move to Inbox"
          >
            <CloseIcon />
          </button>
        )}
      </div>
    );
  return (
    <div className={className ?? 'insp-proj'}>
      <ProjectSmallIcon />
      <Typeahead
        choices={[{ id: '__inbox', label: 'Inbox', icon: <ProjectSmallIcon style={{ color: 'var(--c-inbox)' }} /> }, ...choices]}
        onPick={(id) => {
          onChange(id === '__inbox' ? null : id);
          setEditing(false);
        }}
        onCreate={(n) => {
          void store.api.addProject(n).then((id) => {
            onChange(id);
            setEditing(false);
          });
        }}
        placeholder="Project"
        autoFocus
        initial={name}
        onClose={() => {
          setEditing(false);
          onClose?.();
        }}
      />
    </div>
  );
}
