import React from 'react';
import { store, useSnapshot } from '../core/store';
import type { Perspective } from '../core/types';
import { FlagIcon, ForecastIcon, InboxIcon, NearbyIcon, ProjectsIcon, ReviewIcon, TagIcon } from './Icons';

export const PERSPECTIVE_META: { id: Perspective; label: string; color: string; Icon: (p: React.SVGProps<SVGSVGElement>) => JSX.Element; key: string }[] = [
  { id: 'inbox', label: 'Inbox', color: 'var(--c-inbox)', Icon: InboxIcon, key: '1' },
  { id: 'projects', label: 'Projects', color: 'var(--c-projects)', Icon: ProjectsIcon, key: '2' },
  { id: 'tags', label: 'Tags', color: 'var(--c-tags)', Icon: TagIcon, key: '3' },
  { id: 'forecast', label: 'Forecast', color: 'var(--c-forecast)', Icon: ForecastIcon, key: '4' },
  { id: 'flagged', label: 'Flagged', color: 'var(--c-flagged)', Icon: FlagIcon, key: '5' },
  { id: 'nearby', label: 'Nearby', color: 'var(--c-nearby)', Icon: NearbyIcon, key: '6' },
  { id: 'review', label: 'Review', color: 'var(--c-review)', Icon: ReviewIcon, key: '7' },
];

export function PerspectivesBar() {
  const snap = useSnapshot();
  if (!snap) return null;
  const badges = snap.settings.showBadges ? snap.badges : { inbox: 0, forecast: 0, flagged: 0, review: 0 };
  return (
    <div className="pbar">
      {PERSPECTIVE_META.map((m) => {
        const badge = (badges as unknown as Record<string, number>)[m.id] ?? 0;
        return (
          <button
            key={m.id}
            className={'pbar-item' + (snap.perspective === m.id ? ' on' : '')}
            onClick={() => void store.goToPerspective(m.id)}
            title={`${m.label} (⌘${m.key})`}
          >
            <m.Icon style={{ color: m.color }} />
            <span>{m.label}</span>
            {badge > 0 && <span className={'badge ' + m.id}>{badge}</span>}
          </button>
        );
      })}
    </div>
  );
}
