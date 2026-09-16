import React, { useEffect, useMemo, useState } from 'react';
import { store, useDB } from '../model/store';
import { PERSPECTIVE_META, goToPerspective } from './PerspectivesBar';
import { FolderIcon, ProjectSmallIcon, TagOutlineIcon } from './Icons';

interface Entry {
  id: string;
  label: string;
  sub: string;
  icon: React.ReactNode;
  go: () => void;
}

export function QuickOpen({ onClose }: { onClose: () => void }) {
  const db = useDB();
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = [];
    for (const m of PERSPECTIVE_META) out.push({ id: 'p:' + m.id, label: m.label, sub: 'Perspective', icon: <m.Icon style={{ color: m.color }} />, go: () => goToPerspective(m.id) });
    for (const p of Object.values(db.projects)) out.push({ id: 'proj:' + p.id, label: p.name || 'Untitled Project', sub: 'Project', icon: <ProjectSmallIcon style={{ color: 'var(--c-projects)' }} />, go: () => { goToPerspective('projects'); store.ui({ sidebarSelection: { ...store.db.ui.sidebarSelection, projects: [p.id] }, focusIds: [] }); } });
    for (const f of Object.values(db.folders)) out.push({ id: 'f:' + f.id, label: f.name || 'Untitled Folder', sub: 'Folder', icon: <FolderIcon style={{ color: '#7a7a80' }} />, go: () => { goToPerspective('projects'); store.ui({ sidebarSelection: { ...store.db.ui.sidebarSelection, projects: [f.id] }, focusIds: [] }); } });
    for (const t of Object.values(db.tags)) out.push({ id: 't:' + t.id, label: t.name || 'Untitled Tag', sub: 'Tag', icon: <TagOutlineIcon style={{ color: 'var(--c-tags)' }} />, go: () => { goToPerspective('tags'); store.ui({ sidebarSelection: { ...store.db.ui.sidebarSelection, tags: [t.id] } }); } });
    return out;
  }, [db.projects, db.folders, db.tags]);
  const list = useMemo(() => {
    const l = q.trim().toLowerCase();
    if (!l) return entries.slice(0, 20);
    return entries.filter((e) => e.label.toLowerCase().includes(l)).slice(0, 20);
  }, [entries, q]);
  useEffect(() => setIdx(0), [q]);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="qo">
        <input
          autoFocus
          placeholder="Quick Open"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') onClose();
            else if (e.key === 'ArrowDown') setIdx((i) => Math.min(i + 1, list.length - 1));
            else if (e.key === 'ArrowUp') setIdx((i) => Math.max(i - 1, 0));
            else if (e.key === 'Enter') {
              list[idx]?.go();
              onClose();
            }
          }}
        />
        <div className="list">
          {list.map((e, i) => (
            <div key={e.id} className={'qi' + (i === idx ? ' on' : '')} onMouseEnter={() => setIdx(i)} onClick={() => { e.go(); onClose(); }}>
              {e.icon}
              <span>{e.label}</span>
              <span className="sub">{e.sub}</span>
            </div>
          ))}
          {list.length === 0 && <div className="qi" style={{ color: '#9a9aa0' }}>No matches</div>}
        </div>
      </div>
    </div>
  );
}
