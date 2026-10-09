import { useEffect, useState } from 'react';
import { ArrowRight, Info, ReceiptText } from 'lucide-react';
import { Address, Badge, Button, Money, ProofLink } from './components';
import { units } from './format';
import { useUiLanguage } from './ui-language';
import { useDisplayPreferences } from './display-preferences';
import { timeZoneLabel } from './time-zone';
import { matchesPayment, paymentReceipts, type PaymentSelection, type PublicTransaction } from './receipt-match';
import type { Activity, ChainState } from './types';
import { DisplayDate } from './DisplayDate';
import './voting-workspace.css';

export const receiptLabels:Record<string,[string,string]> = {
  initialize_issue:['Issue created','Выпуск создан'],initialize:['Issue created','Выпуск создан'],register_and_issue:['Bonds allocated','Облигации размещены'],issue_units:['Bonds allocated','Облигации размещены'],register_holder:['Holder registered','Держатель зарегистрирован'],
  fund_and_seal:['Reserve funded & issue activated','Резерв пополнен, выпуск активирован'],fund_vault:['Reserve funded','Резерв пополнен'],seal_issue:['Issue activated','Выпуск активирован'],capture_coupon:['Coupon rights recorded','Права на купон зафиксированы'],claim_coupon:['Coupon paid','Купон выплачен'],settle_coupon:['Coupon paid','Купон выплачен'],begin_redemption:['Redemption rights recorded','Права на погашение зафиксированы'],redeem_principal:['Principal repaid & bonds retired','Номинал возвращён, облигации погашены'],create_vote:['Voting opened','Голосование открыто'],cast_vote:['Ballot recorded','Голос учтён'],transfer_bonds:['Bonds transferred','Облигации переданы'],test_settlement_funding:['Test tokens supplied','Тестовые токены получены'],bootstrap:['Example prepared','Пример подготовлен'],
};
export function ReceiptList({state,filter,onInspect}:{state:ChainState;filter?:'coupon'|'principal'|'voting';onInspect?:(item:Activity)=>void}) {
  const {language}=useUiLanguage();
  const kinds=filter==='coupon'?['capture_coupon','claim_coupon','settle_coupon']:filter==='principal'?['begin_redemption','redeem_principal']:filter==='voting'?['create_vote','cast_vote']:undefined;
  const items=[...state.activity].filter(item=>!kinds||kinds.includes(item.kind)).sort((a,b)=>Date.parse(b.time)-Date.parse(a.time));
  return <ol className="semantic-receipts ecc-receipts">{items.length?items.map((item,index)=><li key={`${item.signature}-${index}`}>
    <ReceiptText size={20} aria-hidden="true"/><div className="receipt-copy"><strong>{receiptLabels[item.kind]?.[language==='ru'?1:0]??item.kind.replaceAll('_',' ')}</strong><DisplayDate value={item.time}/>
    <details><summary>{language==='ru'?'Транзакция и подтверждение':'Transaction & confirmation'}</summary><Address value={item.signature} full/>{item.slot!=null&&<p>{language==='ru'?'Блок':'Slot'} <span className="number">{units(item.slot)}</span></p>}<p>{item.verification==='live-rpc'?(language==='ru'?'Подтверждение проверено в текущей сети.':'Confirmation checked in the current network.'):(language==='ru'?'Сохранённая запись подтверждения; доступность истории сети может отличаться.':'Retained confirmation record; network history availability may differ.')}</p>{state.network==='devnet'&&<ProofLink url={item.explorerUrl} label={language==='ru'?'Открыть в Explorer':'Open in Explorer'}/>}</details>
    </div><div className="receipt-side"><Badge tone={['confirmed','finalized'].includes(item.status)?'success':'neutral'}>{['confirmed','finalized'].includes(item.status)?(language==='ru'?'Подтверждено':'Confirmed'):item.status}</Badge>{onInspect&&<Button variant="ghost" onClick={()=>onInspect(item)}>{language==='ru'?'Открыть':'View'}<ArrowRight size={16} aria-hidden="true"/></Button>}</div>
  </li>):<li className="receipt-list-empty"><ReceiptText size={22} aria-hidden="true"/><p>{language==='ru'?'Для этого действия пока нет сохранённых подтверждений.':'No retained receipts for this action yet.'}</p></li>}</ol>;
}

