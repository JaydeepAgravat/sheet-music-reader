import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import NativeInk, { type InkEditEvent } from '@/specs/NativeInk';
import { listInk, rowToWire, wireToRow, type InkStrokeRow } from '@/data/repos/ink';
import { createInkHistory, type InkOp } from '@/domain/ink/history';
import { flushInk, queueDelete, queueInsert } from './inkWriter';

const LOAD_CHUNK = 250;

export type InkSession = {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  /** Removes every stroke on a page as one undoable step. Returns how many were removed. */
  clearPage: (page: number) => number;
  /** Strokes on a page (for enabling "Clear page"). */
  countOnPage: (page: number) => number;
  /** Adds ready-made strokes as one undoable step (dev stress test; later paste). */
  addRows: (rows: InkStrokeRow[]) => void;
  /** Bumps whenever the ink changes (so dependent UI can re-read counts). */
  revision: number;
};

/**
 * One reader session's ink. Native (InkStore) draws and captures; this hook loads the score's
 * strokes into native, persists every edit native reports (batched), and keeps undo/redo.
 *
 * `strokes` mirrors everything on screen (loaded + drawn − erased), so an eraser or undo never
 * has to read back from SQLite (whose writes may still be queued).
 */
export function useInkSession(scoreId: string | null): InkSession {
  const strokes = useRef(new Map<string, InkStrokeRow>());
  const history = useMemo(() => createInkHistory(), []);
  const [revision, setRevision] = useState(0);
  const bump = useCallback(() => setRevision(r => r + 1), []);

  // Load → native; release on the way out (queued writes are flushed first).
  useEffect(() => {
    if (!scoreId) return;
    const map = strokes.current;
    map.clear();
    history.clear();
    const rows = listInk(scoreId);
    for (const r of rows) map.set(r.id, r);
    for (let i = 0; i < rows.length; i += LOAD_CHUNK) {
      NativeInk.addStrokes(scoreId, rows.slice(i, i + LOAD_CHUNK).map(rowToWire));
    }
    bump();
    return () => {
      flushInk();
      NativeInk.releaseInk(scoreId);
      map.clear();
      history.clear();
    };
  }, [scoreId, history, bump]);

  // Edits drawn/erased natively → SQLite + history.
  useEffect(() => {
    if (!scoreId) return;
    const sub = NativeInk.onInkEdit((e: InkEditEvent) => {
      if (e.inkKey !== scoreId) return;
      const map = strokes.current;
      if (e.added.length) {
        const now = Date.now();
        const rows = e.added.map((w, i) => wireToRow(scoreId, w, now + i / 1000, now));
        rows.forEach(r => map.set(r.id, r));
        queueInsert(rows);
        history.push({ type: 'add', strokes: rows });
      }
      if (e.removedIds.length) {
        const rows = e.removedIds.map(id => map.get(id)).filter((r): r is InkStrokeRow => !!r);
        e.removedIds.forEach(id => map.delete(id));
        queueDelete(e.removedIds.slice());
        if (rows.length) history.push({ type: 'remove', strokes: rows });
      }
      bump();
    });
    return () => sub.remove();
  }, [scoreId, history, bump]);

  const apply = useCallback(
    (op: InkOp, forward: boolean) => {
      if (!scoreId) return;
      const map = strokes.current;
      const adding = (op.type === 'add') === forward;
      if (adding) {
        op.strokes.forEach(r => map.set(r.id, r));
        NativeInk.addStrokes(scoreId, op.strokes.map(rowToWire));
        queueInsert(op.strokes);
      } else {
        const ids = op.strokes.map(r => r.id);
        ids.forEach(id => map.delete(id));
        NativeInk.removeStrokes(scoreId, ids);
        queueDelete(ids);
      }
      bump();
    },
    [scoreId, bump],
  );

  const undo = useCallback(() => {
    const op = history.undo();
    if (op) apply(op, false);
  }, [apply, history]);

  const redo = useCallback(() => {
    const op = history.redo();
    if (op) apply(op, true);
  }, [apply, history]);

  const countOnPage = useCallback((page: number) => {
    let n = 0;
    strokes.current.forEach(r => {
      if (r.page === page) n++;
    });
    return n;
  }, []);

  const clearPage = useCallback(
    (page: number) => {
      const rows = [...strokes.current.values()].filter(r => r.page === page);
      if (!rows.length) return 0;
      const op: InkOp = { type: 'remove', strokes: rows };
      history.push(op);
      apply(op, true);
      return rows.length;
    },
    [apply, history],
  );

  const addRows = useCallback(
    (rows: InkStrokeRow[]) => {
      if (!rows.length) return;
      const op: InkOp = { type: 'add', strokes: rows };
      history.push(op);
      apply(op, true);
    },
    [apply, history],
  );

  return { canUndo: history.canUndo(), canRedo: history.canRedo(), undo, redo, clearPage, countOnPage, addRows, revision };
}
