import { dateParts } from './time-zone';
import { useDisplayPreferences } from './display-preferences';
import { useUiLanguage } from './ui-language';

export function DisplayDate({value}:{value?:string}) {
  const {language}=useUiLanguage(),{timeZone}=useDisplayPreferences();
  if(!value)return <span>{language==='ru'?'Дата не назначена':'Not scheduled'}</span>;
  const parts=dateParts(value,timeZone,language);
  return <time className="display-date" dateTime={value} title={value}><span>{parts.date}</span>{' '}<span className="display-time">{parts.time}</span></time>;
}
