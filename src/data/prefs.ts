import { createMMKV, useMMKVString } from 'react-native-mmkv';

/**
 * Small, synchronous user preferences (MMKV). Library data lives in SQLite, not here.
 * Every key has a typed default, so a missing or corrupt value can never break the UI.
 */
export const prefsStore = createMMKV({ id: 'prefs' });

export type ThemeMode = 'system' | 'light' | 'dark';
export type LanguagePref = 'system' | 'en' | 'de' | 'es' | 'fr' | 'it' | 'ja';

type PrefSchema = {
  themeMode: ThemeMode;
  hapticsEnabled: boolean;
  language: LanguagePref;
};

const defaults: PrefSchema = {
  themeMode: 'system',
  hapticsEnabled: true,
  language: 'system',
};

type Key = keyof PrefSchema;

function decode<K extends Key>(key: K, raw: string | undefined): PrefSchema[K] {
  if (raw === undefined) return defaults[key];
  try {
    const value = JSON.parse(raw) as unknown;
    return typeof value === typeof defaults[key] ? (value as PrefSchema[K]) : defaults[key];
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
