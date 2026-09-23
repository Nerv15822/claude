import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@ui/App';
import '@ui/theme.css';

const root = document.getElementById('root');
if (!root) throw new Error('Elemento #root mancante');
// Service worker (solo in produzione): uso offline dopo la prima apertura
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
  });
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
