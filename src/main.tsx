import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Silences unhandled WebSocket connection rejections or closed messages
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    if (reason && (
      (typeof reason === 'string' && (reason.toLowerCase().includes('websocket') || reason.toLowerCase().includes('vite'))) ||
      (reason.message && (reason.message.toLowerCase().includes('websocket') || reason.message.toLowerCase().includes('vite'))) ||
      (reason.stack && (reason.stack.toLowerCase().includes('websocket') || reason.stack.toLowerCase().includes('vite')))
    )) {
      console.warn('Silenced unhandled WebSocket rejection:', reason);
      event.preventDefault();
      event.stopPropagation();
    }
  });

  window.addEventListener('error', (event) => {
    const msg = event.message || '';
    if (msg.toLowerCase().includes('websocket') || msg.toLowerCase().includes('vite')) {
      console.warn('Silenced raw WebSocket error:', msg);
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
