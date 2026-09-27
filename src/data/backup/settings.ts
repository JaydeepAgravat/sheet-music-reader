import { BACKED_UP_PREFS, prefsStore } from '@/data/prefs';

/**
 * settings.json: the preferences listed in BACKED_UP_PREFS, as their stored JSON values. Values are
 * written back raw and validated on read by prefs.ts (a bad value falls back to its default).
 */
export type SettingsDump = { prefs: Record<string, unknown> };

export function exportSettings(): SettingsDump {
  const prefs: Record<string, unknown> = {};
  for (const key of BACKED_UP_PREFS) {
    const raw = prefsStore.getString(key);
    if (raw === undefined) continue;
    try {
      prefs[key] = JSON.parse(raw) as unknown;
    } catch {
      // Unreadable value: leave it out (restore keeps the default).
    }
  }
  return { prefs };
}

/** Writes back the allow-listed prefs found in a settings.json. Returns how many were applied. */
export function importSettings(json: unknown): number {
  const prefs = (json as { prefs?: unknown } | null)?.prefs;
  if (typeof prefs !== 'object' || prefs === null || Array.isArray(prefs)) return 0;
  let n = 0;
  for (const key of BACKED_UP_PREFS) {
    if (!(key in prefs)) continue;
    const value = (prefs as Record<string, unknown>)[key];
    if (value === undefined) continue;
    prefsStore.set(key, JSON.stringify(value));
    n++;
  }
  return n;
}
