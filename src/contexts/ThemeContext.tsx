import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const THEME_STORAGE_KEY = '@mydays_theme_settings';

export type ThemeId = 'classic' | 'sunset' | 'forest' | 'midnight' | 'custom';

export interface ThemeColors {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  secondary: string;
  accent: string;
  background: string;
  backgroundLight: string;
  text: string;
  textSecondary: string;
  border: string;
  white: string;
}

export interface ThemeFonts {
  headingFamily?: string;
  bodyFamily?: string;
}

export interface AppTheme {
  id: ThemeId;
  name: string;
  description: string;
  descriptions: { fi: string; en: string; sv: string };
  colors: ThemeColors;
  fonts: ThemeFonts;
}

type FontOption = {
  id: string;
  label: string;
  headingFamily?: string;
  bodyFamily?: string;
};

interface ThemeContextType {
  theme: AppTheme;
  activeThemeId: ThemeId;
  themePresets: AppTheme[];
  setActiveTheme: (id: ThemeId) => Promise<void>;
  customThemeDraft: Pick<AppTheme, 'colors' | 'fonts'>;
  updateCustomColors: (updates: Partial<ThemeColors>) => Promise<void>;
  setCustomFontOption: (optionId: string) => Promise<void>;
  colorOptions: Array<{ label: string; value: string }>;
  fontOptions: FontOption[];
}

const scriptFontFamily = Platform.select({
  ios: 'Snell Roundhand',
  android: 'cursive',
  default: undefined,
});

const defaultColors: ThemeColors = {
  primary: '#6366F1',
  primaryLight: '#818CF8',
  primaryDark: '#4F46E5',
  secondary: '#EC4899',
  accent: '#F59E0B',
  background: '#FFFFFF',
  backgroundLight: '#F9FAFB',
  text: '#111827',
  textSecondary: '#6B7280',
  border: '#E5E7EB',
  white: '#FFFFFF',
};

const defaultFonts: ThemeFonts = {
  headingFamily: scriptFontFamily,
  bodyFamily: scriptFontFamily,
};

const themePresets: AppTheme[] = [
  {
    id: 'classic',
    name: 'Classic Indigo',
    description: 'Rauhallinen klassinen perusteema',
    descriptions: {
      fi: 'Rauhallinen klassinen perusteema',
      en: 'Calm and classic base theme',
      sv: 'Lugnt och klassiskt grundtema',
    },
    colors: defaultColors,
    fonts: defaultFonts,
  },
  {
    id: 'sunset',
    name: 'Sunset Pop',
    description: 'Lämmintä korallia ja pehmeä tausta',
    descriptions: {
      fi: 'Lämmintä korallia ja pehmeä tausta',
      en: 'Warm coral tones with a soft background',
      sv: 'Varma korallnyanser med mjuk bakgrund',
    },
    colors: {
      ...defaultColors,
      primary: '#F97316',
      primaryLight: '#FB923C',
      primaryDark: '#EA580C',
      secondary: '#DB2777',
      accent: '#F59E0B',
      background: '#FFF7ED',
      backgroundLight: '#FFEDD5',
      text: '#431407',
      textSecondary: '#9A3412',
      border: '#FDBA74',
    },
    fonts: {
      headingFamily: Platform.OS === 'ios' ? 'AvenirNext-DemiBold' : undefined,
      bodyFamily: Platform.OS === 'ios' ? 'AvenirNext-Regular' : undefined,
    },
  },
  {
    id: 'forest',
    name: 'Forest Calm',
    description: 'Luonnollinen vihreä paperi-fiilis',
    descriptions: {
      fi: 'Luonnollinen vihreä paperi-fiilis',
      en: 'Natural green paper-like feel',
      sv: 'Naturlig grön papperskänsla',
    },
    colors: {
      ...defaultColors,
      primary: '#2F855A',
      primaryLight: '#38A169',
      primaryDark: '#276749',
      secondary: '#2C7A7B',
      accent: '#B7791F',
      background: '#F0FFF4',
      backgroundLight: '#E6FFFA',
      text: '#1C4532',
      textSecondary: '#276749',
      border: '#9AE6B4',
    },
    fonts: {
      headingFamily: Platform.OS === 'ios' ? 'Georgia-Bold' : 'serif',
      bodyFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    },
  },
  {
    id: 'midnight',
    name: 'Midnight Slate',
    description: 'Tumma ja kontrastinen ilta-teema',
    descriptions: {
      fi: 'Tumma ja kontrastinen ilta-teema',
      en: 'Dark and high-contrast evening theme',
      sv: 'Mörkt och kontraststarkt kvällstema',
    },
    colors: {
      ...defaultColors,
      primary: '#38BDF8',
      primaryLight: '#7DD3FC',
      primaryDark: '#0EA5E9',
      secondary: '#A78BFA',
      accent: '#F59E0B',
      background: '#0F172A',
      backgroundLight: '#111827',
      text: '#E5E7EB',
      textSecondary: '#9CA3AF',
      border: '#334155',
      white: '#111827',
    },
    fonts: {
      headingFamily: Platform.OS === 'ios' ? 'AvenirNext-Bold' : undefined,
      bodyFamily: Platform.OS === 'ios' ? 'AvenirNext-Regular' : undefined,
    },
  },
  {
    id: 'custom',
    name: 'Custom Studio',
    description: 'Valitse omat väri- ja fonttiasetukset',
    descriptions: {
      fi: 'Valitse omat väri- ja fonttiasetukset',
      en: 'Choose your own colors and font settings',
      sv: 'Välj egna färg- och teckensnittsinställningar',
    },
    colors: defaultColors,
    fonts: defaultFonts,
  },
];

