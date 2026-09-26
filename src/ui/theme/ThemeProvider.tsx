import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import NativeAppSystem from '@/specs/NativeAppSystem';
import { usePref, type ThemeMode } from '@/data/prefs';
import { darkColors, lightColors, type ColorTokens } from './colors';

export type Theme = {
  colors: ColorTokens;
  isDark: boolean;
  mode: ThemeMode;
  /** True when Android "Remove animations" is on. Motion must collapse to instant/fade. */
  reduceMotion: boolean;
};

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode] = usePref('themeMode');
  const system = useColorScheme();
  const reduceMotion = useReducedMotion();
  const isDark = mode === 'dark' || (mode === 'system' && system === 'dark');

  useEffect(() => {
    NativeAppSystem.setNightMode(mode);
  }, [mode]);

  useEffect(() => {
    NativeAppSystem.setSystemBarIconsDark(!isDark);
  }, [isDark]);

  const theme = useMemo<Theme>(
    () => ({ colors: isDark ? darkColors : lightColors, isDark, mode, reduceMotion }),
    [isDark, mode, reduceMotion],
  );

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used inside <ThemeProvider>');
  return theme;
}

/** Memoised style factory bound to the current theme: `const s = useStyles(makeStyles)`. */
export function useStyles<T>(factory: (theme: Theme) => T): T {
  const theme = useTheme();
  return useMemo(() => factory(theme), [factory, theme]);
}
