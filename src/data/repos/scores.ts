import { notifyChanged } from '@/data/db/live';
import { sql, type Scalar } from '@/data/db/runner';
import { uuidv7 } from '@/data/ids';
import type { ReaderModePref } from '@/domain/reader/navigation';

export type PageFilter = 'ORIGINAL' | 'PAPER' | 'SEPIA' | 'NIGHT' | 'CONTRAST';

export type Score = {
  id: string;
  title: string;
  composer: string | null;
  filePath: string;
  pageCount: number;
  coverPath: string | null;
  isSample: boolean;
  isFavorite: boolean;
  readerMode: ReaderModePref;
  halfSplit: number;
  /** null = use the global default filter. */
  pageFilter: PageFilter | null;
  lastPage: number;
  lastOpenedAt: number | null;
  createdAt: number;
  /** Set while the score is in the Trash. */
  deletedAt: number | null;
  /** Has at least one ink stroke (library badge). */
  annotated: boolean;
  /** Appears in at least one non-archived setlist (library badge). */
  inSetlist: boolean;
};

/** Everything the detail/edit sheet shows. */
export type ScoreDetail = Score & {
  arranger: string | null;
  genre: string | null;
  musicKey: string | null;
  tempoBpm: number | null;
  timeSig: string | null;
  notes: string | null;
  originalName: string | null;
  fileSize: number;
  tags: string[];
  collectionIds: string[];
};

type Row = {
  id: string;
  title: string;
  composer: string | null;
  file_path: string;
  page_count: number;
  cover_path: string | null;
  is_sample: number;
  is_favorite: number;
  reader_mode: string | null;
  half_split: number;
  page_filter: string | null;
  last_page: number;
  last_opened_at: number | null;
  created_at: number;
  deleted_at: number | null;
  annotated: number;
  in_setlist: number;
};

const COLUMNS =
  's.id, s.title, s.composer, s.file_path, s.page_count, s.cover_path, s.is_sample, s.is_favorite, s.reader_mode, s.half_split, s.page_filter, s.last_page, s.last_opened_at, s.created_at, s.deleted_at, ' +
  'EXISTS (SELECT 1 FROM ink_strokes i WHERE i.score_id = s.id) AS annotated, ' +
  'EXISTS (SELECT 1 FROM setlist_items si JOIN setlists sl ON sl.id = si.setlist_id WHERE si.score_id = s.id AND sl.archived = 0) AS in_setlist';

const MODES: ReaderModePref[] = ['SINGLE', 'TWO_UP', 'HALF'];
const FILTERS: PageFilter[] = ['ORIGINAL', 'PAPER', 'SEPIA', 'NIGHT', 'CONTRAST'];

/** Bundled samples never count toward the free limit. */
export const FREE_SCORE_LIMIT = 15;
export const TRASH_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function fromRow(r: Row): Score {
  return {
    id: r.id,
    title: r.title,
    composer: r.composer,
    filePath: r.file_path,
    pageCount: r.page_count,
    coverPath: r.cover_path,
    isSample: r.is_sample === 1,
    isFavorite: r.is_favorite === 1,
    readerMode: MODES.includes(r.reader_mode as ReaderModePref) ? (r.reader_mode as ReaderModePref) : 'AUTO',
    halfSplit: r.half_split,
    pageFilter: FILTERS.includes(r.page_filter as PageFilter) ? (r.page_filter as PageFilter) : null,
    lastPage: r.last_page,
    lastOpenedAt: r.last_opened_at,
    createdAt: r.created_at,
    deletedAt: r.deleted_at,
    annotated: r.annotated === 1,
    inSetlist: r.in_setlist === 1,
  };
}

export type ScoreSort = 'title' | 'composer' | 'recent' | 'added';

