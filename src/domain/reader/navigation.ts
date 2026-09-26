/**
 * Reader position and page-turn rules. Pure functions: the reader screen, the native turn plan and
 * the tests all use these, so a pedal, a tap and a swipe can never disagree about "next".
 */

/** What the user chose. AUTO follows orientation (docs/PLAN.md §1.4). */
export type ReaderModePref = 'AUTO' | 'SINGLE' | 'TWO_UP' | 'HALF';
/** What is actually on screen. */
export type ReaderLayout = 'SINGLE' | 'TWO_UP' | 'HALF';

/**
 * page: the current page (0-based). In TWO_UP it is the left page of the spread (always even).
 * half: HALF layout only — true while the top band already shows page + 1.
 */
export type Position = { page: number; half: boolean };

export type Viewport = { width: number; height: number };

/** Tablet = the short side is at least 600dp (same breakpoint as the nav rail). */
export function isTablet(v: Viewport): boolean {
  return Math.min(v.width, v.height) >= 600;
}

export function isLandscape(v: Viewport): boolean {
  return v.width > v.height;
}

export function resolveLayout(pref: ReaderModePref, v: Viewport): ReaderLayout {
  if (pref !== 'AUTO') return pref;
  return isLandscape(v) && isTablet(v) ? 'TWO_UP' : 'SINGLE';
}

/**
 * Landscape phone: a whole page fitted to the height is too small to read, so single pages fit the
 * width and pan vertically instead.
 */
export function usesFitWidth(layout: ReaderLayout, v: Viewport): boolean {
  return layout === 'SINGLE' && isLandscape(v) && !isTablet(v);
}

const clampPage = (page: number, pageCount: number) => Math.max(0, Math.min(page, pageCount - 1));

/** Makes any position valid for a layout (e.g. after switching to two-up from an odd page). */
export function normalize(pos: Position, layout: ReaderLayout, pageCount: number): Position {
  if (pageCount <= 0) return { page: 0, half: false };
  let page = clampPage(pos.page, pageCount);
  if (layout === 'TWO_UP') page -= page % 2;
  const half = layout === 'HALF' && pos.half && page + 1 < pageCount;
  return { page, half };
}

/** Position when jumping to a page (scrubber, resume, setlist start page). */
export function positionForPage(page: number, layout: ReaderLayout, pageCount: number): Position {
  return normalize({ page, half: false }, layout, pageCount);
}

/** null = already at the end (show the end-of-score card, never wrap). */
export function nextPosition(pos: Position, layout: ReaderLayout, pageCount: number): Position | null {
  const p = normalize(pos, layout, pageCount);
  switch (layout) {
    case 'SINGLE':
      return p.page + 1 < pageCount ? { page: p.page + 1, half: false } : null;
    case 'TWO_UP':
      return p.page + 2 < pageCount ? { page: p.page + 2, half: false } : null;
    case 'HALF':
      // Full page → half (top of next page appears while you finish this one) → full next page.
      if (p.page + 1 >= pageCount) return null;
      return p.half ? { page: p.page + 1, half: false } : { page: p.page, half: true };
  }
}

/** null = already at the start. */
export function prevPosition(pos: Position, layout: ReaderLayout, pageCount: number): Position | null {
  const p = normalize(pos, layout, pageCount);
  switch (layout) {
    case 'SINGLE':
      return p.page > 0 ? { page: p.page - 1, half: false } : null;
    case 'TWO_UP':
      return p.page > 0 ? { page: p.page - 2, half: false } : null;
    case 'HALF':
      if (p.half) return { page: p.page, half: false };
      return p.page > 0 ? { page: p.page - 1, half: true } : null;
  }
}

export function isSamePosition(a: Position, b: Position): boolean {
  return a.page === b.page && a.half === b.half;
}

/** Pages visible at a position (for labels like "p. 3–4" and TalkBack). 0-based. */
export function visiblePages(pos: Position, layout: ReaderLayout, pageCount: number): number[] {
  const p = normalize(pos, layout, pageCount);
  if (layout === 'TWO_UP') return p.page + 1 < pageCount ? [p.page, p.page + 1] : [p.page];
  if (layout === 'HALF' && p.half) return [p.page, p.page + 1];
  return [p.page];
}

/** One native page view's content. page -1 = empty. */
export type SlotContent = { slot: 'main' | 'right'; page: number; mode: 'SINGLE' | 'HALF' };

/** What each native page view shows for a position — shared by rendering and the native turn plan. */
export function slotsFor(pos: Position, layout: ReaderLayout, pageCount: number): SlotContent[] {
  const p = normalize(pos, layout, pageCount);
  switch (layout) {
    case 'SINGLE':
      return [{ slot: 'main', page: p.page, mode: 'SINGLE' }];
    case 'HALF':
      return [{ slot: 'main', page: p.page, mode: p.half ? 'HALF' : 'SINGLE' }];
    case 'TWO_UP':
      return [
        { slot: 'main', page: p.page, mode: 'SINGLE' },
        { slot: 'right', page: p.page + 1 < pageCount ? p.page + 1 : -1, mode: 'SINGLE' },
      ];
  }
}

/** Human page label, 1-based: "7", "7–8" (two-up) or "7 · 8" (half-page). */
export function pageLabel(pos: Position, layout: ReaderLayout, pageCount: number): string {
  const pages = visiblePages(pos, layout, pageCount).map(n => n + 1);
  if (pages.length === 1) return String(pages[0]);
  return layout === 'TWO_UP' ? `${pages[0]}–${pages[1]}` : `${pages[0]} · ${pages[1]}`;
}
