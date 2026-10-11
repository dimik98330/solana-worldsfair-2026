import { useMemo } from 'react';
import { useUiLanguage } from './ui-language';
import { useDisplayPreferences } from './display-preferences';
import { browserTimeZone, dateParts, timeZoneOptionGroups, timeZoneOptionLabel } from './time-zone';
import type { UiLanguage } from './i18n';
import './voting-workspace.css';
import './settings-premium.css';

export function InterfaceSettings({ now }: { now?: string }) {
  const { language, setLanguage, tr } = useUiLanguage();
  const { timeZone, preference, setTimeZone } = useDisplayPreferences();
  const zones = useMemo(() => {
    try { return [...new Set(['UTC', browserTimeZone(), timeZone, ...Intl.supportedValuesOf('timeZone')])].sort(); }
    catch { return [...new Set(['UTC', browserTimeZone(), timeZone, 'Asia/Almaty', 'Europe/London', 'Europe/Berlin', 'America/New_York'])]; }
  }, [timeZone]);
  const previewInstant = now ?? new Date().toISOString();
  const preview = dateParts(previewInstant, timeZone, language);
  const groups = useMemo(() => timeZoneOptionGroups(zones, language, new Date(previewInstant)), [zones, language, previewInstant]);

  return <div className="dialog-body interface-settings ecc-preferences settings-premium">
    <section className="preference-section">
      <div className="preference-heading">
        <label htmlFor="interface-language">{tr('Language', 'Язык')}</label>
      </div>
      <select id="interface-language" name="interface-language" value={language} onChange={event => setLanguage(event.target.value as UiLanguage)}><option value="kk">Қазақша</option><option value="ru">Русский</option><option value="en">English</option></select>
    </section>
    <section className="preference-section preference-timezone">
      <div className="preference-heading">
        <div><label htmlFor="interface-timezone">{tr('Time zone', 'Часовой пояс')}</label><p id="timezone-description">{tr('Payment times stay unchanged', 'Время выплат не меняется')}</p></div>
      </div>
      <select id="interface-timezone" name="interface-timezone" value={preference} aria-describedby="timezone-description" onChange={event => setTimeZone(event.target.value)}>
        <option value="auto">{tr('Auto', 'Авто')} · {timeZoneOptionLabel(browserTimeZone(), language, new Date(previewInstant))}</option>
        {groups.map(group => <optgroup key={group.label} label={group.label}>{group.options.map(({ zone, label }) => <option value={zone} key={zone}>{label}</option>)}</optgroup>)}
      </select>
    </section>
    <section className="preference-preview" aria-label={tr('Date display preview', 'Пример отображения даты')}>
      <span className="preference-preview-label">{tr('Date preview', 'Пример даты')}</span>
      <div className="preference-preview-value"><time dateTime={previewInstant} aria-live="polite"><span>{preview.date}</span><span className="preference-clock">{preview.time}</span></time><p>{timeZoneOptionLabel(timeZone, language, new Date(previewInstant))}</p></div>
    </section>
  </div>;
}
