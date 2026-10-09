import { useEffect, useId, useRef, type ReactNode } from 'react';
import { ArrowRight, Settings2, UsersRound, Wallet } from 'lucide-react';
import { Button } from './components';
import { shortAddress } from './format';
import { useUiLanguage } from './ui-language';
import type { ChainState } from './types';
import './account-picker.css';

interface AccountPickerProps {
  open: boolean;
  holders: ChainState['holders'];
  selectedHolder?: string;
  onHolder: (wallet: string) => void;
  onSettings: () => void;
  onClose: () => void;
  children: ReactNode;
}

export function AccountPicker({ open, holders, selectedHolder, onHolder, onSettings, onClose, children }: AccountPickerProps) {
  const { language } = useUiLanguage();
  const ru = language === 'ru';
  const holderHeading = useId();
  const walletHeading = useId();
  const holderList = useRef<HTMLDivElement>(null);
  const selectedOption = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const list = holderList.current;
      const option = selectedOption.current;
      if (!list || !option || list.scrollHeight <= list.clientHeight) return;
      const viewport = list.getBoundingClientRect();
      const row = option.getBoundingClientRect();
      // Only the holder list scrolls; the background page and wallet pane stay put.
      if (row.bottom > viewport.bottom) list.scrollTop += row.bottom - viewport.bottom;
      else if (row.top < viewport.top) list.scrollTop -= viewport.top - row.top;
    });
    return () => cancelAnimationFrame(frame);
  }, [open, selectedHolder]);
  return <>
    <div className="account-picker" data-has-holders={holders.length > 0}>
      {holders.length > 0 && <section className="account-holder-section" aria-labelledby={holderHeading}>
        <div className="account-area-heading"><UsersRound size={22} aria-hidden="true" /><h3 id={holderHeading}>{ru ? 'Портфели держателей' : 'Holder portfolios'}</h3></div>
        <p className="account-area-description">{ru ? 'Просмотр позиций и выплат без права подписи.' : 'Inspect positions and payments without signing rights.'}</p>
        <div ref={holderList} className="account-holder-list" role="group" aria-label={ru ? 'Держатели выпуска' : 'Issue holders'}>
          {holders.map(holder => {
            const selected = holder.wallet === selectedHolder;
            return <button ref={selected ? selectedOption : undefined} type="button" className="account-holder-option" key={holder.wallet} aria-current={selected ? 'true' : undefined} aria-label={`${ru ? 'Открыть портфель:' : 'View portfolio:'} ${holder.label || shortAddress(holder.wallet)}`} onClick={() => onHolder(holder.wallet)}>
              <span className="account-holder-avatar"><UsersRound size={19} aria-hidden="true" /></span>
              <span className="account-holder-identity"><strong>{holder.label || shortAddress(holder.wallet)}</strong><span className="account-holder-address" title={holder.wallet}>{shortAddress(holder.wallet, 5)}</span></span>
              <span className="account-holder-action">{selected ? (ru ? 'Выбран' : 'Selected') : (ru ? 'Открыть' : 'View')}<ArrowRight size={17} aria-hidden="true" /></span>
            </button>;
          })}
        </div>
      </section>}
      <section className="account-wallet-section" aria-labelledby={walletHeading}>
        <div className="account-area-heading"><Wallet size={22} aria-hidden="true" /><h3 id={walletHeading}>{ru ? 'Ваш кошелёк' : 'Your wallet'}</h3></div>
        <p className="account-area-description">{ru ? 'Каждую операцию подтверждайте в своём кошельке.' : 'Approve each operation in your wallet.'}</p>
        <div className="account-wallet-content">{children}</div>
      </section>
    </div>
    <footer className="account-dialog-footer">
      <Button onClick={onSettings}><Settings2 size={19} aria-hidden="true" /><span>{ru ? 'Настройки интерфейса' : 'Interface settings'}</span></Button>
      <Button onClick={onClose}>{ru ? 'Закрыть' : 'Close'}</Button>
    </footer>
  </>;
}
