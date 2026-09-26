import { useEffect, useRef, useState } from 'react';
import NativeKeyEvents, { type PedalEvent } from '@/specs/NativeKeyEvents';
import { nextPosition, prevPosition, slotsFor, type Position, type ReaderLayout } from '@/domain/reader/navigation';
import type { PedalAction } from '@/domain/pedals/keymap';

type Options = {
  /** Reader focused with an open document: pedals are consumed only then. */
  active: boolean;
  pos: Position;
  layout: ReaderLayout;
  pageCount: number;
  /** Native instant turns allowed (not zoomed, not fit-width, no slide animation, no end card). */
  nativeTurns: boolean;
  /** Native already showed `target`: adopt it without re-rendering the page views. */
  onApplied: (target: Position, dir: 1 | -1) => void;
  /** Everything else: JS decides (end of score, fit-width scrolling, toggles…). */
  onAction: (action: PedalAction) => void;
};

let planSeq = 0;

/**
 * Bridges pedals to the reader. After every position change we hand native a single-use plan for
 * NEXT/PREV (what each page view shows next), so a pedal press turns the page on the UI thread even
 * if JS is busy; JS then catches up via onApplied.
 */
export function usePedalTurns({ active, pos, layout, pageCount, nativeTurns, onApplied, onAction }: Options): void {
  const plan = useRef<{ id: number; next: Position | null; prev: Position | null } | null>(null);
  const handlers = useRef({ onApplied, onAction });
  handlers.current = { onApplied, onAction };
  // Native spends the plan on every mapped press (even ones that don't turn), so re-push after each.
  const [pressCount, setPressCount] = useState(0);

  useEffect(() => {
    if (!active) return;
    NativeKeyEvents.setReaderActive(true);
    const sub = NativeKeyEvents.onPedal((e: PedalEvent) => {
      setPressCount(c => c + 1);
      const p = plan.current;
      const dir = e.action === 'NEXT' ? 1 : e.action === 'PREV' ? -1 : 0;
      if (e.applied && p && p.id === e.planId && dir !== 0) {
        const target = dir > 0 ? p.next : p.prev;
        plan.current = null;
        if (target) {
          handlers.current.onApplied(target, dir);
          return;
        }
      }
      handlers.current.onAction(e.action as PedalAction);
    });
    return () => {
      sub.remove();
      plan.current = null;
      NativeKeyEvents.setReaderActive(false);
    };
  }, [active]);

  useEffect(() => {
    if (!active || !nativeTurns || pageCount === 0) {
      plan.current = null;
      if (active) NativeKeyEvents.clearTurnPlan();
      return;
    }
    const next = nextPosition(pos, layout, pageCount);
    const prev = prevPosition(pos, layout, pageCount);
    const id = ++planSeq;
    plan.current = { id, next, prev };
    NativeKeyEvents.setTurnPlan({
      id,
      next: next ? slotsFor(next, layout, pageCount) : [],
      prev: prev ? slotsFor(prev, layout, pageCount) : [],
    });
  }, [active, nativeTurns, pos, layout, pageCount, pressCount]);
}
