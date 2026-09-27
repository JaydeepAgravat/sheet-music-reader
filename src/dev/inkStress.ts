import type { InkStrokeRow } from '@/data/repos/ink';
import { uuidv7 } from '@/data/ids';
import { floatsToBytes } from '@/domain/ink/base64';
import { DEFAULT_INK_PRESETS, presetArgb } from '@/domain/ink/presets';

/**
 * Dev: synthetic handwriting for the "2,000 strokes on one page" exit criterion. Short wavy strokes
 * (fingering numbers, slurs, dynamics-sized scribbles) scattered over the page, all four presets.
 */
export function makeStressStrokes(scoreId: string, page: number, count = 2000, pointsPerStroke = 48): InkStrokeRow[] {
  const rows: InkStrokeRow[] = [];
  const now = Date.now();
  let seed = 0x2f6b45 + page * 7919;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 0x100000000;
    return seed / 0x100000000;
  };
  for (let i = 0; i < count; i++) {
    const preset = DEFAULT_INK_PRESETS[i % 7 === 6 ? 3 : i % 3]!;
    const x0 = 0.04 + rand() * 0.88;
    const y0 = 0.04 + rand() * 0.9;
    const len = 0.02 + rand() * 0.06;
    const amp = 0.004 + rand() * 0.01;
    const turns = 1 + rand() * 3;
    const f = new Float32Array(pointsPerStroke * 3);
    for (let k = 0; k < pointsPerStroke; k++) {
      const t = k / (pointsPerStroke - 1);
      f[k * 3] = x0 + t * len;
      f[k * 3 + 1] = y0 + Math.sin(t * Math.PI * 2 * turns) * amp;
      f[k * 3 + 2] = 0.5;
    }
    rows.push({
      id: uuidv7(),
      scoreId,
      page,
      layer: 0,
      kind: preset.kind,
      color: presetArgb(preset),
      width: preset.width,
      points: floatsToBytes(f),
      seq: now + i / 1000,
      createdAt: now,
    });
  }
  return rows;
}
