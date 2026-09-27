import {
  annotatedPages,
  applyInkChanges,
  deleteStrokes,
  getStrokes,
  inkCount,
  insertStrokes,
  listInk,
  rowToWire,
  strokesOnPage,
  wireToRow,
  type InkStrokeRow,
} from '../ink';
import { deleteForever, getScore, insertScore, listScores, listTrash, restoreScores, trashScores } from '../scores';
import { sql } from '@/data/db/runner';
import { bytesToFloats, floatsToBase64, floatsToBytes } from '@/domain/ink/base64';
import { toArgb } from '@/domain/ink/presets';
import { createTestDb } from '@/data/testing/testDb';

const addScore = (title: string) => insertScore({ title, filePath: `/lib/${title}.pdf`, fileHash: title, fileSize: 1, pageCount: 4 });

let n = 0;
const stroke = (scoreId: string, page: number, seq: number, extra: Partial<InkStrokeRow> = {}): InkStrokeRow => ({
  id: `s${++n}`,
  scoreId,
  page,
  layer: 0,
  kind: 'PEN',
  color: toArgb('#C62828', 1),
  width: 1.1,
  points: floatsToBytes([0.1, 0.2, 1, 0.3 + seq / 100, 0.4, 0.5]),
  seq,
  createdAt: 1000 + seq,
  ...extra,
});

describe('ink repository', () => {
  beforeEach(() => {
    n = 0;
    createTestDb();
  });

  it('round-trips strokes with real blobs, ordered by page then seq', () => {
    const id = addScore('Nocturne');
    const a = stroke(id, 1, 2);
    const b = stroke(id, 0, 5, { kind: 'HIGHLIGHTER', color: toArgb('#FFE14D', 0.35), width: 9 });
    const c = stroke(id, 1, 1);
    insertStrokes([a, b, c]);
    const all = listInk(id);
    expect(all.map(s => s.id)).toEqual([b.id, c.id, a.id]);
    const gotB = all[0]!;
    expect(gotB).toEqual(b);
    expect(gotB.points).toBeInstanceOf(Uint8Array);
    expect(gotB.color).toBe(toArgb('#FFE14D', 0.35)); // unsigned survives SQLite INTEGER
    expect(Array.from(bytesToFloats(gotB.points))).toEqual(Array.from(bytesToFloats(b.points)));
    expect(strokesOnPage(id, 1).map(s => s.id)).toEqual([c.id, a.id]);
    expect(annotatedPages(id)).toEqual([0, 1]);
    expect(inkCount(id)).toBe(3);
    expect(getStrokes([a.id, 'missing', b.id]).map(s => s.id)).toEqual([b.id, a.id]);
  });

  it('replaces by id and deletes (including > 500 ids, chunked)', () => {
    const id = addScore('Etude');
    const a = stroke(id, 0, 1);
    insertStrokes([a]);
    insertStrokes([{ ...a, width: 2.6 }]);
    expect(listInk(id)).toHaveLength(1);
    expect(listInk(id)[0]?.width).toBe(2.6);

    const many = Array.from({ length: 1203 }, (_, i) => stroke(id, i % 3, i));
    insertStrokes(many);
    expect(inkCount(id)).toBe(1204);
    deleteStrokes([a.id, ...many.map(s => s.id), 'nope']);
    expect(inkCount(id)).toBe(0);
    expect(getStrokes([])).toEqual([]);
  });

  it('applies mixed batches in one call', () => {
    const id = addScore('Waltz');
    const a = stroke(id, 0, 1);
    const b = stroke(id, 0, 2);
    insertStrokes([a]);
    applyInkChanges([b], [a.id]);
    expect(listInk(id).map(s => s.id)).toEqual([b.id]);
  });

  it('converts to and from the native wire format', () => {
    const id = addScore('Prelude');
    const pts = [0.25, 0.5, 0.75, 0.375, 0.625, 1]; // exactly representable as Float32
    const wire = { id: 'w1', page: 2, kind: 'HIGHLIGHTER', color: 0xff1f3fa8, width: 9, points: floatsToBase64(pts) };
    const row = wireToRow(id, wire, 42, 7);
    expect(row).toMatchObject({ id: 'w1', scoreId: id, page: 2, layer: 0, kind: 'HIGHLIGHTER', color: 0xff1f3fa8, seq: 42, createdAt: 7 });
    expect(Array.from(bytesToFloats(row.points))).toEqual(pts);
    expect(rowToWire(row)).toEqual(wire);
    expect(wireToRow(id, { ...wire, kind: 'WHATEVER', color: -1 }, 0, 0)).toMatchObject({ kind: 'PEN', color: 0xffffffff });
    insertStrokes([row]);
    expect(rowToWire(listInk(id)[0]!)).toEqual(wire);
  });

  it('flags annotated scores in the library list', () => {
    const plain = addScore('Plain');
    const inked = addScore('Inked');
    const s = stroke(inked, 0, 1);
    insertStrokes([s]);
    const byId = new Map(listScores().map(x => [x.id, x.annotated]));
    expect(byId.get(inked)).toBe(true);
    expect(byId.get(plain)).toBe(false);
    expect(getScore(inked)?.annotated).toBe(true);
    deleteStrokes([s.id]);
    expect(getScore(inked)?.annotated).toBe(false);
  });

  it('keeps ink through trash/restore and cascades it on delete forever', () => {
    const id = addScore('Sonata');
    const other = addScore('Other');
    insertStrokes([stroke(id, 0, 1), stroke(id, 1, 2), stroke(other, 0, 1)]);
    trashScores([id]);
    expect(listTrash()[0]).toMatchObject({ id, annotated: true });
    restoreScores([id]);
    expect(inkCount(id)).toBe(2);
    trashScores([id]);
    deleteForever([id]);
    expect(inkCount(id)).toBe(0);
    expect(inkCount(other)).toBe(1);
    expect(sql().all<{ foreign_keys: number }>('PRAGMA foreign_keys')[0]?.foreign_keys).toBe(1);
  });

  it('rejects ink for an unknown score (foreign key)', () => {
    expect(() => insertStrokes([stroke('ghost', 0, 1)])).toThrow();
  });
});
