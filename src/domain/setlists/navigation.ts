/**
 * Setlist performance navigation (docs/PLAN.md §1.4 "Setlists", Phase 6). Pure functions so a pedal,
 * a tap and the "Next: …" pill always agree about which song comes next.
 *
 * Missing entries (score in the Trash) are skipped, never opened. Songs are addressed by their index
 * in the setlist, because the same score may appear twice (a reprise).
 *
 * Crossing a song boundary:
 * - NEXT on the last position of a song → the next song at its entry start page.
 * - PREV on the first position of a song → the previous song at its LAST page. forScore goes to the
 *   previous song's start, but a musician paging back from page 1 almost always wants the page they
 *   just left (e.g. to check the ending), not a jump to the top of the previous piece.
 * - NEXT_SONG / PREV_SONG (dedicated pedal mappings) → that song at its entry start page, from any
 *   page. PREV_SONG always goes to the previous song, never "restart this one".
 * - Nothing playable in that direction → boundary (the reader shows its soft stop; never wraps).
 */

export type SetlistNavItem = {
  scoreId: string;
  /** Entry start page, 0-based. */
  startPage: number;
  /** 0 = not known yet (treated as "any start page is fine", last page 0). */
  pageCount: number;
  /** The score is in the Trash ("missing · Restore"). */
  deleted: boolean;
};

export type SetlistTurnMapping = 'NEXT' | 'PREV' | 'NEXT_SONG' | 'PREV_SONG';

export type SetlistTurn =
  /** Turn a page inside the current song (the reader's usual nextPosition/prevPosition). */
  | { kind: 'page' }
  /**
   * Open song `index` at `startPage` (0-based; feed it to positionForPage). `at` says which end of the
   * song it is: 'start' = the entry's start page, 'end' = the song's last page (PREV across a boundary).
   */
  | { kind: 'song'; index: number; startPage: number; at: 'start' | 'end' }
  /** Nothing further in that direction. */
  | { kind: 'boundary' };

export function isPlayable(item: SetlistNavItem | undefined): boolean {
  return !!item && !item.deleted;
}

/** The entry's start page, clamped to the score (0 ≤ page ≤ pageCount − 1 when the count is known). */
export function startPageOf(item: SetlistNavItem): number {
  const p = Math.max(0, Math.floor(item.startPage));
  return item.pageCount > 0 ? Math.min(p, item.pageCount - 1) : p;
}

export function lastPageOf(item: SetlistNavItem): number {
  return Math.max(0, item.pageCount - 1);
}

/** Index of the first playable entry after `index` (pass −1 for the first playable song), or null. */
export function nextPlayable(items: readonly SetlistNavItem[], index: number): number | null {
  for (let i = Math.max(-1, index) + 1; i < items.length; i++) if (isPlayable(items[i])) return i;
  return null;
}

/** Index of the last playable entry before `index` (pass items.length for the last one), or null. */
export function prevPlayable(items: readonly SetlistNavItem[], index: number): number | null {
  for (let i = Math.min(items.length, index) - 1; i >= 0; i--) if (isPlayable(items[i])) return i;
  return null;
}

/** Title for the "Next: …" pill, or null on the last playable song. */
export function nextSongLabel(items: ReadonlyArray<SetlistNavItem & { title: string }>, index: number): string | null {
  const i = nextPlayable(items, index);
  return i === null ? null : (items[i]?.title ?? null);
}

export type SetlistTurnInput = {
  /** A plain page turn (tap/swipe). Ignored when `mapping` is given. */
  dir?: 'next' | 'prev';
  /** The pedal action (or NEXT/PREV for taps). Wins over `dir`. */
  mapping?: SetlistTurnMapping;
  /** The reader cannot turn further forward inside this song (nextPosition returned null). */
  atLastPosition: boolean;
  /** The reader cannot turn further back inside this song (prevPosition returned null). */
  atFirstPosition: boolean;
  /** Current entry. */
  index: number;
  items: readonly SetlistNavItem[];
};

const toStart = (items: readonly SetlistNavItem[], i: number | null): SetlistTurn => {
  const item = i === null ? undefined : items[i];
  return i === null || !item ? { kind: 'boundary' } : { kind: 'song', index: i, startPage: startPageOf(item), at: 'start' };
};

/** What a turn does in setlist mode. See the file comment for the rules. */
export function resolveSetlistTurn(input: SetlistTurnInput): SetlistTurn {
  const { items, index } = input;
  const mapping: SetlistTurnMapping = input.mapping ?? (input.dir === 'prev' ? 'PREV' : 'NEXT');
  switch (mapping) {
    case 'NEXT':
      return input.atLastPosition ? toStart(items, nextPlayable(items, index)) : { kind: 'page' };
    case 'PREV': {
      if (!input.atFirstPosition) return { kind: 'page' };
      const i = prevPlayable(items, index);
      const item = i === null ? undefined : items[i];
      return i === null || !item ? { kind: 'boundary' } : { kind: 'song', index: i, startPage: lastPageOf(item), at: 'end' };
    }
    case 'NEXT_SONG':
      return toStart(items, nextPlayable(items, index));
    case 'PREV_SONG':
      return toStart(items, prevPlayable(items, index));
  }
}
