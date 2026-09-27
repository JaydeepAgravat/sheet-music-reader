import {
  lastPageOf,
  nextPlayable,
  nextSongLabel,
  prevPlayable,
  resolveSetlistTurn,
  startPageOf,
  type SetlistNavItem,
  type SetlistTurnInput,
} from '../navigation';

const song = (scoreId: string, pageCount = 4, startPage = 0, deleted = false, title = scoreId) => ({ scoreId, pageCount, startPage, deleted, title });

// A, B (missing), C (starts on p.2), A again (reprise), D (missing)
const items = [song('A'), song('B', 3, 0, true), song('C', 5, 2), song('A', 4, 1), song('D', 2, 0, true)];

const turn = (over: Partial<SetlistTurnInput> & Pick<SetlistTurnInput, 'index'>, list: readonly SetlistNavItem[] = items) =>
  resolveSetlistTurn({ atFirstPosition: false, atLastPosition: false, items: list, ...over });

describe('setlist navigation', () => {
  it('finds playable neighbours, skipping missing songs', () => {
    expect(nextPlayable(items, -1)).toBe(0);
    expect(nextPlayable(items, 0)).toBe(2);
    expect(nextPlayable(items, 1)).toBe(2);
    expect(nextPlayable(items, 2)).toBe(3);
    expect(nextPlayable(items, 3)).toBeNull();
    expect(nextPlayable(items, 4)).toBeNull();
    expect(prevPlayable(items, items.length)).toBe(3);
    expect(prevPlayable(items, 3)).toBe(2);
    expect(prevPlayable(items, 2)).toBe(0);
    expect(prevPlayable(items, 0)).toBeNull();
    expect(nextPlayable([], -1)).toBeNull();
    expect(prevPlayable([], 0)).toBeNull();
    expect(nextPlayable([song('X', 2, 0, true)], -1)).toBeNull();
  });

  it('labels the next playable song', () => {
    expect(nextSongLabel(items, 0)).toBe('C');
    expect(nextSongLabel(items, 2)).toBe('A');
    expect(nextSongLabel(items, 3)).toBeNull();
  });

  it('clamps start pages and knows the last page', () => {
    expect(startPageOf(song('X', 3, 7))).toBe(2);
    expect(startPageOf(song('X', 3, -2))).toBe(0);
    expect(startPageOf(song('X', 0, 5))).toBe(5); // page count unknown yet
    expect(lastPageOf(song('X', 3))).toBe(2);
    expect(lastPageOf(song('X', 0))).toBe(0);
  });

  it('NEXT turns pages inside a song, then opens the next song at its start page', () => {
    expect(turn({ index: 0, mapping: 'NEXT' })).toEqual({ kind: 'page' });
    expect(turn({ index: 0, mapping: 'NEXT', atLastPosition: true })).toEqual({ kind: 'song', index: 2, startPage: 2, at: 'start' });
    expect(turn({ index: 2, dir: 'next', atLastPosition: true })).toEqual({ kind: 'song', index: 3, startPage: 1, at: 'start' });
    // Past the last playable song (a missing one follows): soft stop, never wrap.
    expect(turn({ index: 3, mapping: 'NEXT', atLastPosition: true })).toEqual({ kind: 'boundary' });
  });

  it('PREV turns pages back, then opens the previous song at its last page', () => {
    expect(turn({ index: 2, mapping: 'PREV' })).toEqual({ kind: 'page' });
    expect(turn({ index: 2, mapping: 'PREV', atFirstPosition: true })).toEqual({ kind: 'song', index: 0, startPage: 3, at: 'end' });
    expect(turn({ index: 3, dir: 'prev', atFirstPosition: true })).toEqual({ kind: 'song', index: 2, startPage: 4, at: 'end' });
    expect(turn({ index: 0, mapping: 'PREV', atFirstPosition: true })).toEqual({ kind: 'boundary' });
  });

  it('NEXT_SONG / PREV_SONG jump to entry start pages from any page', () => {
    expect(turn({ index: 0, mapping: 'NEXT_SONG' })).toEqual({ kind: 'song', index: 2, startPage: 2, at: 'start' });
    expect(turn({ index: 3, mapping: 'PREV_SONG', atLastPosition: true })).toEqual({ kind: 'song', index: 2, startPage: 2, at: 'start' });
    expect(turn({ index: 2, mapping: 'PREV_SONG' })).toEqual({ kind: 'song', index: 0, startPage: 0, at: 'start' });
    expect(turn({ index: 3, mapping: 'NEXT_SONG' })).toEqual({ kind: 'boundary' });
    expect(turn({ index: 0, mapping: 'PREV_SONG' })).toEqual({ kind: 'boundary' });
  });

  it('mapping wins over dir; no dir means NEXT', () => {
    expect(turn({ index: 0, dir: 'prev', mapping: 'NEXT_SONG' })).toMatchObject({ kind: 'song', index: 2 });
    expect(turn({ index: 0, atLastPosition: true })).toMatchObject({ kind: 'song', index: 2 });
  });

  it('single-song setlist: page turns inside, boundaries at both ends', () => {
    const one = [song('Solo', 3)];
    expect(turn({ index: 0, mapping: 'NEXT' }, one)).toEqual({ kind: 'page' });
    expect(turn({ index: 0, mapping: 'NEXT', atLastPosition: true }, one)).toEqual({ kind: 'boundary' });
    expect(turn({ index: 0, mapping: 'PREV', atFirstPosition: true }, one)).toEqual({ kind: 'boundary' });
    expect(turn({ index: 0, mapping: 'NEXT_SONG' }, one)).toEqual({ kind: 'boundary' });
    expect(turn({ index: 0, mapping: 'PREV_SONG' }, one)).toEqual({ kind: 'boundary' });
    // A one-page song is both first and last position.
    const onePage = [song('A', 1), song('B', 1)];
    expect(turn({ index: 0, mapping: 'NEXT', atFirstPosition: true, atLastPosition: true }, onePage)).toMatchObject({ index: 1, startPage: 0 });
  });

  it('duplicates are separate stops addressed by index', () => {
    const rep = [song('A', 2), song('A', 2, 1)];
    expect(turn({ index: 0, mapping: 'NEXT', atLastPosition: true }, rep)).toEqual({ kind: 'song', index: 1, startPage: 1, at: 'start' });
    expect(turn({ index: 1, mapping: 'PREV', atFirstPosition: true }, rep)).toEqual({ kind: 'song', index: 0, startPage: 1, at: 'end' });
  });

  it('works from a missing current entry (e.g. the song was trashed mid-gig)', () => {
    expect(turn({ index: 1, mapping: 'NEXT', atLastPosition: true })).toMatchObject({ index: 2 });
    expect(turn({ index: 1, mapping: 'PREV', atFirstPosition: true })).toMatchObject({ index: 0, at: 'end' });
    expect(turn({ index: 4, mapping: 'PREV_SONG' })).toMatchObject({ index: 3 });
  });

  it('a 15-song gig pedalled straight through visits every playable song once, in order', () => {
    const gig = Array.from({ length: 15 }, (_, i) => song(`S${i}`, 1 + (i % 4), i % 3, i === 6 || i === 11));
    const visited: number[] = [];
    let index = nextPlayable(gig, -1)!;
    let page = startPageOf(gig[index]!);
    visited.push(index);
    for (let presses = 0; presses < 200; presses++) {
      const item = gig[index]!;
      const t = turn({ index, mapping: 'NEXT', atLastPosition: page >= lastPageOf(item), atFirstPosition: page === 0 }, gig);
      if (t.kind === 'boundary') break;
      if (t.kind === 'page') page++;
      else {
        index = t.index;
        page = t.startPage;
        visited.push(index);
      }
    }
    expect(visited).toEqual([0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 12, 13, 14]);
  });
});
