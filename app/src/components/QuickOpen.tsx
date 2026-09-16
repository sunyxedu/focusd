import React, { useEffect, useMemo, useState } from 'react';
import { store } from '../core/store';
import type { SearchResult } from '../core/types';
import { PERSPECTIVE_META } from './PerspectivesBar';
import { FolderIcon, ProjectSmallIcon, TagOutlineIcon } from './Icons';

interface Entry {
  id: string;
  label: string;
  sub: string;
  icon: React.ReactNode;
  go: () => void | Promise<void>;
}

function toEntry(r: SearchResult): Entry {
  const goProjects = async () => {
    await store.goToPerspective('projects');
    await store.api.setFocus([]);
    await store.api.setSidebarSelection([r.id]);
  };
  const goTags = async () => {
    await store.goToPerspective('tags');
    await store.api.setSidebarSelection([r.id]);
  };
  if (r.kind === 'project') return { id: 'proj:' + r.id, label: r.name || 'Untitled Project', sub: r.sub || 'Project', icon: <ProjectSmallIcon style={{ color: 'var(--c-projects)' }} />, go: goProjects };
  if (r.kind === 'folder') return { id: 'f:' + r.id, label: r.name || 'Untitled Folder', sub: r.sub || 'Folder', icon: <FolderIcon style={{ color: '#7a7a80' }} />, go: goProjects };
  return { id: 't:' + r.id, label: r.name || 'Untitled Tag', sub: r.sub || 'Tag', icon: <TagOutlineIcon style={{ color: 'var(--c-tags)' }} />, go: goTags };
}

export function QuickOpen({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    let live = true;
    void store.api.searchItems(q.trim()).then((r) => { if (live) setResults(r); });
    return () => { live = false; };
  }, [q]);

  const list = useMemo<Entry[]>(() => {
    const l = q.trim().toLowerCase();
    const persp: Entry[] = PERSPECTIVE_META.filter((m) => !l || m.label.toLowerCase().includes(l)).map((m) => ({
      id: 'p:' + m.id, label: m.label, sub: 'Perspective', icon: <m.Icon style={{ color: m.color }} />, go: () => store.goToPerspective(m.id),
    }));
    return [...persp, ...results.map(toEntry)].slice(0, 20);
  }, [q, results]);
  useEffect(() => setIdx(0), [q]);

  const pick = (e: Entry | undefined) => {
    if (!e) return;
    void e.go();
    onClose();
  };

  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="qo" role="dialog" aria-label="Quick Open">
        <input
          autoFocus
          placeholder="Quick Open"
          value={q}
          spellCheck={false}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') onClose();
            else if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, list.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
            else if (e.key === 'Enter') pick(list[idx]);
          }}
        />
        <div className="list">
          {list.map((e, i) => (
            <div key={e.id} className={'qi' + (i === idx ? ' on' : '')} onMouseEnter={() => setIdx(i)} onClick={() => pick(e)}>
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
