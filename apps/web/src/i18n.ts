import russian from './locales/ru.json';
import kazakhCore from './locales/kk-core.json';
import kazakhIssuer from './locales/kk-issuer.json';
import kazakhExtra from './locales/kk-extra.json';
import kazakhRuntime from './locales/kk-runtime.json';
import russianRuntime from './locales/ru-runtime.json';

export type UiLanguage = 'kk' | 'ru' | 'en';
export const UI_LANGUAGES = ['kk', 'ru', 'en'] as const;
export function isUiLanguage(value: unknown): value is UiLanguage {
  return typeof value === 'string' && (UI_LANGUAGES as readonly string[]).includes(value);
}
export function uiLocale(language: UiLanguage): string {
  return { kk: 'kk-KZ', ru: 'ru-RU', en: 'en-GB' }[language];
}
const kk: Record<string, string> = { ...kazakhIssuer, ...kazakhCore, ...kazakhExtra, ...kazakhRuntime };
const ru: Record<string, string> = { ...russian, ...russianRuntime };
export function translate(language: UiLanguage, english: string, explicitRussian?: string): string {
  if (language === 'ru') return explicitRussian ?? ru[english] ?? english;
  if (language === 'kk') return kk[english] ?? english;
  return english;
}
