/**
 * Semantic colour tokens. Components never use raw hex values — only these roles.
 * Every text/background pair is contrast-checked in __tests__/contrast.test.ts (WCAG AA).
 * Android splash/window colours mirror `canvas` in android/app/src/main/res/values{,-night}/colors.xml.
 */
export type ColorTokens = {
  /** App background (warm paper in light, near-black graphite in dark). */
  canvas: string;
  /** Cards, list rows, sheets. */
  surface: string;
  /** Menus, dialogs, snackbars — sits above surface. */
  surfaceRaised: string;
  /** Pressed/hovered wash and subtle fills (search field, chips at rest). */
  surfaceSunken: string;
  textPrimary: string;
  textSecondary: string;
  /** Hints, placeholders, disabled labels. Large text / non-essential only. */
  textTertiary: string;
  borderSubtle: string;
  borderStrong: string;
  accent: string;
  /** Text/icons placed on `accent`. */
  onAccent: string;
  accentContainer: string;
  onAccentContainer: string;
  danger: string;
  onDanger: string;
  dangerContainer: string;
  onDangerContainer: string;
  success: string;
  /** Inverse surfaces (snackbar, toast pill). */
  inverseSurface: string;
  onInverseSurface: string;
  inverseAccent: string;
  /** Modal scrim. */
  scrim: string;
  /** Ripple / pressed overlay on neutral surfaces. */
  ripple: string;
  focusRing: string;
  /** Loading placeholders: visible against canvas and surface in both themes. */
  skeleton: string;
  /** Dims paper-white page covers slightly in dark mode so they don't glare. */
  coverDim: string;
  /** Behind the pages in the reader: a quiet tone that lets paper-white pages stand out. */
  readerBackdrop: string;
  /** Reader top bar / scrubber: raised, slightly translucent over the score. */
  readerChrome: string;
};

export const lightColors: ColorTokens = {
  canvas: '#F7F4EE',
  surface: '#FFFDF9',
  surfaceRaised: '#FFFFFF',
  surfaceSunken: '#EFEBE3',
  textPrimary: '#1C1B19',
  textSecondary: '#5F5B54',
  textTertiary: '#8A857D',
  borderSubtle: '#E6E0D6',
  borderStrong: '#CFC7BA',
  accent: '#2F3F8F',
  onAccent: '#FFFFFF',
  accentContainer: '#E3E6F6',
  onAccentContainer: '#1D2966',
  danger: '#A3362B',
  onDanger: '#FFFFFF',
  dangerContainer: '#F8E3DF',
  onDangerContainer: '#6E2019',
  success: '#2F6B45',
  inverseSurface: '#2A2927',
  onInverseSurface: '#F3F0EA',
  inverseAccent: '#AEB9F4',
  scrim: 'rgba(20, 18, 15, 0.42)',
  ripple: 'rgba(28, 27, 25, 0.08)',
  focusRing: '#2F3F8F',
  skeleton: '#EAE5DB',
  coverDim: 'transparent',
  readerBackdrop: '#E4E0D8',
  readerChrome: 'rgba(255, 253, 249, 0.97)',
};

export const darkColors: ColorTokens = {
  canvas: '#141518',
  surface: '#1C1D21',
  surfaceRaised: '#25272C',
  surfaceSunken: '#101114',
  textPrimary: '#EDEAE4',
  textSecondary: '#A9A59E',
  textTertiary: '#7E7A74',
  borderSubtle: '#2E3036',
  borderStrong: '#43464E',
  accent: '#9BA9F0',
  onAccent: '#121A45',
  accentContainer: '#2A3163',
  onAccentContainer: '#DDE2FB',
  danger: '#F0A197',
  onDanger: '#4A120C',
  dangerContainer: '#5A1F18',
  onDangerContainer: '#FAD9D3',
  success: '#8FCFA4',
  inverseSurface: '#EDEAE4',
  onInverseSurface: '#1F1E1C',
  inverseAccent: '#2F3F8F',
  scrim: 'rgba(0, 0, 0, 0.56)',
  ripple: 'rgba(237, 234, 228, 0.10)',
  focusRing: '#9BA9F0',
  skeleton: '#2A2C32',
  coverDim: 'rgba(0, 0, 0, 0.07)',
  readerBackdrop: '#0E0F11',
  readerChrome: 'rgba(28, 29, 33, 0.97)',
};

/** Annotation ink presets — identical in both themes (ink sits on the page, not the UI). */
export const inkPresets = {
  graphite: { color: '#4A4A4A', opacity: 0.9 },
  inkBlue: { color: '#1F3FA8', opacity: 1 },
  teacherRed: { color: '#C62828', opacity: 1 },
  highlighter: { color: '#FFE14D', opacity: 0.35 },
} as const;
