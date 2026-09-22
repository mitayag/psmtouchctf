import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App.tsx';
import './styles/global.css';

// Dev-only helper for Playwright verification of the 20-challenge bank.
if (import.meta.env.DEV) {
  void import('./services/challengeBank').then((m) => {
    (window as unknown as { __PSM_CHALLENGE_BANK__: typeof m.CHALLENGE_BANK }).__PSM_CHALLENGE_BANK__ = m.CHALLENGE_BANK;
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
