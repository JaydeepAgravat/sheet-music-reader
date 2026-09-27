import type { DatabaseSync } from 'node:sqlite';
import { parseManifest, buildManifest } from '../manifest';
import { exportSettings, importSettings } from '../settings';
import {
  BackupDataError,
  applyRestore,
  buildSnapshot,
  listArchiveFiles,
  localFilesByHash,
  parseSnapshot,
  planRestore,
  snapshotCounts,
  type Snapshot,
} from '../snapshot';
import { LATEST_VERSION } from '@/data/db/migrations';
import { sql } from '@/data/db/runner';
import { getPref, setPref } from '@/data/prefs';
import { insertStrokes, listInk, type InkStrokeRow } from '@/data/repos/ink';
import { deleteForever, insertScore, trashScores, updateMetadata } from '@/data/repos/scores';
import { floatsToBytes } from '@/domain/ink/base64';
import { createTestDb } from '@/data/testing/testDb';
import { digestSnapshot, hashLibrary, sha256Hex } from '@/dev/backupCheck';

const H = (n: number) => n.toString(16).padStart(64, '0');

let clock = 1_700_000_000_000;
const addScore = (title: string, hash: string, extra: { cover?: boolean } = {}) =>
  insertScore(
    {
      title,
      composer: `${title} composer`,
      filePath: `/data/files/library/${title}.pdf`,
      fileHash: hash,
      fileSize: 1000 + title.length,
      pageCount: 3,
      coverPath: extra.cover === false ? null : `file:///data/files/covers/${title}.webp`,
    },
    (clock += 1000),
  );

let strokeN = 0;
const stroke = (scoreId: string, id = `stroke-${++strokeN}`): InkStrokeRow => ({
  id,
  scoreId,
  page: 1,
  layer: 0,
  kind: 'PEN',
  color: 0xffc62828,
  width: 1.25,
  points: floatsToBytes([0.1, 0.2, 0.5, 0.3, 0.45, 1]),
  seq: 1.5,
  createdAt: 1234,
});

