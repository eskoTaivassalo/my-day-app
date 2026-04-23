import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Language, TranslationKey, translationsMap } from '../i18n/translations';

const LANGUAGE_STORAGE_KEY = '@mydays_language';

/** Detect device locale and map to supported language */
function detectDeviceLanguage(): Language {
  try {
    const locale =
      (Intl.DateTimeFormat().resolvedOptions().locale ?? '').toLowerCase();
    if (locale.startsWith('sv')) return 'sv';
    if (locale.startsWith('en')) return 'en';
    // Finnish is default
    return 'fi';
  } catch {
    return 'fi';
  }
}

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('fi');
  const manualLanguageSetRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
        if (!mounted || manualLanguageSetRef.current) return;

        if (stored === 'fi' || stored === 'en' || stored === 'sv') {
          setLanguageState(stored);
          return;
        }

        // First launch: use device locale
        const detected = detectDeviceLanguage();
        setLanguageState(detected);
      } catch {
        if (mounted && !manualLanguageSetRef.current) {
          setLanguageState(detectDeviceLanguage());
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const setLanguage = useCallback(async (lang: Language) => {
    manualLanguageSetRef.current = true;
    setLanguageState(lang);
    try {
      await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    } catch {
      // ignore storage errors
    }
  }, []);

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>): string => {
      const dict = translationsMap[language];
      let value: string = (dict as any)[key] ?? (translationsMap.fi as any)[key] ?? key;
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          value = value.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
        });
      }
      return value;
    },
    [language],
  );

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextType {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used inside LanguageProvider');
  return ctx;
}
