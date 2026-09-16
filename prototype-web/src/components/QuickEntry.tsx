import React, { useEffect, useRef, useState } from 'react';
import { store, useDB } from '../model/store';
import { ID, RepetitionRule } from '../model/types';
import { relativeDateLabel } from '../model/dates';
import { CalendarDueIcon, EyeIcon, FlagOutlineIcon, NoteOutlineIcon, ProjectSmallIcon, RepeatIcon, TagOutlineIcon } from './Icons';
import { DateInput, ProjectPicker, TagPicker } from './Fields';
import { describeRule } from '../model/repeat';

export function QuickEntry({ onClose }: { onClose: () => void }) {
  const db = useDB();
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [projectId, setProjectId] = useState<ID | null>(null);
  const [tagIds, setTagIds] = useState<ID[]>([]);
  const [due, setDue] = useState<number | null>(null);
  const [flagged, setFlagged] = useState(false);
  const [repeat, setRepeat] = useState<RepetitionRule | null>(null);
  const [field, setField] = useState<'project' | 'tags' | 'due' | 'note' | null>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  useEffect(() => titleRef.current?.focus(), []);

  const save = () => {
    const n = (titleRef.current?.textContent ?? name).trim();
    if (!n && !note) return onClose();
    const id = store.addTask({ name: n, note, parentId: projectId, tagIds, dueDate: due, flagged, repetition: repeat });
    if (db.ui.perspective === 'inbox' && !projectId) store.ui({ selection: [id] });
    onClose();
  };

  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="qe"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
          } else if (e.key === 'Enter' && e.metaKey) {
            e.preventDefault();
            e.stopPropagation();
            save();
          }
        }}
      >
        <div className="qe-row">
          <span className="status" style={{ marginTop: 1 }}>
            <span className="circle" />
          </span>
          <div className="qe-body">
            <div
              ref={titleRef}
              className="qe-title"
              contentEditable
              suppressContentEditableWarning
              onInput={(e) => setName((e.target as HTMLDivElement).textContent ?? '')}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  save();
                } else if (e.key === 'Escape') onClose();
                else if (e.key === 'Tab') {
                  e.preventDefault();
                  setField('project');
                } else if (e.key === 'Enter' && e.metaKey) save();
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
                  {projectId ? db.projects[projectId]?.name : 'Project'}
                </span>
              )}
              {field === 'tags' ? (
                <span className="det">
                  <TagPicker inline tagIds={tagIds} autoFocus onChange={setTagIds} onClose={() => setField(null)} />
                </span>
              ) : (
                <span className={'det' + (tagIds.length ? '' : ' placeholder')} onClick={() => setField('tags')}>
                  <TagOutlineIcon />
                  {tagIds.length ? tagIds.map((id) => db.tags[id]?.name).join(', ') : 'Tags'}
                </span>
              )}
              {field === 'due' ? (
                <span className="det">
                  <DateInput compact autoFocus className="field-edit" value={due} onChange={setDue} defaultHour={db.settings.defaultDueHour} onDone={() => setField(null)} />
                </span>
              ) : (
                <span className={'det' + (due !== null ? '' : ' placeholder')} onClick={() => setField('due')}>
                  <CalendarDueIcon />
                  {due !== null ? `Due: ${relativeDateLabel(due)}` : 'Due'}
                </span>
              )}
              <span className={'det' + (repeat ? '' : ' placeholder')} onClick={() => setRepeat(repeat ? null : { every: 1, unit: 'week', method: 'fixed' })}>
                <RepeatIcon />
                {repeat ? describeRule(repeat) : 'Repeat'}
              </span>
            </div>
            {field === 'note' || note ? (
              <textarea className="note-edit" autoFocus={field === 'note'} placeholder="Add Note" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.stopPropagation()} onBlur={() => setField(null)} rows={3} />
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
          <button className="btn-blue" onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
