import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getPref, type LanguagePref } from '@/data/prefs';
import de from './locales/de.json';
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import itDict from './locales/it.json';
import ja from './locales/ja.json';

export const supportedLanguages = ['en', 'de', 'es', 'fr', 'it', 'ja'] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

function systemLanguage(): SupportedLanguage {
  const tag = Intl.DateTimeFormat().resolvedOptions().locale ?? 'en';
  const lang = tag.split('-')[0]?.toLowerCase();
  return (supportedLanguages as readonly string[]).includes(lang ?? '') ? (lang as SupportedLanguage) : 'en';
}

export function resolveLanguage(pref: LanguagePref): SupportedLanguage {
  return pref === 'system' ? systemLanguage() : pref;
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    de: { translation: de },
    es: { translation: es },
    fr: { translation: fr },
    it: { translation: itDict },
    ja: { translation: ja },
  },
  lng: resolveLanguage(getPref('language')),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
