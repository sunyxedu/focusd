import React from 'react';
export function SettingsModal({ onClose }: { onClose: () => void }) {
  return <div className="modal-backdrop" onClick={onClose} />;
}
