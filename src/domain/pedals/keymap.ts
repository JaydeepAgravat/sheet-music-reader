/**
 * Pedal key mapping (docs/PRODUCT_SPEC.md §4.4). Android keycodes are stable public constants.
 * The effective map = defaults, then the user's learned keys on top (a learned key can re-assign
 * a default one), plus the volume keys only when the user opted in.
 */
export type PedalAction = 'NEXT' | 'PREV' | 'NEXT_SONG' | 'PREV_SONG' | 'TOGGLE_HALF' | 'TOGGLE_PERFORMANCE';

export const PEDAL_ACTIONS: PedalAction[] = ['NEXT', 'PREV', 'NEXT_SONG', 'PREV_SONG', 'TOGGLE_HALF', 'TOGGLE_PERFORMANCE'];

export const KeyCode = {
  DPAD_UP: 19,
  DPAD_DOWN: 20,
  DPAD_LEFT: 21,
  DPAD_RIGHT: 22,
  VOLUME_UP: 24,
  VOLUME_DOWN: 25,
  SPACE: 62,
  ENTER: 66,
  PAGE_UP: 92,
  PAGE_DOWN: 93,
  MEDIA_NEXT: 87,
  MEDIA_PREVIOUS: 88,
} as const;

export const DEFAULT_MAPPINGS: ReadonlyArray<{ keyCode: number; action: PedalAction }> = [
  { keyCode: KeyCode.DPAD_DOWN, action: 'NEXT' },
  { keyCode: KeyCode.DPAD_RIGHT, action: 'NEXT' },
  { keyCode: KeyCode.PAGE_DOWN, action: 'NEXT' },
  { keyCode: KeyCode.SPACE, action: 'NEXT' },
  { keyCode: KeyCode.ENTER, action: 'NEXT' },
  { keyCode: KeyCode.MEDIA_NEXT, action: 'NEXT' },
  { keyCode: KeyCode.DPAD_UP, action: 'PREV' },
  { keyCode: KeyCode.DPAD_LEFT, action: 'PREV' },
  { keyCode: KeyCode.PAGE_UP, action: 'PREV' },
  { keyCode: KeyCode.MEDIA_PREVIOUS, action: 'PREV' },
];

const VOLUME_MAPPINGS = [
  { keyCode: KeyCode.VOLUME_DOWN, action: 'NEXT' as const },
  { keyCode: KeyCode.VOLUME_UP, action: 'PREV' as const },
];

export type LearnedMapping = { keyCode: number; action: PedalAction; keyName: string; deviceName: string };

export function effectiveMappings(learned: ReadonlyArray<LearnedMapping>, volumeKeys: boolean): Map<number, PedalAction> {
  const map = new Map<number, PedalAction>();
  for (const m of DEFAULT_MAPPINGS) map.set(m.keyCode, m.action);
  if (volumeKeys) for (const m of VOLUME_MAPPINGS) map.set(m.keyCode, m.action);
  for (const m of learned) map.set(m.keyCode, m.action);
  return map;
}

/** Assigning a key to an action replaces any previous assignment of that same key. */
export function assignKey(learned: ReadonlyArray<LearnedMapping>, next: LearnedMapping): LearnedMapping[] {
  return [...learned.filter(m => m.keyCode !== next.keyCode), next];
}

const NAMES: Record<number, string> = Object.fromEntries(Object.entries(KeyCode).map(([name, code]) => [code, name]));

/** Readable key name, e.g. "Page Down", "Arrow Right". */
export function keyLabel(keyCode: number, keyName?: string): string {
  const raw = keyName || NAMES[keyCode] || `Key ${keyCode}`;
  return raw
    .replace(/^DPAD_/, 'ARROW_')
    .split('_')
    .map(w => (w.length <= 1 ? w : w[0] + w.slice(1).toLowerCase()))
    .join(' ');
}

/** Keys shown per action on the Pedals screen (defaults + learned, minus overridden defaults). */
export function keysByAction(learned: ReadonlyArray<LearnedMapping>, volumeKeys: boolean): Record<PedalAction, number[]> {
  const out = Object.fromEntries(PEDAL_ACTIONS.map(a => [a, [] as number[]])) as Record<PedalAction, number[]>;
  for (const [code, action] of effectiveMappings(learned, volumeKeys)) out[action].push(code);
  return out;
}
