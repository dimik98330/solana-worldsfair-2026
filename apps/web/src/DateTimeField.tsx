import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock3, X } from 'lucide-react';
import { DayPicker, type ChevronProps, type Matcher } from 'react-day-picker';
import { enGB, ru } from 'react-day-picker/locale';
import { localDateTimeOutOfBounds, normalizeTimeSegment, readLocalDateTime, writeLocalDateTime } from './date-time-value';
import { getDisplayTimeZone, timeZoneLabel, wallTimeIssue, zonedInput } from './time-zone';
import 'react-day-picker/style.css';
import './date-time-field.css';

export interface DateTimeFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  disabled?: boolean;
  language?: 'ru' | 'en';
  timeZone?: string;
  /** Optional limits in the displayed zone; schedule validation remains the parent's authority. */
  min?: string;
  max?: string;
}

const copy = {
  en: {
    choose: 'Choose date and time', edit: 'Change date and time', close: 'Close calendar',
    date: 'Date', time: 'Time · 24 hours', hour: 'Hours', minute: 'Minutes',
    cancel: 'Cancel', apply: 'Save date', empty: 'Choose a date', selected: 'Selected',
    invalidHour: 'Enter an hour from 00 to 23.', invalidMinute: 'Enter minutes from 00 to 59.',
    instruction: 'Use arrow keys to move between days. Enter selects a date.',
    invalid: 'This time is skipped by daylight saving. Choose another time.',
    ambiguous: 'This time occurs twice when clocks change. Choose another time.', zone: 'Time zone',
    minimum: 'Choose a date and time on or after', maximum: 'Choose a date and time on or before',
    unavailable: 'The calendar could not open. Try opening it again.', calendar: 'Calendar',
  },
  ru: {
    choose: 'Выбрать дату и время', edit: 'Изменить дату и время', close: 'Закрыть календарь',
    date: 'Дата', time: 'Время · 24 часа', hour: 'Часы', minute: 'Минуты',
    cancel: 'Отмена', apply: 'Сохранить дату', empty: 'Выберите дату', selected: 'Выбрано',
    invalidHour: 'Введите часы от 00 до 23.', invalidMinute: 'Введите минуты от 00 до 59.',
    instruction: 'Стрелки перемещают между днями. Enter выбирает дату.',
    invalid: 'Это время пропущено при переводе часов. Выберите другое время.',
    ambiguous: 'При переводе часов это время наступает дважды. Выберите другое время.', zone: 'Часовой пояс',
    minimum: 'Выберите дату и время не раньше', maximum: 'Выберите дату и время не позже',
    unavailable: 'Календарь не открылся. Попробуйте открыть его снова.', calendar: 'Календарь',
  },
} as const;

function CalendarChevron({ orientation, className, style }: ChevronProps) {
  const Icon = orientation === 'left' ? ChevronLeft : orientation === 'right' ? ChevronRight : orientation === 'up' ? ChevronUp : ChevronDown;
  return <Icon size={18} strokeWidth={1.75} className={className} style={style} aria-hidden="true" />;
}

function formatValue(value: string, language: 'ru' | 'en', timeZone: string): { date: string; time: string } | null {
  const parts = readLocalDateTime(value, timeZone, true);
  if (!parts) return null;
  return {
    date: new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(parts.date),
    time: `${parts.hour}:${parts.minute}${parts.seconds || ':00'}`,
  };
}

