import { Language } from './translations';

export const LANGUAGE_TO_LOCALE: Record<Language, string> = {
  fi: 'fi-FI',
  en: 'en-US',
  sv: 'sv-SE',
};

export const getLocaleFromLanguage = (language: Language): string => {
  return LANGUAGE_TO_LOCALE[language] ?? 'fi-FI';
};
