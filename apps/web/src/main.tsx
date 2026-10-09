import React from 'react';
import ReactDOM from 'react-dom/client';
import { AlertCircle } from 'lucide-react';
import '@fontsource-variable/manrope';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import App from './App';
import './styles.css';
import './operations-design.css';
import './workspace-shell.css';
import './interaction-controls.css';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <main className="fatal-error"><AlertCircle size={32} aria-hidden="true" /><h1>The view could not load.</h1><p>Your chain state remains the source of truth. Reload the view to read it again.</p><button className="button primary" onClick={() => window.location.reload()}>Reload view</button></main>;
    return this.props.children;
  }
}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><ErrorBoundary><App /></ErrorBoundary></React.StrictMode>);
