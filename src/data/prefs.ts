import { createMMKV, useMMKVString } from 'react-native-mmkv';
import { DEFAULT_INK_PRESETS, normalizePresets, type InkPreset } from '@/domain/ink/presets';

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
  libraryView: 'grid' | 'list';
  librarySort: 'title' | 'composer' | 'recent' | 'added';
  /** Newest first, max 8. */
  recentSearches: string[];
  /** The four ink tool slots (always 4; sanitised on read). */
  inkPresets: InkPreset[];
  /** Active ink tool: a preset id or 'eraser'. */
  inkActiveTool: string;
  /** Floating ink toolbar position, normalised 0..1 of the reader; null = default spot. */
  inkToolbarPos: { x: number; y: number } | null;
  /** In annotate mode, fingers keep drawing even after a stylus has been seen. */
  inkFingerDraws: boolean;
  /** When the last backup finished (ms since epoch); null = never. */
  lastBackupAt: number | null;
  /** Scores in the last backup (the "N new since your last backup" nudge). */
  lastBackupScores: number;
  /** The one-time "back up your library" banner (25+ scores) was dismissed. */
  backupBannerDismissed: boolean;
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
  libraryView: 'grid',
  librarySort: 'title',
  recentSearches: [],
  inkPresets: DEFAULT_INK_PRESETS.map(p => ({ ...p })),
  inkActiveTool: 'graphite',
  inkToolbarPos: null,
  inkFingerDraws: false,
  lastBackupAt: null,
  lastBackupScores: 0,
  backupBannerDismissed: false,
};

type Key = keyof PrefSchema;
export type PrefKey = Key;

/**
 * Preferences a backup carries (settings.json) and a Replace restore brings back. Left out on
 * purpose: one-time hints (readerHintsShown, performanceHintShown), device-specific state
 * (greetedPedals, inkToolbarPos — screen-size dependent), history (recentSearches) and backup
 * status itself (lastBackupAt, lastBackupScores, backupBannerDismissed). New prefs are NOT backed
 * up until added here.
 */
export const BACKED_UP_PREFS: readonly Key[] = [
  'themeMode',
  'hapticsEnabled',
  'language',
  'pageTurn',
  'tapZones',
  'defaultFilter',
  'pedalDebounceMs',
  'volumeKeysTurn',
  'libraryView',
  'librarySort',
  'inkPresets',
  'inkActiveTool',
  'inkFingerDraws',
];

const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Per-key validation for values the generic type check can't cover (structured or nullable
 * values). Returns the sanitised value, or undefined to fall back to the default.
 */
const validators: { [K in Key]?: (value: unknown) => PrefSchema[K] | undefined } = {
  inkPresets: v => normalizePresets(v),
  inkActiveTool: v => (typeof v === 'string' && v.length > 0 ? v : undefined),
  lastBackupAt: v => (v === null || isFiniteNum(v) ? v : undefined),
  inkToolbarPos: v => {
    if (v === null) return null;
    if (typeof v !== 'object' || Array.isArray(v)) return undefined;
    const { x, y } = v as { x?: unknown; y?: unknown };
    return isFiniteNum(x) && isFiniteNum(y) ? { x: clamp01(x), y: clamp01(y) } : undefined;
  },
};

const decoded = new Map<Key, { raw: string; value: unknown }>();

function decode<K extends Key>(key: K, raw: string | undefined): PrefSchema[K] {
  if (raw === undefined) return defaults[key];
  try {
    const value = JSON.parse(raw) as unknown;
    const def = defaults[key];
    const validate = validators[key] as ((v: unknown) => PrefSchema[K] | undefined) | undefined;
    if (validate) {
      // Validated values are rebuilt objects: cache per raw string so hooks get a stable identity.
      const hit = decoded.get(key);
      if (hit && hit.raw === raw) return hit.value as PrefSchema[K];
      const out = validate(value) ?? def;
      decoded.set(key, { raw, value: out });
      return out;
    }
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
