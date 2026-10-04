import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import './index.css';
import './lib/i18n';
import { initMonitoring } from './lib/monitoring';
import { initTelegram } from './lib/telegram';

initTelegram();
void initMonitoring();

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