const colorOptions = [
  { label: 'Indigo', value: '#6366F1' },
  { label: 'Coral', value: '#F97316' },
  { label: 'Teal', value: '#0D9488' },
  { label: 'Green', value: '#2F855A' },
  { label: 'Rose', value: '#E11D48' },
  { label: 'Amber', value: '#D97706' },
  { label: 'Slate', value: '#334155' },
  { label: 'Night', value: '#0F172A' },
  { label: 'Paper', value: '#FFFFFF' },
  { label: 'Cream', value: '#FFF7ED' },
];

const fontOptions: FontOption[] = [
  {
    id: 'script',
    label: 'Script',
    headingFamily: scriptFontFamily,
    bodyFamily: scriptFontFamily,
  },
  {
    id: 'system',
    label: 'System',
    headingFamily: undefined,
    bodyFamily: undefined,
  },
  {
    id: 'serif',
    label: 'Serif',
    headingFamily: Platform.OS === 'ios' ? 'Georgia-Bold' : 'serif',
    bodyFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  {
    id: 'mono',
    label: 'Mono',
    headingFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
    bodyFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
];

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [activeThemeId, setActiveThemeIdState] = useState<ThemeId>('classic');
  const [customThemeDraft, setCustomThemeDraft] = useState<Pick<AppTheme, 'colors' | 'fonts'>>({
    colors: defaultColors,
    fonts: defaultFonts,
  });

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const raw = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (!raw || !mounted) {
          return;
        }

        const parsed = JSON.parse(raw) as {
          activeThemeId?: ThemeId;
          customThemeDraft?: Pick<AppTheme, 'colors' | 'fonts'>;
        };

        if (parsed.activeThemeId && themePresets.some((t) => t.id === parsed.activeThemeId)) {
          setActiveThemeIdState(parsed.activeThemeId);
        }
        if (parsed.customThemeDraft?.colors && parsed.customThemeDraft?.fonts) {
          setCustomThemeDraft(parsed.customThemeDraft);
        }
      } catch {
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const persist = useCallback(async (nextId: ThemeId, nextCustom: Pick<AppTheme, 'colors' | 'fonts'>) => {
    try {
      await AsyncStorage.setItem(
        THEME_STORAGE_KEY,
        JSON.stringify({ activeThemeId: nextId, customThemeDraft: nextCustom })
      );
    } catch {
    }
  }, []);

  const setActiveTheme = useCallback(async (id: ThemeId) => {
    setActiveThemeIdState(id);
    await persist(id, customThemeDraft);
  }, [customThemeDraft, persist]);

  const updateCustomColors = useCallback(async (updates: Partial<ThemeColors>) => {
    setCustomThemeDraft((prev) => {
      const next = {
        ...prev,
        colors: {
          ...prev.colors,
          ...updates,
        },
      };
      void persist(activeThemeId, next);
      return next;
    });
  }, [activeThemeId, persist]);

  const setCustomFontOption = useCallback(async (optionId: string) => {
    const option = fontOptions.find((candidate) => candidate.id === optionId);
    if (!option) {
      return;
    }

    setCustomThemeDraft((prev) => {
      const next = {
        ...prev,
        fonts: {
          headingFamily: option.headingFamily,
          bodyFamily: option.bodyFamily,
        },
      };
      void persist(activeThemeId, next);
      return next;
    });
  }, [activeThemeId, persist]);

  const theme = useMemo(() => {
    if (activeThemeId === 'custom') {
      return {
        id: 'custom',
        name: 'Custom Studio',
        description: 'Valitse omat väri- ja fonttiasetukset',
        descriptions: {
          fi: 'Valitse omat väri- ja fonttiasetukset',
          en: 'Choose your own colors and font settings',
          sv: 'Välj egna färg- och teckensnittsinställningar',
        },
        colors: customThemeDraft.colors,
        fonts: customThemeDraft.fonts,
      } satisfies AppTheme;
    }

    return themePresets.find((preset) => preset.id === activeThemeId) ?? themePresets[0];
  }, [activeThemeId, customThemeDraft]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        activeThemeId,
        themePresets,
        setActiveTheme,
        customThemeDraft,
        updateCustomColors,
        setCustomFontOption,
        colorOptions,
        fontOptions,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return ctx;
}