export function DateTimeField({ id, label, value, onChange, error, hint, disabled = false, language = 'en', timeZone = getDisplayTimeZone(), min, max }: DateTimeFieldProps) {
  const text = copy[language];
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const hourInput = useRef<HTMLInputElement>(null);
  const minuteInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Date>();
  const [month, setMonth] = useState(() => new Date());
  const [hour, setHour] = useState('12');
  const [minute, setMinute] = useState('00');
  const [seconds, setSeconds] = useState('');
  const [openError, setOpenError] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const display = formatValue(value, language, timeZone);
  const normalizedHour = normalizeTimeSegment(hour, 23);
  const normalizedMinute = normalizeTimeSegment(minute, 59);
  const draft = writeLocalDateTime(selected, normalizedHour || '', normalizedMinute || '', seconds, timeZone, true);
  const issue = draft ? wallTimeIssue(draft, timeZone) : null;
  const draftDisplay = draft ? formatValue(draft, language, timeZone) : null;
  const bound = draft ? localDateTimeOutOfBounds(draft, min, max, timeZone) : null;
  const boundValue = bound ? formatValue((bound === 'min' ? min : max) || '', language, timeZone) : null;
  const invalidDraft = !selected ? text.empty : !normalizedHour ? text.invalidHour : !normalizedMinute ? text.invalidMinute : issue === 'ambiguous' && draft !== value ? text.ambiguous : !draft ? text.invalid : bound && boundValue
    ? `${bound === 'min' ? text.minimum : text.maximum} ${boundValue.date}, ${boundValue.time}.`
    : '';
  const draftError = attempted ? invalidDraft : '';
  const minimum = min ? readLocalDateTime(min, timeZone) : null;
  const maximum = max ? readLocalDateTime(max, timeZone) : null;
  const disabledDays: Matcher[] = [];
  if (minimum) disabledDays.push({ before: minimum.date });
  if (maximum) disabledDays.push({ after: maximum.date });
  const currentYear = new Date().getFullYear();
  // Explicit range avoids DayPicker dropdowns defaulting to past years only.
  const startMonth = minimum?.date || new Date(Math.min(currentYear - 100, month.getFullYear()), 0, 1);
  const endMonth = maximum?.date || new Date(Math.max(currentYear + 100, month.getFullYear()), 11, 31);
  const descriptionIds = [hint ? `${id}-hint` : '', error || openError ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;

  useLayoutEffect(() => {
    if (!open || !dialog.current) return;
    try {
      if (!dialog.current.open) dialog.current.showModal();
      // The native dialog traps focus; DayPicker supplies its arrow-key day navigation.
      dialog.current.querySelector<HTMLButtonElement>('.rdp-day_button[tabindex="0"]')?.focus();
    } catch {
      setOpen(false);
      setOpenError(true);
    }
  }, [open]);

  useEffect(() => {
    if (disabled && dialog.current?.open) dialog.current.close();
  }, [disabled]);
  // Zone preferences can change outside this field; close a stale calendar draft.
  useEffect(() => { if (dialog.current?.open) dialog.current.close(); }, [timeZone]);

  function begin() {
    const parts = readLocalDateTime(value, timeZone, true);
    const now = new Date();
    const zonedNow = readLocalDateTime(zonedInput(Math.floor(now.getTime() / 1000), timeZone), timeZone, true);
    setSelected(parts?.date);
    setMonth(parts?.date || minimum?.date || zonedNow?.date || now);
    setHour(parts?.hour || zonedNow?.hour || '12');
    setMinute(parts?.minute || zonedNow?.minute || '00');
    setSeconds(parts?.seconds || '');
    setAttempted(false);
    setOpenError(false);
    setOpen(true);
  }

  function close() { dialog.current?.close(); }
  function apply() {
    setAttempted(true);
    if (disabled) return;
    if (invalidDraft || !draft) {
      if (!selected) dialog.current?.querySelector<HTMLButtonElement>('.rdp-day_button[tabindex="0"]')?.focus();
      else if (!normalizedHour) hourInput.current?.focus();
      else if (!normalizedMinute || !draft || bound) minuteInput.current?.focus();
      return;
    }
    onChange(draft);
    close();
  }

  return <div className="date-time-field">
    <label className="date-time-label" htmlFor={id}>{label}</label>
    <button type="button" id={id} ref={trigger} className="date-time-trigger" disabled={disabled}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={`${id}-dialog`}
      aria-invalid={error ? true : undefined} aria-describedby={descriptionIds}
      aria-label={`${label}: ${display ? `${display.date}, ${display.time}. ${text.edit}` : text.choose}`}
      onClick={begin}>
      <CalendarDays size={20} strokeWidth={1.75} aria-hidden="true" />
      {display ? <span className="date-time-value"><span className="date-time-date">{display.date}</span><span className="date-time-clock">{display.time}</span></span> : <span className="date-time-placeholder">{text.choose}</span>}
      <ChevronDown size={17} strokeWidth={1.75} className="date-time-trigger-arrow" aria-hidden="true" />
    </button>
    {hint && <p className="date-time-hint" id={`${id}-hint`}>{hint}</p>}
    {(error || openError) && <p className="date-time-error" id={`${id}-error`} role="alert">{error || text.unavailable}</p>}
    <dialog id={`${id}-dialog`} ref={dialog} className="date-time-dialog" aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-instructions`} onClose={() => { setOpen(false); trigger.current?.focus(); }}>
      {open && <>
        <div className="date-time-dialog-heading"><h2 id={`${id}-title`}>{label}</h2><button type="button" className="date-time-close" aria-label={text.close} onClick={close}><X size={19} strokeWidth={1.75} aria-hidden="true" /></button></div>
        <p className="date-time-zone"><Clock3 size={16} aria-hidden="true" /><span>{text.zone}: <strong>{timeZoneLabel(timeZone, language)}</strong></span></p>
        <p className="sr-only" id={`${id}-instructions`}>{text.instruction}</p>
        <div className="date-time-scroll">
        <DayPicker className="date-time-calendar" mode="single" required selected={selected} onSelect={date => { setSelected(date); setAttempted(false); }}
          month={month} onMonthChange={setMonth} startMonth={startMonth} endMonth={endMonth}
          captionLayout="dropdown" navLayout="after" fixedWeeks showOutsideDays autoFocus
          locale={language === 'ru' ? ru : enGB} weekStartsOn={1} disabled={disabledDays}
          role="application" aria-label={`${text.calendar}, ${new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-GB', { month: 'long', year: 'numeric' }).format(month)}`}
          components={{ Chevron: CalendarChevron }} />
        <fieldset className="date-time-controls"><legend><Clock3 size={17} strokeWidth={1.75} aria-hidden="true" />{text.time}</legend>
          <div className="date-time-time-row">
            <label htmlFor={`${id}-hour`}>{text.hour}<input ref={hourInput} id={`${id}-hour`} name={`${id}-hour`} type="text" inputMode="numeric" autoComplete="off" maxLength={2} value={hour}
              aria-invalid={attempted && !normalizedHour || undefined} aria-describedby={draftError ? `${id}-draft-error` : undefined}
              onFocus={event => event.currentTarget.select()} onChange={event => { setHour(event.target.value); setAttempted(false); }}
              onBlur={() => { if (normalizedHour) setHour(normalizedHour); }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); apply(); } }} /></label>
            <span className="date-time-separator" aria-hidden="true">:</span>
            <label htmlFor={`${id}-minute`}>{text.minute}<input ref={minuteInput} id={`${id}-minute`} name={`${id}-minute`} type="text" inputMode="numeric" autoComplete="off" maxLength={2} value={minute}
              aria-invalid={attempted && !normalizedMinute || undefined} aria-describedby={draftError ? `${id}-draft-error` : undefined}
              onFocus={event => event.currentTarget.select()} onChange={event => { setMinute(event.target.value); setAttempted(false); }}
              onBlur={() => { if (normalizedMinute) setMinute(normalizedMinute); }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); apply(); } }} /></label>
          </div>
        </fieldset>
        </div>
        <p className="date-time-selection" aria-live="polite" aria-atomic="true">{draftDisplay ? <><span>{text.selected}</span><strong>{draftDisplay.date}<span>{draftDisplay.time}</span></strong></> : text.empty}</p>
        {draftError && <p className="date-time-error" id={`${id}-draft-error`} role="alert">{draftError}</p>}
        <div className="date-time-dialog-actions"><button type="button" className="date-time-cancel" onClick={close}>{text.cancel}</button><button type="button" className="date-time-apply" onClick={apply} disabled={disabled}>{text.apply}</button></div>
      </>}
    </dialog>
  </div>;
}
