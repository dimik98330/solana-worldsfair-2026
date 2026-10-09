import type { AnchorHTMLAttributes } from 'react';
import type { View } from './types';

interface WorkspaceLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick'> {
  view: View;
  holder?: string;
  onNavigate: () => void;
}

/** Native links preserve issue context and browser open-in-new-tab behavior. */
export function WorkspaceLink({ view, holder, onNavigate, ...props }: WorkspaceLinkProps) {
  const params = new URLSearchParams(location.search);
  params.set('view', view);
  if (holder) params.set('holder', holder);
  const href = `${location.pathname}?${params}${location.hash}`;
  return <a {...props} href={href} onClick={event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate();
  }} />;
}
