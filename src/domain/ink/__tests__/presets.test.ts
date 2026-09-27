/* eslint-disable no-bitwise -- byte packing (base64, Float32, ARGB) */
import { DEFAULT_INK_PRESETS, fromArgb, INK_PALETTE, nearestWidthStep, normalizePresets, presetArgb, toArgb, WIDTH_STEPS } from '../presets';

describe('ink presets', () => {
  it('has the four defaults', () => {
    expect(DEFAULT_INK_PRESETS.map(p => [p.id, p.kind, p.color, p.opacity, p.width])).toEqual([
      ['graphite', 'PEN', '#4A4A4A', 0.9, 1.1],
      ['ink-blue', 'PEN', '#1F3FA8', 1, 1.1],
      ['teacher-red', 'PEN', '#C62828', 1, 1.6],
      ['highlighter', 'HIGHLIGHTER', '#FFE14D', 0.35, 9],
    ]);
  });

  it('packs ARGB as an unsigned 32-bit number', () => {
    expect(toArgb('#C62828', 1)).toBe(0xffc62828);
    expect(toArgb('#c62828', 1)).toBe(0xffc62828);
    expect(toArgb('#000000', 0)).toBe(0);
    expect(toArgb('#FFE14D', 0.35)).toBe(((Math.round(0.35 * 255) << 24) | 0xffe14d) >>> 0);
    expect(toArgb('#123456', 2)).toBe(0xff123456);
    expect(toArgb('nope', 1)).toBe(0xff000000);
    expect(presetArgb(DEFAULT_INK_PRESETS[0]!)).toBeGreaterThan(0);
  });

  it('unpacks ARGB (signed or unsigned input)', () => {
    expect(fromArgb(0xffc62828)).toEqual({ color: '#C62828', opacity: 1 });
    expect(fromArgb(0xffc62828 | 0)).toEqual({ color: '#C62828', opacity: 1 });
    const back = fromArgb(toArgb('#4a4a4a', 0.9));
    expect(back.color).toBe('#4A4A4A');
    expect(back.opacity).toBeCloseTo(0.9, 2);
  });

  it('normalizes garbage to the defaults', () => {
    expect(normalizePresets(undefined)).toEqual(DEFAULT_INK_PRESETS);
    expect(normalizePresets('x')).toEqual(DEFAULT_INK_PRESETS);
    expect(normalizePresets([null, 3, 'a'])).toEqual(DEFAULT_INK_PRESETS);
  });

  it('keeps valid edits, falls back per field, clamps, and always returns 4 slots', () => {
    const out = normalizePresets([
      { id: 'hacked', kind: 'PEN', color: '#2e7d32', opacity: 0.01, width: 100 },
      { color: 'red', width: 0.1, opacity: 0.5 },
      { kind: 'HIGHLIGHTER', width: Number.NaN },
      { kind: 'ERASER' },
      { extra: true },
    ]);
    expect(out).toHaveLength(4);
    expect(out[0]).toEqual({ id: 'graphite', kind: 'PEN', color: '#2E7D32', opacity: 0.1, width: 24 });
    expect(out[1]).toEqual({ id: 'ink-blue', kind: 'PEN', color: '#1F3FA8', opacity: 0.5, width: 0.3 });
    expect(out[2]).toEqual({ ...DEFAULT_INK_PRESETS[2], kind: 'HIGHLIGHTER' });
    expect(out[3]).toEqual(DEFAULT_INK_PRESETS[3]);
  });

  it('offers width steps and a palette that includes every default colour', () => {
    expect(WIDTH_STEPS.PEN.length).toBeGreaterThan(2);
    expect(nearestWidthStep('PEN', 1.1)).toBe(1.2);
    expect(nearestWidthStep('HIGHLIGHTER', 9)).toBe(8);
    const colors = INK_PALETTE.map(c => c.color);
    for (const p of DEFAULT_INK_PRESETS) expect(colors).toContain(p.color);
    expect(new Set(colors).size).toBe(colors.length);
  });
});
