import { createMMKV, useMMKVString } from 'react-native-mmkv';

/**
 * Small, synchronous user preferences (MMKV). Library data lives in SQLite, not here.
 * Every key has a typed default, so a missing or corrupt value can never break the UI.
 */
export const prefsStore = createMMKV({ id: 'prefs' });

export type ThemeMode = 'system' | 'light' | 'dark';
export type LanguagePref = 'system' | 'en' | 'de' | 'es' | 'fr' | 'it' | 'ja';

export type PageTurnStyle = 'instant' | 'slide';
export type TapZones = 'sides' | 'anywhere';
export type GlobalPageFilter = 'ORIGINAL' | 'PAPER' | 'SEPIA' | 'NIGHT' | 'CONTRAST';

type PrefSchema = {
  themeMode: ThemeMode;
  hapticsEnabled: boolean;
  language: LanguagePref;
  /** Pedal/tap turns: instant (default) or a 120 ms slide. */
  pageTurn: PageTurnStyle;
  /** 'sides' = outer 30% turn, centre toggles controls; 'anywhere' = any tap is next. */
  tapZones: TapZones;
  defaultFilter: GlobalPageFilter;
  pedalDebounceMs: number;
  volumeKeysTurn: boolean;
  /** How many times the tap-zone hint has been shown (shown on the first 3 opens). */
  readerHintsShown: number;
  performanceHintShown: boolean;
  /** InputDevice descriptors we already greeted with the "Pedal detected" sheet. */
  greetedPedals: string[];
};

const defaults: PrefSchema = {
  themeMode: 'system',
  hapticsEnabled: true,
  language: 'system',
  pageTurn: 'instant',
  tapZones: 'sides',
  defaultFilter: 'ORIGINAL',
  pedalDebounceMs: 200,
  volumeKeysTurn: false,
  readerHintsShown: 0,
  performanceHintShown: false,
  greetedPedals: [],
};

type Key = keyof PrefSchema;

function decode<K extends Key>(key: K, raw: string | undefined): PrefSchema[K] {
  if (raw === undefined) return defaults[key];
  try {
    const value = JSON.parse(raw) as unknown;
    const def = defaults[key];
    const ok = Array.isArray(def) ? Array.isArray(value) : typeof value === typeof def && value !== null;
    return ok ? (value as PrefSchema[K]) : def;
  } catch {
    return defaults[key];
  }
}

export function getPref<K extends Key>(key: K): PrefSchema[K] {
  return decode(key, prefsStore.getString(key));
}

export function setPref<K extends Key>(key: K, value: PrefSchema[K]): void {
  prefsStore.set(key, JSON.stringify(value));
}

/** Reactive preference hook; re-renders when the value changes anywhere in the app. */
export function usePref<K extends Key>(key: K): [PrefSchema[K], (value: PrefSchema[K]) => void] {
  const [raw, setRaw] = useMMKVString(key, prefsStore);
  return [decode(key, raw), value => setRaw(JSON.stringify(value))];
}
