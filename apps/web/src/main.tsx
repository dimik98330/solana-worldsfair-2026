import React from 'react';
import ReactDOM from 'react-dom/client';
import { AlertCircle } from 'lucide-react';
import { isUiLanguage, translate } from './i18n';
import '@fontsource-variable/manrope';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import App from './App';
import './styles.css';
import './operations-design.css';
import './workspace-shell.css';
import './interaction-controls.css';
import './premium.css';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    const savedLanguage = document.documentElement.lang;
    const language = isUiLanguage(savedLanguage) ? savedLanguage : 'en';
    if (this.state.failed) return <main className="fatal-error"><AlertCircle size={32} aria-hidden="true" /><h1>{translate(language,'The view could not load.','Не удалось загрузить страницу.')}</h1><p>{translate(language,'Your chain state remains the source of truth. Reload the view to read it again.','Обновите страницу, чтобы снова прочитать данные сети.')}</p><button className="button primary" onClick={() => window.location.reload()}>{translate(language,'Reload view','Обновить страницу')}</button></main>;
    return this.props.children;
  }
}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><ErrorBoundary><App /></ErrorBoundary></React.StrictMode>);
