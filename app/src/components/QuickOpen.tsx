import React from 'react';
export function QuickOpen({ onClose }: { onClose: () => void }) {
  return <div className="modal-backdrop" onClick={onClose} />;
}
