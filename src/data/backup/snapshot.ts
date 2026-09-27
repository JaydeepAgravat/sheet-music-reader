import { notifyChanged } from '@/data/db/live';
import { LATEST_VERSION } from '@/data/db/migrations';
import { sql, toBytes, type Scalar } from '@/data/db/runner';
import { uuidv7 } from '@/data/ids';
import { reindex } from '@/data/repos/scores';
import { base64ToBytes, bytesToBase64 } from '@/domain/ink/base64';

/**
 * The data half of a backup (library.json), with no native dependencies so it runs against the
 * node:sqlite test database. Format: docs/BACKUP_FORMAT.md.
 *
 * A Snapshot is every row of every real table (columnar, blobs as {"$b64": …}). The derived FTS
 * index is never backed up; restore rebuilds it. Score file paths are rewritten to archive entry
 * names ("pdfs/<sha256>.pdf", "covers/<sha256>.webp"): the archive is device-independent and
 * restore maps them back to fresh local paths.
 *
 * Columns are discovered with PRAGMA table_info, so later migrations that add columns or tables
 * are backed up without touching this file. Restore only ever uses table/column names that exist
 * in the local schema (never names read from the archive), so a crafted library.json can't inject
 * SQL; unknown tables/columns in it are ignored.
 */

export type Cell = string | number | null | { $b64: string };
export type TableDump = { columns: string[]; rows: Cell[][] };
export type Snapshot = { schemaVersion: number; tables: Record<string, TableDump> };

export type SnapshotCounts = {
  scores: number;
  setlists: number;
  collections: number;
  strokes: number;
  pdfBytes: number;
};

/**
 * notBackup = not one of our archives; newerFormat / newerSchema = made by a newer app version;
 * corrupt = ours but malformed.
 */
export type BackupDataErrorCode = 'notBackup' | 'newerFormat' | 'newerSchema' | 'corrupt';

export class BackupDataError extends Error {
  constructor(readonly code: BackupDataErrorCode, message: string) {
    super(message);
    this.name = 'BackupDataError';
  }
}

/** Known tables in foreign-key order (parents first). Tables added later are appended automatically. */
const KNOWN_TABLES = [
  'scores',
  'tags',
  'score_tags',
  'collections',
  'collection_scores',
  'setlists',
  'setlist_items',
  'pedal_mappings',
  'ink_strokes',
] as const;

export const pdfEntry = (sha256: string) => `pdfs/${sha256}.pdf`;
export const coverEntry = (sha256: string) => `covers/${sha256}.webp`;

// --- Schema introspection ------------------------------------------------------------------------

type Row = Record<string, Cell>;

/** Real (non-virtual, non-FTS-shadow, non-internal) tables, parents first. */
export function backupTables(): string[] {
  const all = sql().all<{ name: string; sql: string | null }>(
    "SELECT name, sql FROM sqlite_master WHERE type = 'table'",
  );
  const virtual = all
    .filter(t => /^\s*CREATE\s+VIRTUAL\s+TABLE/i.test(t.sql ?? ''))
    .map(t => t.name);
  const real = all
    .map(t => t.name)
    .filter(n => !n.startsWith('sqlite_') && !virtual.some(v => n === v || n.startsWith(`${v}_`)));
  const known = KNOWN_TABLES.filter(t => real.includes(t));
  const extra = real.filter(t => !(KNOWN_TABLES as readonly string[]).includes(t)).sort();
  return [...known, ...extra];
}

type ColumnInfo = { name: string; pk: number };

function columnsOf(table: string): ColumnInfo[] {
  return sql().all<ColumnInfo>(`PRAGMA table_info("${table}")`);
}

const q = (name: string) => `"${name}"`;

// --- Encoding --------------------------------------------------------------------------------------

function encodeCell(v: unknown): Cell {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' || typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'boolean') return v ? 1 : 0;
  return { $b64: bytesToBase64(toBytes(v)) };
}

function decodeCell(c: Cell): Scalar {
  if (c !== null && typeof c === 'object') return base64ToBytes(c.$b64);
  return c;
}

const isBlobCell = (c: unknown): c is { $b64: string } =>
  typeof c === 'object' &&
  c !== null &&
  typeof (c as { $b64?: unknown }).$b64 === 'string' &&
  Object.keys(c).length === 1;

