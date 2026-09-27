import type { InkStrokeRow } from '@/data/repos/ink';

/**
 * Undo/redo for one reader session (not persisted). Every edit is an op holding full stroke rows,
 * so undoing an erase can put the exact strokes back. "Clear page" is a single 'remove' op.
 */
export type InkOp<S = InkStrokeRow> = { type: 'add'; strokes: S[] } | { type: 'remove'; strokes: S[] };

export type InkHistory<S = InkStrokeRow> = {
  /** Records an edit that has already been applied. Clears the redo stack. Empty ops are ignored. */
  push: (op: InkOp<S>) => void;
  /** The op to invert (apply `inverseOp`), or null. It moves to the redo stack. */
  undo: () => InkOp<S> | null;
  /** The op to re-apply as-is, or null. It moves back to the undo stack. */
  redo: () => InkOp<S> | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
  clear: () => void;
};

export function inverseOp<S>(op: InkOp<S>): InkOp<S> {
  return op.type === 'add' ? { type: 'remove', strokes: op.strokes } : { type: 'add', strokes: op.strokes };
}

export function createInkHistory<S = InkStrokeRow>(limit = 200): InkHistory<S> {
  const max = Math.max(1, Math.floor(limit));
  let done: InkOp<S>[] = [];
  let undone: InkOp<S>[] = [];
  return {
    push: op => {
      if (!op.strokes.length) return;
      done.push(op);
      if (done.length > max) done.splice(0, done.length - max);
      undone = [];
    },
    undo: () => {
      const op = done.pop();
      if (!op) return null;
      undone.push(op);
      return op;
    },
    redo: () => {
      const op = undone.pop();
      if (!op) return null;
      done.push(op);
      return op;
    },
    canUndo: () => done.length > 0,
    canRedo: () => undone.length > 0,
    clear: () => {
      done = [];
      undone = [];
    },
  };
}
