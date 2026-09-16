import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  anchor: HTMLElement | null;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
  /** place below the anchor (default) or to the right */
  side?: 'bottom' | 'right';
  width?: number;
}

export function Popover({ anchor, onClose, children, className = 'popover', align = 'left', side = 'bottom', width }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const r = anchor.getBoundingClientRect();
    const w = ref.current.offsetWidth;
    const h = ref.current.offsetHeight;
    let top = side === 'bottom' ? r.bottom + 6 : r.top;
    let left = side === 'bottom' ? (align === 'right' ? r.right - w : align === 'center' ? r.left + r.width / 2 - w / 2 : r.left) : r.right + 6;
    left = Math.max(6, Math.min(left, window.innerWidth - w - 6));
    top = Math.max(6, Math.min(top, window.innerHeight - h - 6));
    setPos({ top, left });
  }, [anchor, align, side, children]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !(anchor && anchor.contains(e.target as Node))) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div ref={ref} className={className} style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width, visibility: pos ? 'visible' : 'hidden' }}>
      {children}
    </div>,
    document.body,
  );
}

export interface MenuItem {
  label: string;
  sub?: string;
  icon?: React.ReactNode;
  onSelect?: () => void;
  checked?: boolean;
  separator?: boolean;
  header?: boolean;
  disabled?: boolean;
}

export function Menu({ anchor, onClose, items, align = 'left' }: { anchor: HTMLElement | null; onClose: () => void; items: MenuItem[]; align?: 'left' | 'right' }) {
  return (
    <Popover anchor={anchor} onClose={onClose} className="menu" align={align}>
      {items.map((it, i) =>
        it.separator ? (
          <div key={i} className="msep" />
        ) : it.header ? (
          <div key={i} className="mhead">
            {it.label}
          </div>
        ) : (
          <div
            key={i}
            className={'mi' + (it.checked ? ' on' : '')}
            style={it.disabled ? { color: '#b0b0b5', pointerEvents: 'none' } : undefined}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              it.onSelect?.();
              onClose();
            }}
          >
            {it.icon}
            <span>{it.label}</span>
            {it.sub && <span className="sub">{it.sub}</span>}
          </div>
        ),
      )}
    </Popover>
  );
}