const ORDER: Record<ScoreSort, string> = {
  title: 's.title COLLATE NOCASE ASC, s.id',
  composer: "COALESCE(NULLIF(s.composer, ''), '￿') COLLATE NOCASE ASC, s.title COLLATE NOCASE ASC, s.id",
  recent: 's.last_opened_at IS NULL, s.last_opened_at DESC, s.title COLLATE NOCASE ASC, s.id',
  added: 's.created_at DESC, s.id DESC',
};

/** Library filters (chips). Every set field narrows the list; unset fields don't filter. */
export type ScoreFilters = {
  favorite?: boolean;
  composer?: string;
  genre?: string;
  musicKey?: string;
  tagId?: string;
  collectionId?: string;
  /** Restrict to these ids (search results), preserving the chosen sort. */
  ids?: readonly string[];
};

function whereFor(f: ScoreFilters, params: Scalar[]): string {
  const where = ['s.deleted_at IS NULL'];
  if (f.favorite) where.push('s.is_favorite = 1');
  if (f.composer) {
    where.push('s.composer = ? COLLATE NOCASE');
    params.push(f.composer);
  }
  if (f.genre) {
    where.push('s.genre = ? COLLATE NOCASE');
    params.push(f.genre);
  }
  if (f.musicKey) {
    where.push('s.music_key = ? COLLATE NOCASE');
    params.push(f.musicKey);
  }
  if (f.tagId) {
    where.push('EXISTS (SELECT 1 FROM score_tags st WHERE st.score_id = s.id AND st.tag_id = ?)');
    params.push(f.tagId);
  }
  if (f.collectionId) {
    where.push('EXISTS (SELECT 1 FROM collection_scores cs WHERE cs.score_id = s.id AND cs.collection_id = ?)');
    params.push(f.collectionId);
  }
  if (f.ids) {
    if (f.ids.length === 0) where.push('0');
    else {
      where.push(`s.id IN (${f.ids.map(() => '?').join(',')})`);
      params.push(...f.ids);
    }
  }
  return where.join(' AND ');
}

export function listScores(sort: ScoreSort = 'title', filters: ScoreFilters = {}): Score[] {
  const params: Scalar[] = [];
  const where = whereFor(filters, params);
  return sql()
    .all<Row>(`SELECT ${COLUMNS} FROM scores s WHERE ${where} ORDER BY ${ORDER[sort]}`, params)
    .map(fromRow);
}

export function getScore(id: string): Score | null {
  const r = sql().all<Row>(`SELECT ${COLUMNS} FROM scores s WHERE s.id = ?`, [id])[0];
  return r ? fromRow(r) : null;
}

export function getScoreDetail(id: string): ScoreDetail | null {
  const base = getScore(id);
  if (!base) return null;
  const extra = sql().all<{
    arranger: string | null;
    genre: string | null;
    music_key: string | null;
    tempo_bpm: number | null;
    time_sig: string | null;
    notes: string | null;
    original_name: string | null;
    file_size: number;
  }>('SELECT arranger, genre, music_key, tempo_bpm, time_sig, notes, original_name, file_size FROM scores WHERE id = ?', [id])[0];
  const tags = sql()
    .all<{ name: string }>('SELECT t.name FROM tags t JOIN score_tags st ON st.tag_id = t.id WHERE st.score_id = ? ORDER BY t.name COLLATE NOCASE', [id])
    .map(r => r.name);
  const collectionIds = sql()
    .all<{ collection_id: string }>('SELECT collection_id FROM collection_scores WHERE score_id = ?', [id])
    .map(r => r.collection_id);
  return {
    ...base,
    arranger: extra?.arranger ?? null,
    genre: extra?.genre ?? null,
    musicKey: extra?.music_key ?? null,
    tempoBpm: extra?.tempo_bpm ?? null,
    timeSig: extra?.time_sig ?? null,
    notes: extra?.notes ?? null,
    originalName: extra?.original_name ?? null,
    fileSize: extra?.file_size ?? 0,
    tags,
    collectionIds,
  };
}

