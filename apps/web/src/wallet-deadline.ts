export class WalletRequestTimeout extends Error {
  constructor(){super('The wallet did not finish this request before the review expired. No transaction was relayed. Close the old wallet prompt and prepare a fresh review.');this.name='WalletRequestTimeout';}
}
/** A late wallet response must never resume the caller's relay after timeout. */
export async function withWalletDeadline<T>(request:()=>Promise<T>,timeoutMs=90000):Promise<T>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([Promise.resolve().then(request),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new WalletRequestTimeout()),timeoutMs);})]);}
  finally{if(timer!==undefined)clearTimeout(timer);}
}