/** Read-only evidence enrichment. Missing transaction history never changes an entitlement status. */
async function readTransaction(state:ChainState,receipt:Activity,signal:AbortSignal):Promise<PublicTransaction|null> {
  if (state.readOnlySnapshot) return null;
  try {
    const response=await fetch(`/api/transactions/${encodeURIComponent(receipt.signature)}/proof`,{signal,cache:'no-store'});
    if(response.ok){const data=await response.json(),entry=data.executionProof,p=entry?.proof;
      if(entry?.matchesStoredReceipt&&p?.signature===receipt.signature&&p.commitment==='confirmed'&&Array.isArray(p.accountKeys))return {slot:p.slot,blockTime:p.blockTime,meta:{err:null,preTokenBalances:p.preTokenBalances,postTokenBalances:p.postTokenBalances},transaction:{signatures:[p.signature],message:{accountKeys:p.accountKeys}}};
    }
  } catch { if(signal.aborted)return null; }
  try {
    const url=new URL(state.rpcUrl);
    if(url.protocol!=='https:' && !(url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)))return null;
    const response=await fetch(url,{method:'POST',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getTransaction',params:[receipt.signature,{encoding:'jsonParsed',commitment:'confirmed',maxSupportedTransactionVersion:0}]})});
    const {result}=await response.json();
    return result?.meta&&Array.isArray(result?.transaction?.message?.accountKeys)?result:null;
  } catch { return null; }
}
export function ReceiptDetails({state,selection,onPortfolio,onAllReceipts}:{state:ChainState;selection:PaymentSelection;onPortfolio:()=>void;onAllReceipts:()=>void}) {
  const {language}=useUiLanguage(),{timeZone}=useDisplayPreferences();
  const tr=(en:string,ru:string)=>language==='ru'?ru:en;
  const [evidence,setEvidence]=useState<{loading:boolean;receipt?:Activity;transaction?:PublicTransaction}>({loading:selection.claimed});
  const holder=state.holders.find(item=>item.wallet===selection.wallet);
  useEffect(()=>{
    const controller=new AbortController();
    setEvidence({loading:selection.claimed});
    if(!selection.claimed||!state.instrument||!state.connected){setEvidence({loading:false});return ()=>controller.abort();}
    const timeout=window.setTimeout(()=>controller.abort(),12000);
    void (async()=>{
      const candidates=paymentReceipts(state.activity,selection).slice(0,24);
      // Bounded batches keep older histories inexpensive and avoid issuing all requests at once.
      for(let offset=0;offset<candidates.length&&!controller.signal.aborted;offset+=3){
        const batch=candidates.slice(offset,offset+3);
        const outcomes=await Promise.all(batch.map(async receipt=>({receipt,transaction:await readTransaction(state,receipt,controller.signal)})));
        if(controller.signal.aborted)return;
        const match=outcomes.find(item=>item.transaction&&matchesPayment(item.transaction,item.receipt,selection,state.instrument?.settlementMint??''));
        if(match?.transaction){window.clearTimeout(timeout);setEvidence({loading:false,...match,transaction:match.transaction});return;}
      }
      window.clearTimeout(timeout);if(!controller.signal.aborted)setEvidence({loading:false});
    })();
    controller.signal.addEventListener('abort',()=>setEvidence({loading:false}),{once:true});
    return ()=>{window.clearTimeout(timeout);controller.abort();};
  },[state.instrument?.address,selection.wallet,selection.snapshotAddress,selection.amountMinor,selection.claimed]);
  return <div className="dialog-body payment-detail ecc-payment-detail">
    <div className="receipt-beneficiary"><div><h3>{holder?.label??tr('Holder','Держатель')}</h3><Address value={selection.wallet}/></div><Badge tone={selection.claimed?'success':'neutral'}>{selection.claimed?tr('Paid','Выплачено'):tr('Not claimed','Не получено')}</Badge></div>
    <dl className="receipt-amount"><div><dt>{tr('Recorded bonds','Облигаций на дату фиксации')}</dt><dd className="number">{units(selection.units)}</dd></div>{selection.unitAmountMinor?<div><dt>{tr('Payment per bond','Выплата на облигацию')}</dt><dd><Money value={selection.unitAmountMinor}/></dd></div>:null}<div className="receipt-amount-total"><dt>{tr('Amount to holder','Сумма держателю')}<br/><small>{tr('Settlement units','Расчётные единицы')}</small></dt><dd><Money value={selection.amountMinor}/></dd></div></dl>
    <div className="receipt-date-group"><dl><div><dt>{tr('Rights recorded for','Права на дату')}</dt><dd><DisplayDate value={selection.recordAt}/></dd></div><div><dt>{tr('Payment date','Дата выплаты')}</dt><dd><DisplayDate value={selection.paymentAt}/></dd></div></dl><p className="zone-caption">{timeZoneLabel(timeZone,language)}</p></div>
    <section className="matched-receipt" aria-live="polite" aria-busy={evidence.loading}><h3><ReceiptText size={19} aria-hidden="true"/>{tr('Payment confirmation','Подтверждение выплаты')}</h3>{evidence.loading?<div><p role="status">{tr('Finding the transaction for this beneficiary…','Ищем транзакцию этого получателя…')}</p><div className="receipt-loading-state" aria-hidden="true"><span className="receipt-loading-line"/><span className="receipt-loading-line"/></div></div>:evidence.receipt?<><p>{tr('Matched to this holder, rights record and exact token amount.','Совпадает с держателем, записью прав и точной суммой перевода.')}</p><dl><div><dt>{tr('Action','Действие')}</dt><dd>{selection.kind==='coupon'?tr('Coupon paid','Купон выплачен'):tr('Principal repaid','Номинал возвращён')}</dd></div><div><dt>{tr('Observed confirmation','Подтверждение зафиксировано')}</dt><dd><DisplayDate value={evidence.receipt.time}/></dd></div></dl><details><summary>{tr('Transaction details','Детали транзакции')}</summary><Address value={evidence.receipt.signature} full/><p>{tr('Slot','Блок')} <span className="number">{units(evidence.transaction?.slot)}</span></p><Address value={selection.snapshotAddress} full/>{state.network==='devnet'&&<ProofLink url={evidence.receipt.explorerUrl} label={tr('Open in Explorer','Открыть в Explorer')}/>}</details></>:<div className="receipt-evidence-note"><Info size={18} aria-hidden="true"/><p>{selection.claimed?tr('The rights record is marked paid. A matching transaction is unavailable in retained history. Open issue receipts to inspect the saved confirmations.','В записи прав выплата отмечена полученной. Точная транзакция недоступна в сохранённой истории. Откройте подтверждения выпуска для просмотра сохранённых записей.'):tr('No payment has been confirmed for this entitlement.','Для этого права выплата ещё не подтверждена.')}</p></div>}</section>
    <div className="dialog-actions"><Button onClick={onPortfolio}>{tr('Holder portfolio','Портфель держателя')}<ArrowRight size={17} aria-hidden="true"/></Button><Button variant="primary" onClick={onAllReceipts}><ReceiptText size={18} aria-hidden="true"/>{tr('Issue receipts','Подтверждения выпуска')}</Button></div>
  </div>;
}
