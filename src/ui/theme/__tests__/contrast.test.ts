import { contrastRatio } from '../contrast';
import { darkColors, lightColors, type ColorTokens } from '../colors';

type Pair = [fg: keyof ColorTokens, bg: keyof ColorTokens, min: number];

const AA = 4.5;
const LARGE_OR_UI = 3;

const pairs: Pair[] = [
  ['textPrimary', 'canvas', AA],
  ['textPrimary', 'surface', AA],
  ['textPrimary', 'surfaceRaised', AA],
  ['textPrimary', 'surfaceSunken', AA],
  ['textSecondary', 'canvas', AA],
  ['textSecondary', 'surface', AA],
  ['textSecondary', 'surfaceRaised', AA],
  ['textSecondary', 'surfaceSunken', AA],
  ['textTertiary', 'canvas', LARGE_OR_UI],
  ['textTertiary', 'surface', LARGE_OR_UI],
  ['textTertiary', 'surfaceSunken', LARGE_OR_UI],
  ['accent', 'canvas', AA],
  ['accent', 'surface', AA],
  ['accent', 'surfaceRaised', AA],
  ['onAccent', 'accent', AA],
  ['onAccentContainer', 'accentContainer', AA],
  ['accent', 'accentContainer', LARGE_OR_UI],
  ['danger', 'surface', AA],
  ['danger', 'surfaceRaised', AA],
  ['onDanger', 'danger', AA],
  ['onDangerContainer', 'dangerContainer', AA],
  ['success', 'surface', AA],
  ['onInverseSurface', 'inverseSurface', AA],
  ['inverseAccent', 'inverseSurface', AA],
  ['focusRing', 'canvas', LARGE_OR_UI],
  ['focusRing', 'surface', LARGE_OR_UI],
  ['borderStrong', 'surface', 1.3],
];

describe.each([
  ['light', lightColors],
  ['dark', darkColors],
])('%s theme contrast', (_name, colors) => {
  it.each(pairs)('%s on %s ≥ %d:1', (fg, bg, min) => {
    const ratio = contrastRatio(colors[fg], colors[bg]);
    if (ratio < min) {
      throw new Error(`${fg} ${colors[fg]} on ${bg} ${colors[bg]} = ${ratio.toFixed(2)}:1 (need ${min}:1)`);
    }
  });
});
