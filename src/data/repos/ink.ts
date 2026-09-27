/* eslint-disable no-bitwise -- byte packing (base64, Float32, ARGB) */
import { notifyChanged } from '@/data/db/live';
import { sql, toBytes, type Scalar } from '@/data/db/runner';
import { base64ToBytes, bytesToBase64 } from '@/domain/ink/base64';
import type { InkKind } from '@/domain/ink/presets';
import type { InkStrokeWire } from '@/specs/NativeInk';

/**
 * Ink strokes (annotations). One row per stroke; points are a packed little-endian Float32 blob of
 * [x, y, pressure] triples normalised to the source page, identical to the native wire format
 * (base64 of the same bytes), so load/save never re-encodes point data.
 */
export type InkStrokeRow = {
  id: string;
  scoreId: string;
  /** 0-based source page. */
  page: number;
  layer: number;
  kind: InkKind;
  /** Unsigned 32-bit ARGB. */
  color: number;
  /** PDF points. */
  width: number;
  points: Uint8Array;
  /** Draw order within a page (ascending). */
  seq: number;
  createdAt: number;
};

type Row = {
  id: string;
  score_id: string;
  page: number;
  layer: number;
  kind: string;
  color: number;
  width: number;
  points: unknown;
  seq: number;
  created_at: number;
};

const COLUMNS = 'id, score_id, page, layer, kind, color, width, points, seq, created_at';
/** Stay well under SQLite's bound-parameter limit. */
const CHUNK = 500;

const toKind = (k: string): InkKind => (k === 'HIGHLIGHTER' ? 'HIGHLIGHTER' : 'PEN');

function fromRow(r: Row): InkStrokeRow {
  return {
    id: r.id,
    scoreId: r.score_id,
    page: r.page,
    layer: r.layer,
    kind: toKind(r.kind),
    color: Number(r.color) >>> 0,
    width: r.width,
    points: toBytes(r.points),
    seq: r.seq,
    createdAt: r.created_at,
  };
}

function chunks<T>(items: readonly T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const marks = (n: number) => Array.from({ length: n }, () => '?').join(',');

/** Every stroke of a score, by page then draw order. */
export function listInk(scoreId: string): InkStrokeRow[] {
  return sql()
    .all<Row>(`SELECT ${COLUMNS} FROM ink_strokes WHERE score_id = ? ORDER BY page, seq`, [scoreId])
    .map(fromRow);
}

export function strokesOnPage(scoreId: string, page: number): InkStrokeRow[] {
  return sql()
    .all<Row>(`SELECT ${COLUMNS} FROM ink_strokes WHERE score_id = ? AND page = ? ORDER BY seq`, [scoreId, page])
    .map(fromRow);
}

/** Strokes by id (missing ids are skipped), by page then draw order. */
export function getStrokes(ids: readonly string[]): InkStrokeRow[] {
  if (!ids.length) return [];
  const db = sql();
  return chunks(ids)
    .flatMap(c => db.all<Row>(`SELECT ${COLUMNS} FROM ink_strokes WHERE id IN (${marks(c.length)})`, [...c]))
    .map(fromRow)
    .sort((a, b) => a.page - b.page || a.seq - b.seq);
}

/** Pages (0-based, ascending) that carry ink. */
export function annotatedPages(scoreId: string): number[] {
  return sql()
    .all<{ page: number }>('SELECT DISTINCT page FROM ink_strokes WHERE score_id = ? ORDER BY page', [scoreId])
    .map(r => r.page);
}

export function inkCount(scoreId: string): number {
  return sql().all<{ n: number }>('SELECT COUNT(*) AS n FROM ink_strokes WHERE score_id = ?', [scoreId])[0]?.n ?? 0;
}

/** Inserts (or replaces, by id) strokes in one transaction. */
export function insertStrokes(rows: readonly InkStrokeRow[]): void {
  applyInkChanges(rows, []);
}

/** Deletes strokes by id in one transaction (unknown ids are ignored). */
export function deleteStrokes(ids: readonly string[]): void {
  applyInkChanges([], ids);
}

/**
 * Deletes `deleteIds`, then inserts (or replaces) `inserts`, in one transaction — the batched
 * writer's flush. Notifies 'ink' and 'scores' (the library's "annotated" badge).
 */
export function applyInkChanges(inserts: readonly InkStrokeRow[], deleteIds: readonly string[]): void {
  if (!inserts.length && !deleteIds.length) return;
  const db = sql();
  db.tx(() => {
    for (const c of chunks(deleteIds)) db.run(`DELETE FROM ink_strokes WHERE id IN (${marks(c.length)})`, [...c]);
    for (const r of inserts) {
      const params: Scalar[] = [r.id, r.scoreId, r.page, r.layer, r.kind, r.color >>> 0, r.width, r.points, r.seq, r.createdAt];
      db.run(`INSERT OR REPLACE INTO ink_strokes (${COLUMNS}) VALUES (?,?,?,?,?,?,?,?,?,?)`, params);
    }
  });
  notifyChanged('ink', 'scores');
}

export function rowToWire(row: InkStrokeRow): InkStrokeWire {
  return {
    id: row.id,
    page: row.page,
    kind: row.kind,
    color: row.color >>> 0,
    width: row.width,
    points: bytesToBase64(row.points),
  };
}

export function wireToRow(scoreId: string, wire: InkStrokeWire, seq: number, createdAt: number): InkStrokeRow {
  return {
    id: wire.id,
    scoreId,
    page: wire.page,
    layer: 0,
    kind: toKind(wire.kind),
    color: wire.color >>> 0,
    width: wire.width,
    points: base64ToBytes(wire.points),
    seq,
    createdAt,
  };
}
