import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './base.css';
import './marketing.css';
import './finder.css';
import './marketing-pages.css';
import './workspace.css';

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const swUrl=new URL('sw.js',new URL(import.meta.env.BASE_URL,window.location.href)).toString();
    navigator.serviceWorker.register(swUrl).catch(() => undefined);
  });
}

createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