const run = (q: string, p: (string | number | null)[] = []) => sql().run(q, p);
const count = (t: string) => sql().all<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`)[0]?.n ?? 0;

/** A library touching every table. Returns score ids. */
function seedLibrary() {
  const a = addScore('Autumn', H(1));
  const b = addScore('Blue', H(2), { cover: false });
  const c = addScore('Clair', H(3));
  const d = addScore('Dupe', H(1)); // same file as Autumn ("Import anyway")
  updateMetadata(a, { tags: ['Jazz', 'Standards'], notes: 'play slow' });
  updateMetadata(c, { tags: ['jazz'] });
  run('INSERT INTO collections (id, name, sort, created_at, updated_at) VALUES (?,?,?,?,?)', [
    'col-1',
    'Gig Book',
    0,
    1,
    1,
  ]);
  run('INSERT INTO collection_scores (collection_id, score_id, added_at) VALUES (?,?,?)', [
    'col-1',
    a,
    5,
  ]);
  run('INSERT INTO collection_scores (collection_id, score_id, added_at) VALUES (?,?,?)', [
    'col-1',
    b,
    6,
  ]);
  run(
    'INSERT INTO setlists (id, name, event_date, notes, archived, created_at, updated_at) VALUES (?,?,?,?,?,?,?)',
    ['set-1', 'Friday', '2026-10-01', null, 0, 1, 1],
  );
  run(
    'INSERT INTO setlist_items (id, setlist_id, score_id, position, start_page, notes) VALUES (?,?,?,?,?,?)',
    ['item-1', 'set-1', a, 0, 2, 'capo'],
  );
  run(
    'INSERT INTO setlist_items (id, setlist_id, score_id, position, start_page, notes) VALUES (?,?,?,?,?,?)',
    ['item-2', 'set-1', c, 1, 0, null],
  );
  run('INSERT INTO pedal_mappings (keycode, action, device_name, key_name) VALUES (?,?,?,?)', [
    22,
    'NEXT',
    'AirTurn',
    'DPAD_RIGHT',
  ]);
  insertStrokes([stroke(a), stroke(a), stroke(c)]);
  trashScores([b]);
  return { a, b, c, d };
}

/**
 * Raw rows of every table, for exact comparisons (order-independent). Score file paths are left out:
 * restore maps each file_hash to one file, so scores that had separate copies of the same PDF share it.
 */
function dump(db: DatabaseSync): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};
  for (const t of [
    'scores',
    'tags',
    'score_tags',
    'collections',
    'collection_scores',
    'setlists',
    'setlist_items',
    'pedal_mappings',
    'ink_strokes',
  ]) {
    const rows = db
      .prepare(`SELECT * FROM ${t}`)
      .all()
      .map(r => {
        const o: Record<string, unknown> = { ...r };
        if (t === 'scores') {
          delete o.file_path;
          delete o.cover_path;
        }
        return o;
      });
    const key = (o: unknown) =>
      JSON.stringify(o, (_k, v: unknown) => (v instanceof Uint8Array ? Array.from(v) : v));
    out[t] = rows.sort((x, y) => key(x).localeCompare(key(y)));
  }
  return out;
}

/** What a backup → restore would feed applyRestore: files at their original paths. */
function originalPaths(): { pdfs: Map<string, string>; covers: Map<string, string> } {
  return localFilesByHash();
}

const viaJson = (s: Snapshot) => parseSnapshot(JSON.parse(JSON.stringify(s)));

describe('backup snapshot', () => {
  beforeEach(() => {
    strokeN = 0;
  });

  it('round-trips into an empty database (rows, blobs, search)', () => {
    const src = createTestDb();
    seedLibrary();
    const snap = buildSnapshot();
    const files = originalPaths();
    const before = dump(src);
    const digest = hashLibrary([]);

    const dst = createTestDb();
    const summary = applyRestore(viaJson(snap), 'replace', files.pdfs, files.covers);
    expect(summary.skippedScores).toEqual([]);
    expect(summary.orphanFiles).toEqual([]);
    expect(dump(dst)).toEqual(before);
    expect(hashLibrary([])).toEqual(digest);
    // One file per hash: Autumn and Dupe (same PDF) now share Autumn's file.
    const paths = dst
      .prepare('SELECT file_hash, file_path, cover_path FROM scores ORDER BY title')
      .all();
    expect(paths.map(p => ({ ...p }))).toEqual([
      {
        file_hash: H(1),
        file_path: '/data/files/library/Autumn.pdf',
        cover_path: 'file:///data/files/covers/Autumn.webp',
      },
      { file_hash: H(2), file_path: '/data/files/library/Blue.pdf', cover_path: null },
      {
        file_hash: H(3),
        file_path: '/data/files/library/Clair.pdf',
        cover_path: 'file:///data/files/covers/Clair.webp',
      },
      {
        file_hash: H(1),
        file_path: '/data/files/library/Autumn.pdf',
        cover_path: 'file:///data/files/covers/Autumn.webp',
      },
    ]);
    // Blobs survive byte for byte.
    const ink = dst.prepare('SELECT points FROM ink_strokes ORDER BY id').all() as {
      points: Uint8Array;
    }[];
    expect(Array.from(ink[0]!.points)).toEqual(
      Array.from(floatsToBytes([0.1, 0.2, 0.5, 0.3, 0.45, 1])),
    );
    // FTS rebuilt for live scores only (Blue is trashed).
    expect(count('scores_fts')).toBe(3);
    const hits = sql().all<{ score_id: string }>(
      "SELECT score_id FROM scores_fts WHERE scores_fts MATCH 'standards'",
    );
    expect(hits).toHaveLength(1);
  });

  it('writes entry names instead of device paths, and lists one file per hash', () => {
    createTestDb();
    seedLibrary();
    const snap = buildSnapshot();
    const scores = snap.tables.scores!;
    const fp = scores.columns.indexOf('file_path');
    const cp = scores.columns.indexOf('cover_path');
    expect(scores.rows.map(r => r[fp]).sort()).toEqual([
      `pdfs/${H(1)}.pdf`,
      `pdfs/${H(1)}.pdf`,
      `pdfs/${H(2)}.pdf`,
      `pdfs/${H(3)}.pdf`,
    ]);
    expect(scores.rows.some(r => r[cp] === `covers/${H(1)}.webp`)).toBe(true);
    expect(snap.tables.scores_fts).toBeUndefined();
    expect(Object.keys(snap.tables).some(t => t.startsWith('scores_fts'))).toBe(false);
    const { pdfs, covers } = listArchiveFiles();
    expect(pdfs.map(p => p.sha256).sort()).toEqual([H(1), H(2), H(3)]);
    expect(pdfs.find(p => p.sha256 === H(1))?.path).toBe('/data/files/library/Autumn.pdf');
    expect(covers.map(c => c.name).sort()).toEqual([`covers/${H(1)}.webp`, `covers/${H(3)}.webp`]);
    expect(covers[0]?.path.startsWith('/data/files/covers/')).toBe(true);
    const counts = snapshotCounts(snap);
    expect(counts).toEqual({
      scores: 4,
      setlists: 1,
      collections: 1,
      strokes: 3,
      pdfBytes: 1006 + 1004 + 1005 /* Dupe shares Autumn's file */,
    });
    const manifest = buildManifest(snap, pdfs, 42);
    expect(parseManifest(JSON.parse(JSON.stringify(manifest)))).toEqual(manifest);
  });

  it('merge dedupes by file hash and adds what the local copy lacks', () => {
    createTestDb();
    const ids = seedLibrary();
    const backup = viaJson(buildSnapshot());

    // Another device: Autumn (same PDF, different id), plus an unrelated score and collection.
    createTestDb();
    const localAutumn = addScore('Autumn-local', H(1));
    updateMetadata(localAutumn, { tags: ['Ballads'] });
    run('INSERT INTO collections (id, name, sort, created_at, updated_at) VALUES (?,?,?,?,?)', [
      'col-local',
      'gig book',
      0,
      1,
      1,
    ]);
    run('INSERT INTO pedal_mappings (keycode, action, device_name, key_name) VALUES (?,?,?,?)', [
      92,
      'NEXT',
      'Keyboard',
      'PAGE_UP',
    ]);

    const plan = planRestore(backup, 'merge');
    expect(plan.scores).toEqual({ total: 4, new: 3, existing: 1 });
    expect(plan.collections).toEqual({ total: 1, new: 0, existing: 1 });
    expect(plan.setlists).toEqual({ total: 1, new: 1, existing: 0 });
    expect(plan.strokes).toEqual({ total: 3, new: 3, existing: 0 });
    expect(plan.files.needed.map(f => f.sha256).sort()).toEqual([H(2), H(3)]);
    expect(plan.files.needed.find(f => f.sha256 === H(3))?.cover).toBe(`covers/${H(3)}.webp`);
    expect(plan.files.needed.find(f => f.sha256 === H(2))?.cover).toBeNull();

    const local = localFilesByHash();
    const filePaths = new Map([...local.pdfs, [H(2), '/new/blue.pdf'], [H(3), '/new/clair.pdf']]);
    const coverPaths = new Map([...local.covers, [H(3), 'file:///new/clair.webp']]);
    const s = applyRestore(backup, 'merge', filePaths, coverPaths);
    expect(s.matchedScores).toBe(1);
    expect(s.inserted.scores).toBe(3); // Blue, Clair, and the second copy of H(1) (Dupe)
    expect(count('scores')).toBe(4);

    // Autumn kept the local row but gained the backup's tags, membership, setlist entry and ink.
    const autumn = sql().all<{ title: string; file_path: string }>(
      'SELECT title, file_path FROM scores WHERE id = ?',
      [localAutumn],
    )[0];
    expect(autumn).toEqual({
      title: 'Autumn-local',
      file_path: '/data/files/library/Autumn-local.pdf',
    });
    const tags = sql()
      .all<{ name: string }>(
        'SELECT t.name FROM tags t JOIN score_tags st ON st.tag_id = t.id WHERE st.score_id = ? ORDER BY t.name',
        [localAutumn],
      )
      .map(r => r.name);
    expect(tags).toEqual(['Ballads', 'Jazz', 'Standards']);
    expect(count('tags')).toBe(3); // "jazz" on Clair reuses "Jazz"
    expect(listInk(localAutumn)).toHaveLength(2);
    expect(
      sql().all('SELECT 1 FROM collection_scores WHERE collection_id = ? AND score_id = ?', [
        'col-local',
        localAutumn,
      ]),
    ).toHaveLength(1);
    expect(count('collections')).toBe(1);
    const items = sql().all<{ score_id: string; start_page: number }>(
      "SELECT score_id, start_page FROM setlist_items WHERE setlist_id = 'set-1' ORDER BY position",
    );
    expect(items).toEqual([
      { score_id: localAutumn, start_page: 2 },
      { score_id: ids.c, start_page: 0 },
    ]);
    // Dupe (second score with H(1)) reuses the local file; Clair got its extracted file + cover.
    expect(
      sql().all<{ file_path: string }>('SELECT file_path FROM scores WHERE id = ?', [ids.d])[0]
        ?.file_path,
    ).toBe('/data/files/library/Autumn-local.pdf');
    expect(
      sql().all<{ cover_path: string }>('SELECT cover_path FROM scores WHERE id = ?', [ids.c])[0]
        ?.cover_path,
    ).toBe('file:///new/clair.webp');
    // Pedal mappings stay local.
    expect(sql().all<{ keycode: number }>('SELECT keycode FROM pedal_mappings')).toEqual([
      { keycode: 92 },
    ]);
    // Search index covers the new live scores and the retagged local one.
    expect(sql().all("SELECT 1 FROM scores_fts WHERE scores_fts MATCH 'standards'")).toHaveLength(
      1,
    );
    expect(count('scores_fts')).toBe(3); // Autumn-local, Clair, Dupe (Blue is trashed)

    // Restoring the same backup again changes nothing.
    const again = planRestore(backup, 'merge');
    expect(again.scores).toEqual({ total: 4, new: 0, existing: 4 });
    expect(again.setlists.existing).toBe(1);
    expect(again.files.needed).toEqual([]);
    const s2 = applyRestore(backup, 'merge', localFilesByHash().pdfs, localFilesByHash().covers);
    expect(s2.inserted).toEqual({ scores: 0, setlists: 0, collections: 0, strokes: 0, tags: 0 });
    expect(count('ink_strokes')).toBe(3);
  });

  it('replace wipes the local library and reports orphaned files', () => {
    createTestDb();
    seedLibrary();
    const backup = viaJson(buildSnapshot());

    createTestDb();
    const keep = addScore('SameFile', H(1)); // same PDF as the backup's Autumn: its file is reused
    addScore('LocalOnly', H(9));
    run('INSERT INTO setlists (id, name, archived, created_at, updated_at) VALUES (?,?,?,?,?)', [
      'set-local',
      'Local',
      0,
      1,
      1,
    ]);
    run('INSERT INTO pedal_mappings (keycode, action) VALUES (?,?)', [92, 'PREV']);
    insertStrokes([stroke(keep, 'local-stroke')]);

    const plan = planRestore(backup, 'replace');
    expect(plan.removed).toEqual({ scores: 2, setlists: 1, collections: 0, strokes: 1 });
    expect(plan.scores).toEqual({ total: 4, new: 4, existing: 0 });
    expect(plan.files.needed.map(f => f.sha256).sort()).toEqual([H(2), H(3)]);

    const local = localFilesByHash();
    const s = applyRestore(
      backup,
      'replace',
      new Map([...local.pdfs, [H(2), '/x/2.pdf'], [H(3), '/x/3.pdf']]),
      local.covers,
    );
    expect(s.orphanFiles.sort()).toEqual([
      '/data/files/library/LocalOnly.pdf',
      'file:///data/files/covers/LocalOnly.webp',
    ]);
    expect(
      sql()
        .all<{ title: string }>('SELECT title FROM scores ORDER BY title')
        .map(r => r.title),
    ).toEqual(['Autumn', 'Blue', 'Clair', 'Dupe']);
    expect(sql().all('SELECT 1 FROM setlists WHERE id = ?', ['set-local'])).toHaveLength(0);
    expect(sql().all('SELECT 1 FROM ink_strokes WHERE id = ?', ['local-stroke'])).toHaveLength(0);
    expect(sql().all<{ keycode: number }>('SELECT keycode FROM pedal_mappings')).toEqual([
      { keycode: 22 },
    ]);
    expect(count('ink_strokes')).toBe(3);
    // Autumn and Dupe point at the reused local file; Clair has no cover (not provided).
    expect(
      sql().all<{ file_path: string }>(
        'SELECT DISTINCT file_path FROM scores WHERE file_hash = ?',
        [H(1)],
      ),
    ).toEqual([{ file_path: '/data/files/library/SameFile.pdf' }]);
  });

  it('skips scores whose file is unavailable, with everything that references them', () => {
    createTestDb();
    const ids = seedLibrary();
    const backup = viaJson(buildSnapshot());
    createTestDb();
    const s = applyRestore(
      backup,
      'replace',
      new Map([
        [H(1), '/a.pdf'],
        [H(2), '/b.pdf'],
      ]),
      new Map(),
    );
    expect(s.skippedScores).toEqual([{ id: ids.c, title: 'Clair' }]);
    expect(sql().all('SELECT 1 FROM setlist_items WHERE score_id = ?', [ids.c])).toHaveLength(0);
    expect(sql().all('SELECT 1 FROM ink_strokes WHERE score_id = ?', [ids.c])).toHaveLength(0);
    expect(count('setlist_items')).toBe(1);
    expect(
      sql().all<{ cover_path: string | null }>('SELECT DISTINCT cover_path FROM scores'),
    ).toEqual([{ cover_path: null }]);
  });

  it('remaps ids that collide with a different local score', () => {
    createTestDb();
    const ids = seedLibrary();
    const backup = viaJson(buildSnapshot());

    createTestDb();
    // A local score that happens to have Clair's id but another file.
    run(
      'INSERT INTO scores (id, title, file_path, file_hash, file_size, page_count, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)',
      [ids.c, 'Impostor', '/lib/imp.pdf', H(7), 1, 1, 1, 1],
    );
    run(
      'INSERT INTO setlist_items (id, setlist_id, score_id, position) SELECT ?, ?, ?, 0 WHERE 0',
      ['x', 'y', 'z'],
    );
    const paths = new Map([
      [H(1), '/a.pdf'],
      [H(2), '/b.pdf'],
      [H(3), '/c.pdf'],
    ]);
    const s = applyRestore(backup, 'merge', paths, new Map());
    expect(s.inserted.scores).toBe(4);
    const clair = sql().all<{ id: string }>("SELECT id FROM scores WHERE title = 'Clair'")[0]!.id;
    expect(clair).not.toBe(ids.c);
    expect(
      sql().all<{ title: string }>('SELECT title FROM scores WHERE id = ?', [ids.c])[0]?.title,
    ).toBe('Impostor');
    expect(listInk(clair)).toHaveLength(1);
    expect(listInk(ids.c)).toHaveLength(0);
    expect(
      sql().all<{ score_id: string }>("SELECT score_id FROM setlist_items WHERE id = 'item-2'"),
    ).toEqual([{ score_id: clair }]);
    expect(
      sql().all("SELECT 1 FROM scores_fts WHERE score_id = ? AND scores_fts MATCH 'clair'", [
        clair,
      ]),
    ).toHaveLength(1);
  });

  it('refuses snapshots and manifests from a newer schema or format', () => {
    const newer = { schemaVersion: LATEST_VERSION + 1, tables: {} };
    expect(() => parseSnapshot(newer)).toThrow(BackupDataError);
    try {
      parseSnapshot(newer);
    } catch (e) {
      expect((e as BackupDataError).code).toBe('newerSchema');
    }
    const code = (fn: () => unknown) => {
      try {
        fn();
      } catch (e) {
        return (e as BackupDataError).code;
      }
      return null;
    };
    const base = {
      format: 1,
      app: 'score-reader',
      schemaVersion: LATEST_VERSION,
      createdAt: 1,
      counts: {},
      files: [],
    };
    expect(code(() => parseManifest(base))).toBeNull();
    expect(code(() => parseManifest({ ...base, schemaVersion: LATEST_VERSION + 1 }))).toBe(
      'newerSchema',
    );
    expect(code(() => parseManifest({ ...base, format: 2 }))).toBe('newerFormat');
    expect(code(() => parseManifest({ hello: 1 }))).toBe('notBackup');
    expect(
      code(() =>
        parseSnapshot({
          schemaVersion: 1,
          tables: { scores: { columns: ['id'], rows: [[1, 2]] } },
        }),
      ),
    ).toBe('corrupt');
    expect(
      code(() =>
        parseSnapshot({
          schemaVersion: 1,
          tables: { scores: { columns: ['id'], rows: [[{ evil: 1 }]] } },
        }),
      ),
    ).toBe('corrupt');
  });

  it('accepts older-schema backups and ignores unknown tables and columns', () => {
    createTestDb();
    const old: Snapshot = {
      schemaVersion: 1,
      tables: {
        scores: {
          columns: [
            'id',
            'title',
            'file_path',
            'file_hash',
            'file_size',
            'page_count',
            'created_at',
            'updated_at',
            'bogus"; DROP TABLE tags; --',
          ],
          rows: [['s1', 'Old', `pdfs/${H(4)}.pdf`, H(4), 10, 2, 1, 1, 'x']],
        },
        pedal_mappings: { columns: ['keycode', 'action'], rows: [[66, 'NEXT']] },
        no_such_table: { columns: ['a'], rows: [[1]] },
      },
    };
    const s = applyRestore(parseSnapshot(old), 'replace', new Map([[H(4), '/o.pdf']]), new Map());
    expect(s.inserted.scores).toBe(1);
    expect(sql().all<{ key_name: string | null }>('SELECT key_name FROM pedal_mappings')).toEqual([
      { key_name: null },
    ]);
    expect(count('tags')).toBe(0);
    expect(sql().all("SELECT name FROM sqlite_master WHERE name = 'tags'")).toHaveLength(1);
  });

  it('keeps files shared by several scores when one is deleted forever', () => {
    createTestDb();
    const a = addScore('A', H(1));
    run(
      'INSERT INTO scores (id, title, file_path, file_hash, file_size, page_count, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)',
      ['b', 'B', '/data/files/library/A.pdf', H(1), 1, 1, 1, 1],
    );
    trashScores([a]);
    expect(deleteForever([a])).toEqual(['file:///data/files/covers/A.webp']);
  });
});

describe('backup settings', () => {
  it('exports only allow-listed prefs and restores them', () => {
    setPref('themeMode', 'dark');
    setPref('pedalDebounceMs', 150);
    setPref('recentSearches', ['bach']);
    setPref('lastBackupAt', 99);
    const exported = exportSettings();
    expect(exported.prefs).toEqual(
      expect.objectContaining({ themeMode: 'dark', pedalDebounceMs: 150 }),
    );
    expect(exported.prefs.recentSearches).toBeUndefined();
    expect(exported.prefs.lastBackupAt).toBeUndefined();
    setPref('themeMode', 'light');
    expect(
      importSettings(
        JSON.parse(JSON.stringify({ prefs: { ...exported.prefs, recentSearches: ['x'] } })),
      ),
    ).toBe(Object.keys(exported.prefs).length);
    expect(getPref('themeMode')).toBe('dark');
    expect(getPref('recentSearches')).toEqual(['bach']);
    expect(importSettings(null)).toBe(0);
    expect(getPref('lastBackupAt')).toBe(99);
    setPref('lastBackupAt', null);
    expect(getPref('lastBackupAt')).toBeNull();
  });
});

describe('backupCheck', () => {
  it('sha256 matches known vectors', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('é🎵'.repeat(40))).toHaveLength(64);
  });

  it('ignores reader memory by default', () => {
    createTestDb();
    const { a } = seedLibrary();
    const d1 = digestSnapshot(buildSnapshot());
    run('UPDATE scores SET last_page = 2, last_opened_at = 5, play_count = 3 WHERE id = ?', [a]);
    expect(digestSnapshot(buildSnapshot())).toEqual(d1);
    expect(digestSnapshot(buildSnapshot(), []).digest).not.toBe(
      digestSnapshot(buildSnapshot(), ['scores.last_page']).digest,
    );
  });
});
