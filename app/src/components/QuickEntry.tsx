import React from 'react';
export function QuickEntry({ onClose }: { onClose: () => void }) {
  return <div className="modal-backdrop" onClick={onClose} />;
}
