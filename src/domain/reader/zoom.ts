/**
 * Zoom/pan geometry for the reader stage. The page content (cw × ch) is transformed as
 * screen = content × s + t, with the transform origin at the content's top-left.
 * All functions are worklets so gestures can run them on the UI thread.
 */

export const MAX_ZOOM = 4;
export const DOUBLE_TAP_ZOOM = 2.2;

/** Offset on one axis that keeps content covering the stage (or centred when it is smaller). */
export function clampAxis(t: number, s: number, content: number, stage: number): number {
  'worklet';
  const size = content * s;
  if (size <= stage) return (stage - size) / 2;
  return Math.min(0, Math.max(stage - size, t));
}

/** Like clampAxis, but lets a drag go past the edge with resistance (released → springs back). */
export function rubberAxis(t: number, s: number, content: number, stage: number): number {
  'worklet';
  const c = clampAxis(t, s, content, stage);
  return c + (t - c) * 0.35;
}

/** Keeps the content point under `focal` fixed while the scale changes from s0 to s1. */
export function zoomAround(focal: number, t0: number, s0: number, s1: number): number {
  'worklet';
  return focal - ((focal - t0) / s0) * s1;
}

export type Rect = { x: number; y: number; width: number; height: number };
export type Tile = { scale: number; left: number; top: number; right: number; bottom: number };

/** Part of a view (in content coordinates) that is on screen, normalised to the view (0..1). */
export function visibleTile(view: Rect, stageW: number, stageH: number, s: number, tx: number, ty: number): Tile {
  const vx0 = -tx / s;
  const vy0 = -ty / s;
  const vx1 = (stageW - tx) / s;
  const vy1 = (stageH - ty) / s;
  const n = (v: number, o: number, len: number) => Math.min(1, Math.max(0, (v - o) / len));
  return {
    scale: s,
    left: n(vx0, view.x, view.width),
    top: n(vy0, view.y, view.height),
    right: n(vx1, view.x, view.width),
    bottom: n(vy1, view.y, view.height),
  };
}

export function isZoomed(s: number): boolean {
  'worklet';
  return s > 1.01;
}
