/* eslint-disable no-bitwise -- byte packing (base64, Float32, ARGB) */
/**
 * Ink tool presets: four editable slots (three pens + a highlighter). Colours are stored as #RRGGBB
 * plus an opacity; native gets them packed as unsigned ARGB.
 */
export type InkKind = 'PEN' | 'HIGHLIGHTER';

export type InkPreset = {
  id: string;
  kind: InkKind;
  /** #RRGGBB */
  color: string;
  /** 0.1..1 */
  opacity: number;
  /** Stroke width in PDF points. */
  width: number;
};

export const DEFAULT_INK_PRESETS: readonly InkPreset[] = [
  { id: 'graphite', kind: 'PEN', color: '#4A4A4A', opacity: 0.9, width: 1.1 },
  { id: 'ink-blue', kind: 'PEN', color: '#1F3FA8', opacity: 1, width: 1.1 },
  { id: 'teacher-red', kind: 'PEN', color: '#C62828', opacity: 1, width: 1.6 },
  { id: 'highlighter', kind: 'HIGHLIGHTER', color: '#FFE14D', opacity: 0.35, width: 9 },
];

export const INK_PRESET_COUNT = DEFAULT_INK_PRESETS.length;

export const WIDTH_MIN = 0.3;
export const WIDTH_MAX = 24;
export const OPACITY_MIN = 0.1;
export const OPACITY_MAX = 1;

/** Width choices the toolbar offers, per kind (pt). */
export const WIDTH_STEPS: Readonly<Record<InkKind, readonly number[]>> = {
  PEN: [0.6, 0.9, 1.2, 1.8, 2.6],
  HIGHLIGHTER: [5, 8, 12, 16],
};

/** Default opacity when switching a slot's colour, per kind. */
export const DEFAULT_OPACITY: Readonly<Record<InkKind, number>> = { PEN: 1, HIGHLIGHTER: 0.35 };

/**
 * Curated palette: the defaults plus colours musicians actually mark with (fingerings, dynamics,
 * breath marks, teacher corrections). `id` doubles as the i18n key suffix for the colour name.
 */
export const INK_PALETTE: readonly { id: string; color: string }[] = [
  { id: 'graphite', color: '#4A4A4A' },
  { id: 'black', color: '#1A1A1A' },
  { id: 'inkBlue', color: '#1F3FA8' },
  { id: 'teacherRed', color: '#C62828' },
  { id: 'green', color: '#2E7D32' },
  { id: 'purple', color: '#6A1B9A' },
  { id: 'orange', color: '#E65100' },
  { id: 'brown', color: '#6D4C41' },
  { id: 'yellow', color: '#FFE14D' },
  { id: 'pink', color: '#FF8FB1' },
  { id: 'cyan', color: '#6FD3F0' },
  { id: 'lime', color: '#B5E86B' },
];

const HEX = /^#([0-9a-f]{6})$/i;

export const isHexColor = (v: unknown): v is string => typeof v === 'string' && HEX.test(v);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Packs #RRGGBB + opacity (0..1) into an unsigned 32-bit ARGB number. Invalid colours become black. */
export function toArgb(color: string, opacity: number): number {
  const m = HEX.exec(color);
  const rgb = m ? parseInt(m[1]!, 16) : 0;
  const a = Math.round(clamp(Number.isFinite(opacity) ? opacity : 1, 0, 1) * 255);
  return ((a << 24) | rgb) >>> 0;
}

/** Unpacks unsigned (or signed) 32-bit ARGB into #RRGGBB (upper case) + opacity (0..1, 3 decimals). */
export function fromArgb(argb: number): { color: string; opacity: number } {
  const v = argb >>> 0;
  const rgb = v & 0xffffff;
  const a = v >>> 24;
  return {
    color: `#${rgb.toString(16).padStart(6, '0').toUpperCase()}`,
    opacity: Math.round((a / 255) * 1000) / 1000,
  };
}

/** The toolbar step closest to `width` for this kind. */
export function nearestWidthStep(kind: InkKind, width: number): number {
  const steps = WIDTH_STEPS[kind];
  let best = steps[0] ?? width;
  for (const s of steps) if (Math.abs(s - width) < Math.abs(best - width)) best = s;
  return best;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Sanitises stored presets: always exactly 4 slots with the default ids (a slot's identity is its
 * position); each field falls back to that slot's default when missing/invalid; width and opacity
 * are clamped.
 */
export function normalizePresets(raw: unknown): InkPreset[] {
  const list = Array.isArray(raw) ? (raw as unknown[]) : [];
  return DEFAULT_INK_PRESETS.map((def, i) => {
    const r = list[i];
    if (!r || typeof r !== 'object') return { ...def };
    const o = r as Record<string, unknown>;
    const kind: InkKind = o.kind === 'PEN' || o.kind === 'HIGHLIGHTER' ? o.kind : def.kind;
    const color = isHexColor(o.color) ? o.color.toUpperCase() : def.color;
    const opacity = num(o.opacity);
    const width = num(o.width);
    return {
      id: def.id,
      kind,
      color,
      opacity: opacity === null ? def.opacity : clamp(opacity, OPACITY_MIN, OPACITY_MAX),
      width: width === null ? def.width : clamp(width, WIDTH_MIN, WIDTH_MAX),
    };
  });
}

/** ARGB for a preset (what native's setTool expects). */
export const presetArgb = (p: InkPreset): number => toArgb(p.color, p.opacity);
