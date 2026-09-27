import { applyInkChanges, type InkStrokeRow } from '@/data/repos/ink';

/**
 * Batched ink persistence. Strokes arrive one per pen-up (and erasing can remove many quickly), so
 * writes are coalesced and flushed in one transaction after 400 ms of quiet, or immediately via
 * flushInk() (reader closing, app backgrounding).
 *
 * Coalescing is by stroke id; the latest queued intent wins:
 * - insert then delete before a flush: the insert is dropped (nothing is written for it; a
 *   harmless DELETE of the id is still issued in case an older copy is already stored).
 * - delete then insert (undo of an erase): the delete is dropped and the row is (re)inserted.
 */
export const INK_FLUSH_DELAY_MS = 400;

const inserts = new Map<string, InkStrokeRow>();
const deletes = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

function schedule(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(flushInk, INK_FLUSH_DELAY_MS);
}

export function queueInsert(rows: readonly InkStrokeRow[]): void {
  if (!rows.length) return;
  for (const r of rows) {
    deletes.delete(r.id);
    inserts.set(r.id, r);
  }
  schedule();
}

export function queueDelete(ids: readonly string[]): void {
  if (!ids.length) return;
  for (const id of ids) {
    inserts.delete(id);
    deletes.add(id);
  }
  schedule();
}

/** Number of queued, unflushed changes. */
export function pendingInkChanges(): number {
  return inserts.size + deletes.size;
}

function report(what: string, e: unknown): void {
  // No app logger yet; RN 0.87 keeps console.warn in Metro/LogBox in dev only.
  if (__DEV__) console.warn(`[ink] ${what} failed`, e);
}

/**
 * Writes everything queued, now, in one transaction. Never throws: if the batch fails, each change
 * is retried on its own so one bad row (e.g. a stroke of a score deleted meanwhile) can't take the
 * rest down with it; changes that still fail are logged and dropped.
 */
export function flushInk(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!inserts.size && !deletes.size) return;
  const ins = [...inserts.values()];
  const del = [...deletes];
  inserts.clear();
  deletes.clear();
  try {
    applyInkChanges(ins, del);
    return;
  } catch (e) {
    report('batch write', e);
  }
  if (del.length) {
    try {
      applyInkChanges([], del);
    } catch (e) {
      report('delete', e);
    }
  }
  for (const row of ins) {
    try {
      applyInkChanges([row], []);
    } catch (e) {
      report(`insert ${row.id}`, e);
    }
  }
}

/** Tests: drop anything queued without writing it. */
export function resetInkWriterForTests(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  inserts.clear();
  deletes.clear();
}
