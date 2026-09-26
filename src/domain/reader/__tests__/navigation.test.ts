import {
  nextPosition,
  normalize,
  pageLabel,
  positionForPage,
  prevPosition,
  resolveLayout,
  slotsFor,
  usesFitWidth,
  type Position,
  type ReaderLayout,
} from '../navigation';

const P = (page: number, half = false): Position => ({ page, half });

/** Walks forward from the start until the end; returns every position visited. */
function walk(layout: ReaderLayout, count: number): Position[] {
  const out: Position[] = [positionForPage(0, layout, count)];
  for (;;) {
    const n = nextPosition(out[out.length - 1]!, layout, count);
    if (!n) return out;
    out.push(n);
  }
}

describe('layout by orientation', () => {
  const tabletLandscape = { width: 1280, height: 800 };
  const tabletPortrait = { width: 800, height: 1280 };
  const phoneLandscape = { width: 915, height: 412 };
  const phonePortrait = { width: 412, height: 915 };

  it('AUTO: portrait single, landscape tablet two-up, landscape phone single', () => {
    expect(resolveLayout('AUTO', tabletPortrait)).toBe('SINGLE');
    expect(resolveLayout('AUTO', tabletLandscape)).toBe('TWO_UP');
    expect(resolveLayout('AUTO', phoneLandscape)).toBe('SINGLE');
    expect(resolveLayout('AUTO', phonePortrait)).toBe('SINGLE');
  });

  it('an explicit choice wins over orientation', () => {
    expect(resolveLayout('HALF', tabletLandscape)).toBe('HALF');
    expect(resolveLayout('SINGLE', tabletLandscape)).toBe('SINGLE');
  });

  it('fit-width only for single pages on a landscape phone', () => {
    expect(usesFitWidth('SINGLE', phoneLandscape)).toBe(true);
    expect(usesFitWidth('TWO_UP', phoneLandscape)).toBe(false);
    expect(usesFitWidth('SINGLE', tabletLandscape)).toBe(false);
    expect(usesFitWidth('SINGLE', phonePortrait)).toBe(false);
  });
});

describe('single', () => {
  it('visits every page once and stops at the end', () => {
    expect(walk('SINGLE', 4).map(p => p.page)).toEqual([0, 1, 2, 3]);
    expect(nextPosition(P(3), 'SINGLE', 4)).toBeNull();
    expect(prevPosition(P(0), 'SINGLE', 4)).toBeNull();
  });
});

describe('two-up', () => {
  it('walks spreads and snaps odd pages to the spread start', () => {
    expect(walk('TWO_UP', 5).map(p => p.page)).toEqual([0, 2, 4]);
    expect(normalize(P(3), 'TWO_UP', 5)).toEqual(P(2));
    expect(prevPosition(P(3), 'TWO_UP', 5)).toEqual(P(0));
  });

  it('leaves the right page empty on an odd last spread', () => {
    expect(slotsFor(P(4), 'TWO_UP', 5)).toEqual([
      { slot: 'main', page: 4, mode: 'SINGLE' },
      { slot: 'right', page: -1, mode: 'SINGLE' },
    ]);
    expect(pageLabel(P(2), 'TWO_UP', 5)).toBe('3–4');
    expect(pageLabel(P(4), 'TWO_UP', 5)).toBe('5');
  });
});

describe('half-page', () => {
  it('alternates full → half → full and never shows a half past the last page', () => {
    expect(walk('HALF', 3)).toEqual([P(0), P(0, true), P(1), P(1, true), P(2)]);
    expect(nextPosition(P(2), 'HALF', 3)).toBeNull();
    expect(normalize(P(2, true), 'HALF', 3)).toEqual(P(2));
  });

  it('prev is the exact reverse of next', () => {
    const forward = walk('HALF', 4);
    const back: Position[] = [forward[forward.length - 1]!];
    for (;;) {
      const p = prevPosition(back[back.length - 1]!, 'HALF', 4);
      if (!p) break;
      back.push(p);
    }
    expect(back.reverse()).toEqual(forward);
  });

  it('maps to a HALF composite only in the half state', () => {
    expect(slotsFor(P(1), 'HALF', 4)).toEqual([{ slot: 'main', page: 1, mode: 'SINGLE' }]);
    expect(slotsFor(P(1, true), 'HALF', 4)).toEqual([{ slot: 'main', page: 1, mode: 'HALF' }]);
    expect(pageLabel(P(1, true), 'HALF', 4)).toBe('2 · 3');
  });

  it('drops the half state when switching layouts', () => {
    expect(normalize(P(1, true), 'SINGLE', 4)).toEqual(P(1));
  });
});

describe('edge cases', () => {
  it('handles one-page and empty documents', () => {
    for (const l of ['SINGLE', 'TWO_UP', 'HALF'] as const) {
      expect(nextPosition(P(0), l, 1)).toBeNull();
      expect(prevPosition(P(0), l, 1)).toBeNull();
    }
    expect(normalize(P(5), 'SINGLE', 0)).toEqual(P(0));
  });

  it('clamps out-of-range resume pages (file replaced by a shorter one)', () => {
    expect(positionForPage(40, 'SINGLE', 12)).toEqual(P(11));
    expect(positionForPage(-3, 'SINGLE', 12)).toEqual(P(0));
  });
});
