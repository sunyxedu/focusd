import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { store } from './core/store';
import { installAppearance } from './core/appearance';
import './styles.css';

(window as unknown as { __focus: typeof store }).__focus = store;
installAppearance(store);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