/** The score after `id` in title order — "Next in library" on the end-of-score card. */
export function nextInLibrary(id: string): Score | null {
  const cur = getScore(id);
  if (!cur) return null;
  const r = sql().all<Row>(
    `SELECT ${COLUMNS} FROM scores s
     WHERE s.deleted_at IS NULL AND s.id != ? AND (s.title COLLATE NOCASE > ? OR (s.title COLLATE NOCASE = ? AND s.id > ?))
     ORDER BY s.title COLLATE NOCASE ASC, s.id ASC LIMIT 1`,
    [id, cur.title, cur.title, id],
  )[0];
  return r ? fromRow(r) : null;
}

/** Live (not trashed) scores whose file has this hash — duplicate detection on import. */
export function existingHashes(): Set<string> {
  return new Set(sql().all<{ file_hash: string }>('SELECT file_hash FROM scores WHERE deleted_at IS NULL').map(r => r.file_hash));
}

export type NewScore = {
  title: string;
  composer?: string | null;
  filePath: string;
  fileHash: string;
  fileSize: number;
  pageCount: number;
  originalName?: string | null;
  originalUri?: string | null;
  coverPath?: string | null;
  isSample?: boolean;
};

export function insertScore(s: NewScore, now = Date.now()): string {
  const id = uuidv7(now);
  const db = sql();
  db.tx(() => {
    db.run(
      `INSERT INTO scores (id, title, composer, file_path, file_hash, file_size, page_count, original_name, original_uri, cover_path, is_sample, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        s.title,
        s.composer ?? null,
        s.filePath,
        s.fileHash,
        s.fileSize,
        s.pageCount,
        s.originalName ?? null,
        s.originalUri ?? null,
        s.coverPath ?? null,
        s.isSample ? 1 : 0,
        now,
        now,
      ],
    );
    reindex(id);
  });
  notifyChanged('scores');
  return id;
}

/**
 * Rebuilds a score's search row (title, people, genre, tags, notes). Call inside the write's transaction,
 * for live scores only (trashed scores have no search row). Also used by backup restore.
 */
export function reindex(id: string): void {
  const db = sql();
  db.run('DELETE FROM scores_fts WHERE score_id = ?', [id]);
  db.run(
    `INSERT INTO scores_fts (score_id, title, composer, arranger, genre, tags, notes)
     SELECT s.id, s.title, s.composer, s.arranger, s.genre,
       (SELECT group_concat(t.name, ' ') FROM tags t JOIN score_tags st ON st.tag_id = t.id WHERE st.score_id = s.id),
       s.notes
     FROM scores s WHERE s.id = ?`,
    [id],
  );
}

export type MetadataPatch = Partial<{
  title: string;
  composer: string | null;
  arranger: string | null;
  genre: string | null;
  musicKey: string | null;
  tempoBpm: number | null;
  timeSig: string | null;
  notes: string | null;
  tags: string[];
}>;

const clean = (v: string | null | undefined) => {
  const t = v?.trim();
  return t ? t : null;
};

export function updateMetadata(id: string, patch: MetadataPatch, now = Date.now()): void {
  const sets: string[] = [];
  const params: Scalar[] = [];
  const add = (col: string, v: Scalar) => {
    sets.push(`${col} = ?`);
    params.push(v);
  };
  if (patch.title !== undefined) {
    const title = clean(patch.title);
    if (title) add('title', title);
  }
  if (patch.composer !== undefined) add('composer', clean(patch.composer));
  if (patch.arranger !== undefined) add('arranger', clean(patch.arranger));
  if (patch.genre !== undefined) add('genre', clean(patch.genre));
  if (patch.musicKey !== undefined) add('music_key', clean(patch.musicKey));
  if (patch.tempoBpm !== undefined) add('tempo_bpm', patch.tempoBpm && patch.tempoBpm > 0 ? Math.round(patch.tempoBpm) : null);
  if (patch.timeSig !== undefined) add('time_sig', clean(patch.timeSig));
  if (patch.notes !== undefined) add('notes', clean(patch.notes));
  const db = sql();
  db.tx(() => {
    if (sets.length) {
      add('updated_at', now);
      params.push(id);
      db.run(`UPDATE scores SET ${sets.join(', ')} WHERE id = ?`, params);
    }
    if (patch.tags) setTags(id, patch.tags);
    reindex(id);
  });
  notifyChanged('scores', 'tags');
}

function setTags(scoreId: string, names: string[]): void {
  const db = sql();
  db.run('DELETE FROM score_tags WHERE score_id = ?', [scoreId]);
  // First spelling wins ("Standards" and "standards " are one tag).
  const byKey = new Map<string, string>();
  for (const n of names.map(x => x.trim()).filter(Boolean)) if (!byKey.has(n.toLowerCase())) byKey.set(n.toLowerCase(), n);
  const unique = [...byKey.values()];
  for (const name of unique) {
    const existing = db.all<{ id: string }>('SELECT id FROM tags WHERE name = ? COLLATE NOCASE', [name])[0];
    const tagId = existing?.id ?? uuidv7();
    if (!existing) db.run('INSERT INTO tags (id, name) VALUES (?, ?)', [tagId, name]);
    db.run('INSERT OR IGNORE INTO score_tags (score_id, tag_id) VALUES (?, ?)', [scoreId, tagId]);
  }
  // Tags nobody uses any more disappear from the filter chips.
  db.run('DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM score_tags)');
}

export function setFavorite(ids: readonly string[], favorite: boolean): void {
  if (!ids.length) return;
  sql().run(`UPDATE scores SET is_favorite = ? WHERE id IN (${ids.map(() => '?').join(',')})`, [favorite ? 1 : 0, ...ids]);
  notifyChanged('scores');
}

export type ReaderStatePatch = Partial<{
  readerMode: ReaderModePref;
  halfSplit: number;
  pageFilter: PageFilter | null;
  lastPage: number;
  pageCount: number;
}>;

/**
 * Per-score reader memory. Deliberately does NOT notify listeners: the library doesn't show these
 * fields, and re-querying the library on every page turn would be wasted work.
 */
export function updateReaderState(id: string, patch: ReaderStatePatch): void {
  const sets: string[] = [];
  const params: Scalar[] = [];
  const add = (col: string, v: Scalar) => {
    sets.push(`${col} = ?`);
    params.push(v);
  };
  if (patch.readerMode !== undefined) add('reader_mode', patch.readerMode === 'AUTO' ? null : patch.readerMode);
  if (patch.halfSplit !== undefined) add('half_split', Math.min(0.8, Math.max(0.2, patch.halfSplit)));
  if (patch.pageFilter !== undefined) add('page_filter', patch.pageFilter);
  if (patch.lastPage !== undefined) add('last_page', Math.max(0, Math.round(patch.lastPage)));
  if (patch.pageCount !== undefined) add('page_count', patch.pageCount);
  if (!sets.length) return;
  params.push(id);
  sql().run(`UPDATE scores SET ${sets.join(', ')} WHERE id = ?`, params);
}

export function markOpened(id: string, now = Date.now()): void {
  sql().run('UPDATE scores SET last_opened_at = ?, play_count = play_count + 1 WHERE id = ?', [now, id]);
  notifyChanged('scores');
}

export function countScores(): { total: number; counted: number } {
  const r = sql().all<{ total: number; counted: number }>(
    'SELECT COUNT(*) AS total, COALESCE(SUM(is_sample = 0), 0) AS counted FROM scores WHERE deleted_at IS NULL',
  )[0];
  return r ?? { total: 0, counted: 0 };
}

// --- Trash ------------------------------------------------------------------------------------------

const inList = (ids: readonly string[]) => ids.map(() => '?').join(',');

/** Moves scores to the Trash (restorable for 30 days). Their search rows go with them. */
export function trashScores(ids: readonly string[], now = Date.now()): void {
  if (!ids.length) return;
  const db = sql();
  db.tx(() => {
    db.run(`UPDATE scores SET deleted_at = ? WHERE id IN (${inList(ids)}) AND deleted_at IS NULL`, [now, ...ids]);
    db.run(`DELETE FROM scores_fts WHERE score_id IN (${inList(ids)})`, [...ids]);
  });
  notifyChanged('scores');
}

export function restoreScores(ids: readonly string[]): void {
  if (!ids.length) return;
  const db = sql();
  db.tx(() => {
    db.run(`UPDATE scores SET deleted_at = NULL WHERE id IN (${inList(ids)})`, [...ids]);
    ids.forEach(reindex);
  });
  notifyChanged('scores');
}

export function listTrash(): Score[] {
  return sql()
    .all<Row>(`SELECT ${COLUMNS} FROM scores s WHERE s.deleted_at IS NOT NULL ORDER BY s.deleted_at DESC`)
    .map(fromRow);
}

/** Days left before a trashed score is purged (0 = today). */
export function daysLeftInTrash(deletedAt: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((deletedAt + TRASH_DAYS * DAY_MS - now) / DAY_MS));
}

/**
 * Permanently removes trashed scores. Returns the files (PDF + cover) the caller must delete.
 * Scores still referenced by a setlist are removed from it (the setlist shows the gap as missing).
 */
export function deleteForever(ids: readonly string[]): string[] {
  if (!ids.length) return [];
  const db = sql();
  const files = db
    .all<{ file_path: string; cover_path: string | null }>(`SELECT file_path, cover_path FROM scores WHERE id IN (${inList(ids)}) AND deleted_at IS NOT NULL`, [
      ...ids,
    ])
    .flatMap(r => [r.file_path, r.cover_path].filter((p): p is string => !!p));
  db.tx(() => {
    db.run(`DELETE FROM setlist_items WHERE score_id IN (${inList(ids)})`, [...ids]);
    db.run(`DELETE FROM scores WHERE id IN (${inList(ids)}) AND deleted_at IS NOT NULL`, [...ids]);
    db.run('DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM score_tags)');
  });
  notifyChanged('scores', 'tags', 'setlists', 'setlist_items');
  // A restored backup may point several scores (same file_hash) at one file: keep files still in use.
  return files.filter(f => !db.all('SELECT 1 FROM scores WHERE file_path = ? OR cover_path = ? LIMIT 1', [f, f]).length);
}

/** Trash items older than 30 days. */
export function expiredTrashIds(now = Date.now()): string[] {
  return sql()
    .all<{ id: string }>('SELECT id FROM scores WHERE deleted_at IS NOT NULL AND deleted_at <= ?', [now - TRASH_DAYS * DAY_MS])
    .map(r => r.id);
}

// --- Facets for filter chips -------------------------------------------------------------------------

export type Facet = { value: string; label: string; count: number };

export function listFacets(): { composers: Facet[]; genres: Facet[]; keys: Facet[]; tags: Facet[] } {
  const db = sql();
  const col = (c: string) =>
    db
      .all<{ v: string; n: number }>(
        `SELECT ${c} AS v, COUNT(*) AS n FROM scores WHERE deleted_at IS NULL AND ${c} IS NOT NULL AND ${c} != '' GROUP BY ${c} COLLATE NOCASE ORDER BY ${c} COLLATE NOCASE`,
      )
      .map(r => ({ value: r.v, label: r.v, count: r.n }));
  const tags = db
    .all<{ id: string; name: string; n: number }>(
      `SELECT t.id, t.name, COUNT(*) AS n FROM tags t JOIN score_tags st ON st.tag_id = t.id JOIN scores s ON s.id = st.score_id
       WHERE s.deleted_at IS NULL GROUP BY t.id ORDER BY t.name COLLATE NOCASE`,
    )
    .map(r => ({ value: r.id, label: r.name, count: r.n }));
  return { composers: col('composer'), genres: col('genre'), keys: col('music_key'), tags };
}
