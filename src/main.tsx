import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import './components/navigation-layout.css';
import './components/menu-controls.css';
import './components/profile-banner.css';
import { registerServiceWorker } from './lib/pwa';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
);

// Caches the build so an installed blockplaySG opens without a network.
registerServiceWorker();
