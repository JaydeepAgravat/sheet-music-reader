import { Easing } from 'react-native-reanimated';

/** 4dp grid. Use these names, not raw numbers, for padding/margins/gaps. */
export const space = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  sheet: 20,
  pill: 999,
} as const;

/** Minimum touch target (Material + our accessibility bar). */
export const minTouch = 48;

/** Width breakpoints (dp) for adaptive layout. */
export const breakpoints = {
  /** Nav rail instead of bottom bar. */
  medium: 600,
  /** Two-pane library, list columns. */
  expanded: 840,
} as const;

/** Motion: quiet, physical, fast. Everything collapses to instant/fade under reduce-motion. */
export const motion = {
  duration: { instant: 0, fast: 150, base: 200, slow: 250 },
  easing: {
    standard: Easing.bezier(0.2, 0, 0, 1),
    decelerate: Easing.bezier(0, 0, 0, 1),
    accelerate: Easing.bezier(0.3, 0, 1, 1),
  },
  /** Sheets, drags, press feedback. Critically damped enough to never visibly bounce. */
  spring: { damping: 26, stiffness: 300, mass: 1 },
  springSnappy: { damping: 30, stiffness: 520, mass: 0.8 },
} as const;

/** Soft, low elevation. We rely on hairline borders more than shadows. */
export const elevation = {
  none: { elevation: 0 },
  low: { elevation: 1, shadowColor: '#000' },
  mid: { elevation: 3, shadowColor: '#000' },
  high: { elevation: 8, shadowColor: '#000' },
} as const;

export const iconSize = { sm: 18, md: 24, lg: 28 } as const;
