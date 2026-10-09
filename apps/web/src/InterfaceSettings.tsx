import { useMemo } from 'react';
import { Clock3, Globe2, Languages } from 'lucide-react';
import { useUiLanguage } from './ui-language';
import { useDisplayPreferences } from './display-preferences';
import { browserTimeZone, dateParts, timeZoneLabel } from './time-zone';
import './voting-workspace.css';

export function InterfaceSettings({ now }: { now?: string }) {
  const { language, setLanguage } = useUiLanguage();
  const { timeZone, preference, setTimeZone } = useDisplayPreferences();
  const tr = (en: string, ru: string) => language === 'ru' ? ru : en;
  const zones = useMemo(() => {
    try { return [...new Set(['UTC', browserTimeZone(), timeZone, ...Intl.supportedValuesOf('timeZone')])].sort(); }
    catch { return [...new Set(['UTC', browserTimeZone(), timeZone, 'Asia/Almaty', 'Europe/London', 'Europe/Berlin', 'America/New_York'])]; }
  }, [timeZone]);
  const preview = dateParts(now ?? new Date().toISOString(), timeZone, language);

  return <div className="dialog-body interface-settings ecc-preferences">
    <section className="preference-section"><div className="preference-heading"><Languages size={20} aria-hidden="true" /><label htmlFor="interface-language">{tr('Language', 'Язык')}</label></div><select id="interface-language" name="interface-language" value={language} onChange={event => setLanguage(event.target.value as 'en' | 'ru')}><option value="en">English</option><option value="ru">Русский</option></select></section>
    <section className="preference-section"><div className="preference-heading"><Globe2 size={20} aria-hidden="true" /><label htmlFor="interface-timezone">{tr('Time zone', 'Часовой пояс')}</label></div><select id="interface-timezone" name="interface-timezone" value={preference} aria-describedby="timezone-description" onChange={event => setTimeZone(event.target.value)}><option value="auto">{tr('Automatic', 'Автоматически')} · {timeZoneLabel(browserTimeZone(), language)}</option>{zones.map(zone => <option value={zone} key={zone}>{timeZoneLabel(zone, language)} · {zone}</option>)}</select><p id="timezone-description">{tr('Display preference only. Scheduled payment times stay unchanged.', 'Только отображение. Моменты запланированных выплат не меняются.')}</p></section>
    <section className="preference-preview" aria-label={tr('Date display preview', 'Пример отображения даты')}><div><Clock3 size={18} aria-hidden="true" /><span>{tr('Date display', 'Отображение даты')}</span></div><time dateTime={now} aria-live="polite"><span>{preview.date}</span><strong className="preference-clock">{preview.time}</strong></time><p>{timeZoneLabel(timeZone, language)}</p></section>
  </div>;
}
