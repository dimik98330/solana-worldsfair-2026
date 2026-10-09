import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, ArrowUpRight, Check, Copy, ExternalLink, LoaderCircle, X } from 'lucide-react';
import { amount, rawAmount, safeExplorer, shortAddress } from './format';
import { useUiLanguage } from './ui-language';

export function Button({ children, className = '', variant = 'secondary', busy = false, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost'; busy?: boolean }) {
  return <button type="button" className={`button ${variant} ${className}`} aria-busy={busy || undefined} {...props}>{busy && <LoaderCircle size={16} className="spin" aria-hidden="true" />}{children}</button>;
}
export function Money({ value, unit = false, className = '' }: { value?: string | null; unit?: boolean; className?: string }) {
  const {language}=useUiLanguage();
  const raw = rawAmount(value);
  return <span className={`money ${className}`} title={raw || (language==='ru'?'Нет данных сети':'No chain data')} aria-label={raw ? `${raw} ${language==='ru'?'расчётных единиц':'settlement units'}` : language==='ru'?'Нет данных сети':'No chain data'}>{amount(value)}{unit && <span className="currency"> {language==='ru'?'ед.':'units'}</span>}</span>;
}
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'blue' | 'success' | 'warning' | 'error' }) { return <span className={`badge ${tone}`}>{children}</span>; }
export function Address({ value, full = false }: { value?: string; full?: boolean }) {
  const {language}=useUiLanguage();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const copyTimer = useRef<number | null>(null);
  useEffect(() => () => { if (copyTimer.current !== null) window.clearTimeout(copyTimer.current); }, []);
  async function copy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setError('');
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => { setCopied(false); copyTimer.current = null; }, 1800);
    }
    catch { setError(language==='ru'?'Выделите и скопируйте адрес ниже.':'Select and copy the address below.'); }
  }
  return <span className={`address ${full ? 'full' : ''}`}><span title={value} translate="no">{full ? value || 'Not available' : shortAddress(value)}</span>{value && <button type="button" className="icon-button copy" onClick={copy} aria-label={copied ? (language==='ru'?'Адрес скопирован':'Address copied') : (language==='ru'?'Скопировать полный адрес':'Copy full address')} title={copied ? (language==='ru'?'Адрес скопирован':'Address copied') : (language==='ru'?'Скопировать полный адрес':'Copy full address')}>{copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}</button>}<span className="sr-only" role="status">{copied ? (language==='ru'?'Адрес скопирован':'Address copied') : ''}</span>{error && <small role="status">{error}<code>{value}</code></small>}</span>;
}
export function ProofLink({ url, label = 'View transaction' }: { url?: string; label?: string }) { const href = safeExplorer(url); return href ? <a className="text-link" href={href} target="_blank" rel="noreferrer">{label}<ExternalLink size={14} aria-hidden="true" /></a> : null; }
export function Panel({ title, label, action, children, className = '' }: { title?: string; label?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{title && <div className="panel-heading"><div><h2>{title}</h2>{label && <p className="panel-description">{label}</p>}</div>{action}</div>}{children}</section>;
}
export function Empty({ title, description, action, icon }: { title: string; description: string; action?: ReactNode; icon?: ReactNode }) {
  return <div className="empty-state">{icon && <span className="empty-icon">{icon}</span>}<h3>{title}</h3><p>{description}</p>{action}</div>;
}
export function ErrorNotice({ message, action }: { message: string; action?: ReactNode }) { const {language}=useUiLanguage(); return <div className="notice error" role="alert"><AlertCircle size={19} aria-hidden="true" /><div><strong>{language==='ru'?'Данные недоступны':'State unavailable'}</strong><p>{message}</p>{action}</div></div>; }
export function Overlay({ open, onClose, title, children, drawer = false, eyebrow, closeDisabled = false, className = '' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; drawer?: boolean; eyebrow?: string; closeDisabled?: boolean; className?: string }) {
  const {language}=useUiLanguage();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => { const dialog = ref.current; if (!dialog) return; if (open && !dialog.open) dialog.showModal(); if (!open && dialog.open) dialog.close(); }, [open]);
  return <dialog ref={ref} className={`dialog${drawer ? ' drawer' : ''}${className ? ` ${className}` : ''}`} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); if (!closeDisabled) onClose(); }} onClick={(event) => { if (event.target === ref.current && !closeDisabled) onClose(); }}><div className="dialog-head"><div><h2 id={titleId}>{title}</h2>{eyebrow && <p className="dialog-description">{eyebrow}</p>}</div><button className="icon-button" type="button" aria-label={language==='ru'?'Закрыть окно':'Close dialog'} title={closeDisabled ? (language==='ru'?'Дождитесь завершения операции':'Wait for the current operation to finish') : (language==='ru'?'Закрыть окно':'Close dialog')} disabled={closeDisabled} onClick={onClose}><X size={20} aria-hidden="true" /></button></div>{children}</dialog>;
}
export function SectionLink({ children, onClick }: { children: ReactNode; onClick: () => void }) { return <button className="text-link" type="button" onClick={onClick}>{children}<ArrowUpRight size={16} aria-hidden="true" /></button>; }
