import type { TextStyle } from 'react-native';

/**
 * Font files live in android/app/src/main/assets/fonts; on Android the family name is the file name.
 * Serif optical sizes: Display for large titles, Subhead for mid titles, SmText for small titles.
 * Japanese and other scripts fall back to the system font (Noto) automatically.
 */
export const fonts = {
  serifDisplay: 'SourceSerif4Display-Regular',
  serifSubhead: 'SourceSerif4Subhead-Semibold',
  serifSmall: 'SourceSerif4SmText-Semibold',
  sans: 'Inter-Regular',
  sansMedium: 'Inter-Medium',
  sansSemiBold: 'Inter-SemiBold',
  music: 'Bravura',
} as const;

// fontWeight stays 'normal': weights come from the file, never synthesized.
const base = (fontFamily: string, fontSize: number, lineHeight: number, letterSpacing = 0): TextStyle => ({
  fontFamily,
  fontSize,
  lineHeight,
  letterSpacing,
  fontWeight: 'normal',
  includeFontPadding: false,
});

export const typography = {
  /** Onboarding, paywall hero. */
  display: base(fonts.serifDisplay, 34, 40, -0.4),
  /** Screen titles ("Library"). */
  titleL: base(fonts.serifDisplay, 28, 34, -0.3),
  /** Score titles in reader/sheets. */
  titleM: base(fonts.serifSubhead, 20, 26, -0.1),
  /** Score card titles. */
  titleS: base(fonts.serifSmall, 16, 21),
  body: base(fonts.sans, 15, 22),
  bodyStrong: base(fonts.sansMedium, 15, 22),
  label: base(fonts.sansMedium, 14, 20, 0.1),
  labelSmall: base(fonts.sansMedium, 12.5, 16, 0.2),
  caption: base(fonts.sans, 12.5, 17, 0.1),
  /** Section headers ("RECENT") — use with uppercase text. */
  overline: base(fonts.sansSemiBold, 11.5, 16, 0.9),
  /** Page counters and numbers that shouldn't jitter as they change. */
  numeric: { ...base(fonts.sansMedium, 13, 18), fontVariant: ['tabular-nums'] as TextStyle['fontVariant'] },
} as const;

export type TypographyRole = keyof typeof typography;
