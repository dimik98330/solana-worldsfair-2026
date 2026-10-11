import {createContext, useContext, useEffect, useState, type ReactNode} from 'react';
import {isUiLanguage, translate, type UiLanguage} from './i18n';
export type {UiLanguage} from './i18n';
const Context=createContext({language:'en' as UiLanguage,setLanguage:(_language:UiLanguage)=>{},t:(text:string)=>text,tr:(en:string,_ru:string)=>en});
export function UiLanguageProvider({children}:{children:ReactNode}){
  const [language,setLanguage]=useState<UiLanguage>(()=>{try{const saved=localStorage.getItem('bondtrace.language');return isUiLanguage(saved)?saved:'en';}catch{return 'en';}});
  useEffect(()=>{document.documentElement.lang=language;try{localStorage.setItem('bondtrace.language',language);}catch{}},[language]);
  return <Context.Provider value={{language,setLanguage,t:(text)=>translate(language,text),tr:(en,ru)=>translate(language,en,ru)}}>{children}</Context.Provider>;
}
export const useUiLanguage=()=>useContext(Context);
