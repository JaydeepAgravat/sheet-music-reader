import NativeAppSystem from '@/specs/NativeAppSystem';
import { getPref } from '@/data/prefs';

/**
 * Semantic haptics. Rules (docs/PLAN.md §1.3): subtle and meaningful only —
 * scrubber detents, long-press, drag/reorder, pedal learned, first/last page. Never on a normal turn.
 */
export type HapticKind = 'tick' | 'confirm' | 'reject' | 'longPress' | 'dragStart' | 'drop' | 'boundary';

export function haptic(kind: HapticKind): void {
  if (!getPref('hapticsEnabled')) return;
  NativeAppSystem.performHaptic(kind);
}
