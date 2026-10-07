/** Discard responses from a prior instrument selection, even after A → B → A. */
export function createScopedReader<T>(load:(key:string,signal:AbortSignal)=>Promise<T>,initial='') {
  let selected=initial,revision=0,controller:AbortController|undefined;
  return {
    select(key:string){if(key!==selected){selected=key;revision++;controller?.abort();}},
    async read(key:string){
      if(key!==selected)return {kind:'obsolete' as const};
      controller?.abort();const current=new AbortController();controller=current;const version=++revision;
      try{const value=await load(key,current.signal);return version===revision&&key===selected&&!current.signal.aborted?{kind:'current' as const,value,version}:{kind:'obsolete' as const};}
      catch(error){return version===revision&&key===selected&&!current.signal.aborted?{kind:'error' as const,error,version}:{kind:'obsolete' as const};}
    },
    current(version:number){return version===revision;},
  };
}
