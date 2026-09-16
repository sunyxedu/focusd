import React from 'react';
export function Toolbar({ onQuickEntry }: { onQuickEntry: () => void }) {
  return <div className="toolbar" data-stub onClick={onQuickEntry} />;
}
