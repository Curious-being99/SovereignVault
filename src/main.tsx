import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

import { requestPersistentStorage } from './lib/storage';

// Silences unhandled WebSocket connection rejections or closed messages
if (typeof window !== 'undefined') {
  const originalError = console.error;
  console.error = (...args) => {
    if (args[0] && typeof args[0] === 'string' && (args[0].includes('[vite]') || args[0].includes('WebSocket'))) {
      return;
    }
    originalError(...args);
  };

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    if (reason && (
      (typeof reason === 'string' && (reason.toLowerCase().includes('websocket') || reason.toLowerCase().includes('vite'))) ||
      (reason.message && (reason.message.toLowerCase().includes('websocket') || reason.message.toLowerCase().includes('vite'))) ||
      (reason.stack && (reason.stack.toLowerCase().includes('websocket') || reason.stack.toLowerCase().includes('vite')))
    )) {
      event.preventDefault();
      event.stopPropagation();
    }
  });

  window.addEventListener('error', (event) => {
    const msg = event.message || '';
    if (msg.toLowerCase().includes('websocket') || msg.toLowerCase().includes('vite')) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  // Request persistent storage for unlimited offline quota on Android/PWA
  requestPersistentStorage().catch(console.warn);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
