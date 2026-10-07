import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, ArrowUpRight, Check, Copy, ExternalLink, LoaderCircle, X } from 'lucide-react';
import { amount, rawAmount, safeExplorer, shortAddress } from './format';

export function Button({ children, className = '', variant = 'secondary', busy = false, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost'; busy?: boolean }) {
  return <button type="button" className={`button ${variant} ${className}`} aria-busy={busy || undefined} {...props}>{busy && <LoaderCircle size={16} className="spin" aria-hidden="true" />}{children}</button>;
}
export function Money({ value, unit = false, className = '' }: { value?: string | null; unit?: boolean; className?: string }) {
  return <span className={`money ${className}`} title={rawAmount(value) || 'No chain data'} aria-label={value == null ? 'No chain data' : `${rawAmount(value)} test settlement units`}>{amount(value)}{unit && <span className="currency"> test units</span>}</span>;
}
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'blue' | 'success' | 'warning' | 'error' }) { return <span className={`badge ${tone}`}>{children}</span>; }
export function Address({ value, full = false }: { value?: string; full?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  async function copy() {
    if (!value) return;
    try { await navigator.clipboard.writeText(value); setCopied(true); setError(''); window.setTimeout(() => setCopied(false), 1800); }
    catch { setError('Select and copy the address below.'); }
  }
  return <span className={`address ${full ? 'full' : ''}`}><span title={value}>{full ? value || 'Not available' : shortAddress(value)}</span>{value && <button type="button" className="icon-button copy" onClick={copy} aria-label={copied ? 'Address copied' : 'Copy full address'} title="Copy full address">{copied ? <Check size={14} /> : <Copy size={14} />}</button>}{error && <small role="status">{error}<code>{value}</code></small>}</span>;
}
export function ProofLink({ url, label = 'View transaction' }: { url?: string; label?: string }) { const href = safeExplorer(url); return href ? <a className="text-link" href={href} target="_blank" rel="noreferrer">{label}<ExternalLink size={14} aria-hidden="true" /></a> : null; }
export function Panel({ title, label, action, children, className = '' }: { title?: string; label?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{title && <div className="panel-heading"><div>{label && <p className="eyebrow">{label}</p>}<h2>{title}</h2></div>{action}</div>}{children}</section>;
}
export function Empty({ title, description, action, icon }: { title: string; description: string; action?: ReactNode; icon?: ReactNode }) {
  return <div className="empty-state">{icon && <span className="empty-icon">{icon}</span>}<h3>{title}</h3><p>{description}</p>{action}</div>;
}
export function ErrorNotice({ message, action }: { message: string; action?: ReactNode }) { return <div className="notice error" role="alert"><AlertCircle size={19} aria-hidden="true" /><div><strong>State unavailable</strong><p>{message}</p>{action}</div></div>; }
export function Overlay({ open, onClose, title, children, drawer = false, eyebrow }: { open: boolean; onClose: () => void; title: string; children: ReactNode; drawer?: boolean; eyebrow?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => { const dialog = ref.current; if (!dialog) return; if (open && !dialog.open) dialog.showModal(); if (!open && dialog.open) dialog.close(); }, [open]);
  return <dialog ref={ref} className={drawer ? 'dialog drawer' : 'dialog'} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === ref.current) onClose(); }}><div className="dialog-head"><div><p className="eyebrow">{eyebrow || (drawer ? 'Proof & activity' : 'Transaction review')}</p><h2 id={titleId}>{title}</h2></div><button className="icon-button" type="button" aria-label="Close dialog" onClick={onClose}><X size={20} /></button></div>{children}</dialog>;
}
export function SectionLink({ children, onClick }: { children: ReactNode; onClick: () => void }) { return <button className="text-link" type="button" onClick={onClick}>{children}<ArrowUpRight size={16} aria-hidden="true" /></button>; }
