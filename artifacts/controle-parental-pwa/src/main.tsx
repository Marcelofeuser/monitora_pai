import { createRoot } from 'react-dom/client';
import { Router as WouterRouter } from 'wouter';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';

import './index.css';

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <App />
    </WouterRouter>
  </ErrorBoundary>,
);
