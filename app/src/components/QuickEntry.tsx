import React, { useEffect, useRef, useState } from 'react';
import { store, useSnapshot } from '../core/store';
import type { ID, RepetitionRule } from '../core/types';
import { relativeDateLabel } from '../core/format';
import { CalendarDueIcon, EyeIcon, FlagOutlineIcon, NoteOutlineIcon, ProjectSmallIcon, RepeatIcon, TagOutlineIcon } from './Icons';
import { DateInput, ProjectPicker, TagPicker } from './Fields';

export interface QuickEntryPrefill {
  name?: string;
  note?: string;
  flagged?: boolean;
}

export function QuickEntry({ onClose, prefill }: { onClose: () => void; prefill?: QuickEntryPrefill }) {
  const snap = useSnapshot();
  const [name, setName] = useState(prefill?.name ?? '');
  const [note, setNote] = useState(prefill?.note ?? '');
  const [projectId, setProjectId] = useState<ID | null>(null);
  const [tagIds, setTagIds] = useState<ID[]>([]);
  const [defer, setDefer] = useState<number | null>(null);
  const [due, setDue] = useState<number | null>(null);
  const [estimate, setEstimate] = useState<number | null>(null);
  const [flagged, setFlagged] = useState(!!prefill?.flagged);
  const [repeat, setRepeat] = useState<RepetitionRule | null>(null);
  const [repeatText, setRepeatText] = useState('');
  const [field, setField] = useState<'project' | 'tags' | 'defer' | 'due' | 'estimate' | 'note' | null>(null);
  const [estText, setEstText] = useState('');
  const titleRef = useRef<HTMLDivElement>(null);
  const saving = useRef(false);

  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    if (prefill?.name) el.textContent = prefill.name;
    el.focus();
  }, []);

  useEffect(() => {
    if (!repeat) return setRepeatText('');
    void store.api.describeRepetition(repeat).then(setRepeatText);
  }, [repeat]);

  const save = async () => {
    if (saving.current) return;
    const n = (titleRef.current?.textContent ?? name).trim();
    if (!n && !note) return onClose();
    saving.current = true;
    const id = await store.api.addTask({ name: n, note, project: projectId, tagIds, flagged, deferDate: defer, dueDate: due, estimatedMinutes: estimate, repetition: repeat });
    if (snap?.perspective === 'inbox' && !projectId) store.select([id]);
    onClose();
  };

  const settings = snap?.settings ?? { defaultDueHour: 17, defaultDeferHour: 0 };

  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="qe quick-entry"
        role="dialog"
        aria-label="Quick Entry"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
          } else if (e.metaKey && e.shiftKey && e.key.toLowerCase() === 'd') {
            e.preventDefault();
            e.stopPropagation();
            setField('defer');
          } else if (e.metaKey && !e.shiftKey && e.key.toLowerCase() === 'e') {
            e.preventDefault();
            e.stopPropagation();
            setEstText('');
            setField('estimate');
          } else if ((e.key === 'Enter' || e.key.toLowerCase() === 's') && e.metaKey) {
            e.preventDefault();
            e.stopPropagation();
            void save();
          }
        }}
      >
        <div className="qe-row">
          <span className="status" style={{ marginTop: 1 }}>
            <span className={'circle' + (flagged ? ' flagged' : '')} />
          </span>
          <div className="qe-body">
            <div
              ref={titleRef}
              className="qe-title"
              contentEditable
              suppressContentEditableWarning
              spellCheck
              onInput={(e) => setName((e.target as HTMLDivElement).textContent ?? '')}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void save();
                } else if (e.key === 'Escape') onClose();
                else if (e.key === 'Tab') {
                  e.preventDefault();
                  setField('project');
                }
              }}
            />
            <div className="details" style={{ marginTop: 3 }}>
              {field === 'project' ? (
                <span className="det">
                  <ProjectPicker className="field-edit" value={projectId} autoFocus onChange={(id) => { setProjectId(id); setField('tags'); }} onClose={() => setField((f) => (f === 'project' ? null : f))} />
                </span>
              ) : (
                <span className={'det' + (projectId ? '' : ' placeholder')} onClick={() => setField('project')}>
                  <ProjectSmallIcon />
                  {projectId ? snap?.projects[projectId]?.name || 'Untitled Project' : 'Project'}
                </span>
              )}
              {field === 'tags' ? (
                <span className="det">
                  <TagPicker inline tagIds={tagIds} autoFocus onChange={setTagIds} onClose={() => setField(null)} />
                </span>
              ) : (
                <span className={'det' + (tagIds.length ? '' : ' placeholder')} onClick={() => setField('tags')}>
                  <TagOutlineIcon />
                  {tagIds.length ? tagIds.map((id) => snap?.tags[id]?.name).join(', ') : 'Tags'}
                </span>
              )}
              {field === 'defer' || defer !== null ? (field === 'defer' ? (
                <span className="det">
                  <DateInput compact autoFocus className="field-edit" value={defer} onChange={setDefer} defaultHour={settings.defaultDeferHour} onDone={() => setField(null)} placeholder="Defer" />
                </span>
              ) : (
                <span className="det" onClick={() => setField('defer')}>
                  <CalendarDueIcon />
                  {`Defer: ${relativeDateLabel(defer!)}`}
                </span>
              )) : null}
              {field === 'due' ? (
                <span className="det">
                  <DateInput compact autoFocus className="field-edit" value={due} onChange={setDue} defaultHour={settings.defaultDueHour} onDone={() => setField(null)} placeholder="Due" />
                </span>
              ) : (
                <span className={'det' + (due !== null ? '' : ' placeholder')} onClick={() => setField('due')}>
                  <CalendarDueIcon />
                  {due !== null ? `Due: ${relativeDateLabel(due)}` : 'Due'}
                </span>
              )}
              {field === 'estimate' || estimate !== null ? (field === 'estimate' ? (
                <span className="det">
                  <input
                    className="field-edit"
                    autoFocus
                    placeholder="Estimate"
                    value={estText}
                    onChange={(e) => setEstText(e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter' || e.key === 'Tab') {
                        e.preventDefault();
                        void store.api.parseDuration(estText).then((m) => { setEstimate(m); setField(null); });
                      } else if (e.key === 'Escape') setField(null);
                    }}
                    onBlur={() => void store.api.parseDuration(estText).then((m) => { setEstimate(m); setField(null); })}
                  />
                </span>
              ) : (
                <span className="det" onClick={() => { setEstText(''); setField('estimate'); }}>
                  <EstimateGlyph />
                  {formatMinutes(estimate!)}
                </span>
              )) : null}
              <span className={'det' + (repeat ? '' : ' placeholder')} onClick={() => setRepeat(repeat ? null : { every: 1, unit: 'week', method: 'fixed', weekdays: [] })}>
                <RepeatIcon />
                {repeat ? repeatText || 'Repeat' : 'Repeat'}
              </span>
            </div>
            {field === 'note' || note ? (
              <textarea className="note-edit" autoFocus={field === 'note'} placeholder="Add Note" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.stopPropagation()} onBlur={() => setField((f) => (f === 'note' ? null : f))} rows={3} />
            ) : (
              <div className="details" onClick={() => setField('note')}>
                <span className="det placeholder">Add Note</span>
              </div>
            )}
          </div>
          <div className="trail">
            <button className="note-ind" onClick={() => setField('note')} title="Note">
              <NoteOutlineIcon />
            </button>
            <button className={flagged ? 'on' : ''} onClick={() => setFlagged((f) => !f)} title="Flag">
              <FlagOutlineIcon style={flagged ? { fill: 'currentColor' } : undefined} />
            </button>
          </div>
        </div>
        <div className="qe-foot">
          <span className="eye" title="View Options">
            <EyeIcon />
          </span>
          <button className="btn-plain" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-blue" onClick={() => void save()}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function formatMinutes(m: number): string {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

function EstimateGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
      <circle cx="7" cy="7" r="5.5" />
      <path d="M7 4v3.2l2 1.3" strokeLinecap="round" />
    </svg>
  );
}
