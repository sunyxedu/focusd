import React from 'react';
import { store, useSnapshot } from '../core/store';
export function Content() {
  const snap = useSnapshot();
  return <div className="content" data-stub><h1 style={{ color: 'var(--c-accent)', margin: 16 }}>{snap?.content.title}</h1></div>;
}
export function newItemInContext(): void {
  void store.api.addTask({ name: '' });
}