// --- Backup ------------------------------------------------------------------------------------------

/** Every row of every real table. Score paths become archive entry names. */
export function buildSnapshot(): Snapshot {
  const tables: Record<string, TableDump> = {};
  for (const t of backupTables()) {
    const cols = columnsOf(t);
    const names = cols.map(c => c.name);
    const pk = cols
      .filter(c => c.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map(c => q(c.name));
    const order = pk.length ? pk.join(', ') : 'rowid';
    const rows = sql().all<Record<string, unknown>>(
      `SELECT ${names.map(q).join(', ')} FROM ${q(t)} ORDER BY ${order}`,
    );
    const fileIdx = t === 'scores' ? names.indexOf('file_path') : -1;
    const coverIdx = t === 'scores' ? names.indexOf('cover_path') : -1;
    const hashIdx = t === 'scores' ? names.indexOf('file_hash') : -1;
    tables[t] = {
      columns: names,
      rows: rows.map(r => {
        const cells = names.map(n => encodeCell(r[n]));
        if (hashIdx >= 0) {
          const hash = String(cells[hashIdx]);
          if (fileIdx >= 0) cells[fileIdx] = pdfEntry(hash);
          if (coverIdx >= 0 && cells[coverIdx] !== null) cells[coverIdx] = coverEntry(hash);
        }
        return cells;
      }),
    };
  }
  return { schemaVersion: LATEST_VERSION, tables };
}

export type ArchiveFile = { path: string; name: string; sha256: string; size: number };

/**
 * The files a backup archives: one PDF per distinct file_hash (scores sharing a hash share an
 * entry) and, per hash, the first cover found. Live scores are preferred as the source.
 */
export function listArchiveFiles(): { pdfs: ArchiveFile[]; covers: ArchiveFile[] } {
  const rows = sql().all<{
    file_hash: string;
    file_path: string;
    file_size: number;
    cover_path: string | null;
  }>(
    'SELECT file_hash, file_path, file_size, cover_path FROM scores ORDER BY deleted_at IS NOT NULL, created_at, id',
  );
  const pdfs = new Map<string, ArchiveFile>();
  const covers = new Map<string, ArchiveFile>();
  for (const r of rows) {
    if (!pdfs.has(r.file_hash))
      pdfs.set(r.file_hash, {
        path: r.file_path,
        name: pdfEntry(r.file_hash),
        sha256: r.file_hash,
        size: r.file_size,
      });
    if (r.cover_path && !covers.has(r.file_hash)) {
      covers.set(r.file_hash, {
        path: r.cover_path.replace(/^file:\/\//, ''),
        name: coverEntry(r.file_hash),
        sha256: '',
        size: -1,
      });
    }
  }
  return { pdfs: [...pdfs.values()], covers: [...covers.values()] };
}

/** Rows of a table as objects (missing table = no rows). */
export function rowsOf(s: Snapshot, table: string): Row[] {
  const d = s.tables[table];
  if (!d) return [];
  return d.rows.map(r => {
    const o: Row = {};
    d.columns.forEach((c, i) => (o[c] = r[i] ?? null));
    return o;
  });
}

const str = (c: Cell | undefined): string =>
  typeof c === 'string' ? c : c === null || c === undefined ? '' : String(c);
const num = (c: Cell | undefined): number => (typeof c === 'number' ? c : 0);

export function snapshotCounts(s: Snapshot): SnapshotCounts {
  const scores = rowsOf(s, 'scores');
  const sizes = new Map<string, number>();
  for (const r of scores)
    if (!sizes.has(str(r.file_hash))) sizes.set(str(r.file_hash), num(r.file_size));
  return {
    scores: scores.length,
    setlists: s.tables.setlists?.rows.length ?? 0,
    collections: s.tables.collections?.rows.length ?? 0,
    strokes: s.tables.ink_strokes?.rows.length ?? 0,
    pdfBytes: [...sizes.values()].reduce((a, b) => a + b, 0),
  };
}

/**
 * Validates untrusted library.json content. Throws BackupDataError: 'newerSchema' when the backup
 * comes from a newer app version (its rows may not fit this schema), 'corrupt' for anything malformed.
 */
export function parseSnapshot(json: unknown): Snapshot {
  const bad = (why: string): never => {
    throw new BackupDataError('corrupt', `library.json: ${why}`);
  };
  if (typeof json !== 'object' || json === null) bad('not an object');
  const o = json as { schemaVersion?: unknown; tables?: unknown };
  if (
    typeof o.schemaVersion !== 'number' ||
    !Number.isInteger(o.schemaVersion) ||
    o.schemaVersion < 1
  )
    bad('schemaVersion');
  assertSchemaSupported(o.schemaVersion as number);
  if (typeof o.tables !== 'object' || o.tables === null || Array.isArray(o.tables)) bad('tables');
  const tables: Record<string, TableDump> = {};
  for (const [name, dump] of Object.entries(o.tables as Record<string, unknown>)) {
    const d = dump as { columns?: unknown; rows?: unknown };
    if (!Array.isArray(d?.columns) || !d.columns.every(c => typeof c === 'string'))
      bad(`${name}.columns`);
    if (!Array.isArray(d.rows)) bad(`${name}.rows`);
    const columns = d.columns as string[];
    const rows = d.rows as unknown[];
    for (const r of rows) {
      if (!Array.isArray(r) || r.length !== columns.length) bad(`${name}: row width`);
      for (const c of r as unknown[]) {
        if (
          !(
            c === null ||
            typeof c === 'string' ||
            (typeof c === 'number' && Number.isFinite(c)) ||
            isBlobCell(c)
          )
        )
          bad(`${name}: cell type`);
      }
    }
    tables[name] = { columns, rows: rows as Cell[][] };
  }
  return { schemaVersion: o.schemaVersion as number, tables };
}

export function assertSchemaSupported(schemaVersion: number): void {
  if (schemaVersion > LATEST_VERSION) {
    throw new BackupDataError(
      'newerSchema',
      `Backup schema v${schemaVersion} is newer than this app (v${LATEST_VERSION})`,
    );
  }
}

// --- Restore planning ----------------------------------------------------------------------------------

export type RestoreMode = 'merge' | 'replace';

export type PlanCount = { total: number; new: number; existing: number };

export type NeededFile = {
  sha256: string;
  size: number;
  /** Archive entry of the PDF. */
  pdf: string;
  /** Archive entry of its cover, when the backup has one. */
  cover: string | null;
};

export type RestorePlan = {
  mode: RestoreMode;
  /** existing = already here (merge: matched by file_hash / id / name; replace: always 0). */
  scores: PlanCount;
  setlists: PlanCount;
  collections: PlanCount;
  strokes: PlanCount;
  /** PDFs to extract: hashes no local score has (any other file is reused from the library). */
  files: { needed: NeededFile[]; bytes: number };
  /** Replace only: local data that goes away (zeros for merge). */
  removed: { scores: number; setlists: number; collections: number; strokes: number };
};

const byLocalOrder = (a: Row, b: Row) =>
  Number(a.deleted_at !== null) - Number(b.deleted_at !== null) ||
  num(a.created_at) - num(b.created_at) ||
  str(a.id).localeCompare(str(b.id));

/**
 * Pairs backup scores with local scores of the same file_hash, one-to-one: first the same id, then
 * in library order (live before trashed, oldest first). Returns backup id → local id.
 */
function matchScores(backup: Row[]): Map<string, string> {
  const local = sql().all<{ id: string; file_hash: string }>(
    'SELECT id, file_hash FROM scores ORDER BY deleted_at IS NOT NULL, created_at, id',
  );
  const hashOf = new Map(local.map(r => [r.id, r.file_hash]));
  const free = new Map<string, string[]>();
  for (const r of local) {
    const list = free.get(r.file_hash);
    if (list) list.push(r.id);
    else free.set(r.file_hash, [r.id]);
  }
  const out = new Map<string, string>();
  const take = (hash: string, id: string) => {
    const list = free.get(hash);
    const i = list?.indexOf(id) ?? -1;
    if (list && i >= 0) list.splice(i, 1);
  };
  for (const b of backup) {
    const id = str(b.id);
    if (hashOf.get(id) === str(b.file_hash)) {
      out.set(id, id);
      take(str(b.file_hash), id);
    }
  }
  for (const b of [...backup].sort(byLocalOrder)) {
    const id = str(b.id);
    if (out.has(id)) continue;
    const next = free.get(str(b.file_hash))?.shift();
    if (next) out.set(id, next);
  }
  return out;
}

const localCount = (table: string) =>
  sql().all<{ n: number }>(`SELECT COUNT(*) AS n FROM ${q(table)}`)[0]?.n ?? 0;
const exists = (table: string, col: string, v: Scalar) =>
  sql().all(`SELECT 1 FROM ${q(table)} WHERE ${q(col)} = ? LIMIT 1`, [v]).length > 0;
const findCollection = (name: string) =>
  sql().all<{ id: string }>(
    'SELECT id FROM collections WHERE name = ? COLLATE NOCASE ORDER BY created_at, id LIMIT 1',
    [name],
  )[0]?.id;

/** The hashes (with sizes) of backup PDFs that no local score has. */
function neededFiles(scores: Row[]): NeededFile[] {
  const local = new Set(
    sql()
      .all<{ file_hash: string }>('SELECT DISTINCT file_hash FROM scores')
      .map(r => r.file_hash),
  );
  const out = new Map<string, NeededFile>();
  for (const r of scores) {
    const h = str(r.file_hash);
    if (local.has(h)) continue;
    const cur = out.get(h);
    const cover = r.cover_path !== null && r.cover_path !== undefined ? coverEntry(h) : null;
    if (!cur) out.set(h, { sha256: h, size: num(r.file_size), pdf: pdfEntry(h), cover });
    else if (!cur.cover && cover) cur.cover = cover;
  }
  return [...out.values()];
}

/** Preview of a restore: nothing is written. */
export function planRestore(s: Snapshot, mode: RestoreMode): RestorePlan {
  const scores = rowsOf(s, 'scores');
  const setlists = rowsOf(s, 'setlists');
  const collections = rowsOf(s, 'collections');
  const strokes = rowsOf(s, 'ink_strokes');
  const needed = neededFiles(scores);
  const files = { needed, bytes: needed.reduce((a, f) => a + f.size, 0) };
  const all = (n: number): PlanCount => ({ total: n, new: n, existing: 0 });
  if (mode === 'replace') {
    return {
      mode,
      scores: all(scores.length),
      setlists: all(setlists.length),
      collections: all(collections.length),
      strokes: all(strokes.length),
      files,
      removed: {
        scores: localCount('scores'),
        setlists: localCount('setlists'),
        collections: localCount('collections'),
        strokes: localCount('ink_strokes'),
      },
    };
  }
  const split = (rows: Row[], isExisting: (r: Row) => boolean): PlanCount => {
    const existing = rows.filter(isExisting).length;
    return { total: rows.length, new: rows.length - existing, existing };
  };
  const matched = matchScores(scores);
  return {
    mode,
    scores: split(scores, r => matched.has(str(r.id))),
    setlists: split(setlists, r => exists('setlists', 'id', str(r.id))),
    collections: split(collections, r => !!findCollection(str(r.name))),
    strokes: split(strokes, r => exists('ink_strokes', 'id', str(r.id))),
    files,
    removed: { scores: 0, setlists: 0, collections: 0, strokes: 0 },
  };
}

// --- Restore ------------------------------------------------------------------------------------------

export type RestoreSummary = {
  mode: RestoreMode;
  /** Rows written. */
  inserted: {
    scores: number;
    setlists: number;
    collections: number;
    strokes: number;
    tags: number;
  };
  /** Merge: backup scores that matched a local score (kept as is, missing tags/ink/memberships added). */
  matchedScores: number;
  /** Backup scores left out because their PDF isn't available (failed extraction). */
  skippedScores: { id: string; title: string }[];
  /** Replace: local files (file_path / cover_path, as stored) no restored score uses any more. */
  orphanFiles: string[];
};

/** Inserts `row` into `table`, keeping only columns the local table has. */
function insertRow(table: string, row: Row, localCols: Set<string>, orIgnore = false): void {
  const cols = Object.keys(row).filter(c => localCols.has(c));
  if (!cols.length) return;
  sql().run(
    `INSERT ${orIgnore ? 'OR IGNORE ' : ''}INTO ${q(table)} (${cols
      .map(q)
      .join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    cols.map(c => decodeCell(row[c] ?? null)),
  );
}

/**
 * Applies a snapshot in one transaction.
 *
 * - replace: wipes every library table (and the search index), then inserts everything.
 * - merge: scores matched by file_hash keep the local row (missing tags, collection memberships and
 *   ink strokes by id are added); unmatched ones are inserted (same id when free, else a new uuid
 *   with references remapped); collections match by name (case-insensitive); setlists by id (an
 *   existing one is skipped whole); pedal mappings stay local (backup ones only fill an empty table).
 *
 * `filePaths` maps file_hash → absolute PDF path and `coverPaths` file_hash → file:// cover URI.
 * A score whose hash has no file path is skipped along with everything that references it.
 */
export function applyRestore(
  s: Snapshot,
  mode: RestoreMode,
  filePaths: ReadonlyMap<string, string>,
  coverPaths: ReadonlyMap<string, string>,
): RestoreSummary {
  assertSchemaSupported(s.schemaVersion);
  const db = sql();
  const tables = backupTables();
  const cols = new Map(tables.map(t => [t, new Set(columnsOf(t).map(c => c.name))]));
  const colsOf = (t: string) => cols.get(t) ?? new Set<string>();
  const summary: RestoreSummary = {
    mode,
    inserted: { scores: 0, setlists: 0, collections: 0, strokes: 0, tags: 0 },
    matchedScores: 0,
    skippedScores: [],
    orphanFiles: [],
  };

  db.tx(() => {
    const oldFiles =
      mode === 'replace'
        ? db
            .all<{ file_path: string; cover_path: string | null }>(
              'SELECT file_path, cover_path FROM scores',
            )
            .flatMap(r => [r.file_path, r.cover_path])
        : [];
    if (mode === 'replace') {
      // Children first; the v4 trigger also clears setlist_items when scores go.
      for (const t of [...tables].reverse()) db.run(`DELETE FROM ${q(t)}`);
      db.run('DELETE FROM scores_fts');
    }

    // Scores → id map (backup id → local id). Unmapped = skipped.
    const scoreMap = new Map<string, string>();
    const touched = new Set<string>();
    const matched = mode === 'merge' ? matchScores(rowsOf(s, 'scores')) : new Map<string, string>();
    for (const r of rowsOf(s, 'scores')) {
      const id = str(r.id);
      const hash = str(r.file_hash);
      const local = matched.get(id);
      if (local) {
        scoreMap.set(id, local);
        touched.add(local);
        summary.matchedScores++;
        continue;
      }
      const path = filePaths.get(hash);
      if (!path) {
        summary.skippedScores.push({ id, title: str(r.title) });
        continue;
      }
      const newId = mode === 'merge' && exists('scores', 'id', id) ? uuidv7() : id;
      insertRow(
        'scores',
        {
          ...r,
          id: newId,
          file_path: path,
          cover_path: r.cover_path === null ? null : coverPaths.get(hash) ?? null,
        },
        colsOf('scores'),
      );
      scoreMap.set(id, newId);
      touched.add(newId);
      summary.inserted.scores++;
    }

    // Tags: by name (case-insensitive, the column is UNIQUE NOCASE).
    const tagMap = new Map<string, string>();
    const tagRows = new Map(rowsOf(s, 'tags').map(r => [str(r.id), r]));
    const tagFor = (backupTagId: string): string | undefined => {
      const hit = tagMap.get(backupTagId);
      if (hit) return hit;
      const r = tagRows.get(backupTagId);
      if (!r) return undefined;
      const existing = db.all<{ id: string }>('SELECT id FROM tags WHERE name = ? COLLATE NOCASE', [
        str(r.name),
      ])[0]?.id;
      let id = existing;
      if (!id) {
        id = exists('tags', 'id', backupTagId) ? uuidv7() : backupTagId;
        insertRow('tags', { ...r, id }, colsOf('tags'));
        summary.inserted.tags++;
      }
      tagMap.set(backupTagId, id);
      return id;
    };
    for (const r of rowsOf(s, 'score_tags')) {
      const sid = scoreMap.get(str(r.score_id));
      const tid = sid ? tagFor(str(r.tag_id)) : undefined;
      if (sid && tid)
        insertRow('score_tags', { ...r, score_id: sid, tag_id: tid }, colsOf('score_tags'), true);
    }

    // Collections: by name in merge, verbatim in replace.
    const colMap = new Map<string, string>();
    for (const r of rowsOf(s, 'collections')) {
      const bid = str(r.id);
      const existing = mode === 'merge' ? findCollection(str(r.name)) : undefined;
      if (existing) {
        colMap.set(bid, existing);
        continue;
      }
      const id = mode === 'merge' && exists('collections', 'id', bid) ? uuidv7() : bid;
      insertRow('collections', { ...r, id }, colsOf('collections'));
      colMap.set(bid, id);
      summary.inserted.collections++;
    }
    for (const r of rowsOf(s, 'collection_scores')) {
      const cid = colMap.get(str(r.collection_id));
      const sid = scoreMap.get(str(r.score_id));
      if (cid && sid)
        insertRow(
          'collection_scores',
          { ...r, collection_id: cid, score_id: sid },
          colsOf('collection_scores'),
          true,
        );
    }

    // Setlists: by id; an existing setlist is kept as is (items included). Items after scores.
    const newSetlists = new Set<string>();
    for (const r of rowsOf(s, 'setlists')) {
      const id = str(r.id);
      if (mode === 'merge' && exists('setlists', 'id', id)) continue;
      insertRow('setlists', r, colsOf('setlists'));
      newSetlists.add(id);
      summary.inserted.setlists++;
    }
    for (const r of rowsOf(s, 'setlist_items')) {
      const sid = scoreMap.get(str(r.score_id));
      if (!sid || !newSetlists.has(str(r.setlist_id))) continue;
      const id =
        mode === 'merge' && exists('setlist_items', 'id', str(r.id)) ? uuidv7() : str(r.id);
      insertRow('setlist_items', { ...r, id, score_id: sid }, colsOf('setlist_items'));
    }

    // Pedal mappings: device setup — merge only fills an empty table.
    if (mode === 'replace' || localCount('pedal_mappings') === 0) {
      for (const r of rowsOf(s, 'pedal_mappings'))
        insertRow('pedal_mappings', r, colsOf('pedal_mappings'), true);
    }

    // Ink: by stroke id, onto the mapped score.
    const before = localCount('ink_strokes');
    for (const r of rowsOf(s, 'ink_strokes')) {
      const sid = scoreMap.get(str(r.score_id));
      if (sid) insertRow('ink_strokes', { ...r, score_id: sid }, colsOf('ink_strokes'), true);
    }
    summary.inserted.strokes = localCount('ink_strokes') - before;

    // Tables this file doesn't know yet (added by later migrations): verbatim, local rows win.
    for (const t of tables) {
      if ((KNOWN_TABLES as readonly string[]).includes(t)) continue;
      for (const r of rowsOf(s, t)) insertRow(t, r, colsOf(t), true);
    }

    // Search index: every live score whose row or tags may have changed.
    for (const id of touched) {
      const live =
        db.all('SELECT 1 FROM scores WHERE id = ? AND deleted_at IS NULL', [id]).length > 0;
      if (live) reindex(id);
    }

    if (mode === 'replace') {
      const used = new Set(
        db
          .all<{ file_path: string; cover_path: string | null }>(
            'SELECT file_path, cover_path FROM scores',
          )
          .flatMap(r => [r.file_path, r.cover_path].map(stripFileUri)),
      );
      const seen = new Set<string>();
      for (const f of oldFiles) {
        if (!f) continue;
        const p = stripFileUri(f);
        if (!used.has(p) && !seen.has(p)) {
          seen.add(p);
          summary.orphanFiles.push(f);
        }
      }
    }
  });

  notifyChanged(
    'scores',
    'tags',
    'collections',
    'setlists',
    'setlist_items',
    'pedal_mappings',
    'ink',
  );
  return summary;
}

const stripFileUri = (p: string | null) => (p ?? '').replace(/^file:\/\//, '');

/** file_hash → an existing local PDF path / cover URI (live scores first), to reuse on restore. */
export function localFilesByHash(): { pdfs: Map<string, string>; covers: Map<string, string> } {
  const rows = sql().all<{ file_hash: string; file_path: string; cover_path: string | null }>(
    'SELECT file_hash, file_path, cover_path FROM scores ORDER BY deleted_at IS NOT NULL, created_at, id',
  );
  const pdfs = new Map<string, string>();
  const covers = new Map<string, string>();
  for (const r of rows) {
    if (!pdfs.has(r.file_hash)) pdfs.set(r.file_hash, r.file_path);
    if (r.cover_path && !covers.has(r.file_hash)) covers.set(r.file_hash, r.cover_path);
  }
  return { pdfs, covers };
}
