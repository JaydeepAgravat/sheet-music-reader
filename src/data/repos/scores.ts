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
};

const COLUMNS =
  'id, title, composer, file_path, page_count, cover_path, is_sample, is_favorite, reader_mode, half_split, page_filter, last_page, last_opened_at, created_at';

const MODES: ReaderModePref[] = ['SINGLE', 'TWO_UP', 'HALF'];
const FILTERS: PageFilter[] = ['ORIGINAL', 'PAPER', 'SEPIA', 'NIGHT', 'CONTRAST'];

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
  };
}

export type ScoreSort = 'title' | 'composer' | 'recent' | 'added';

const ORDER: Record<ScoreSort, string> = {
  title: 'title COLLATE NOCASE ASC',
  composer: "COALESCE(NULLIF(composer, ''), '￿') COLLATE NOCASE ASC, title COLLATE NOCASE ASC",
  recent: 'last_opened_at IS NULL, last_opened_at DESC, title COLLATE NOCASE ASC',
  added: 'created_at DESC',
};

export function listScores(sort: ScoreSort = 'title'): Score[] {
  return sql()
    .all<Row>(`SELECT ${COLUMNS} FROM scores WHERE deleted_at IS NULL ORDER BY ${ORDER[sort]}`)
    .map(fromRow);
}

export function getScore(id: string): Score | null {
  const r = sql().all<Row>(`SELECT ${COLUMNS} FROM scores WHERE id = ?`, [id])[0];
  return r ? fromRow(r) : null;
}

/** The score after `id` in title order — "Next in library" on the end-of-score card. */
export function nextInLibrary(id: string): Score | null {
  const cur = getScore(id);
  if (!cur) return null;
  const r = sql().all<Row>(
    `SELECT ${COLUMNS} FROM scores
     WHERE deleted_at IS NULL AND id != ? AND (title COLLATE NOCASE > ? OR (title COLLATE NOCASE = ? AND id > ?))
     ORDER BY title COLLATE NOCASE ASC, id ASC LIMIT 1`,
    [id, cur.title, cur.title, id],
  )[0];
  return r ? fromRow(r) : null;
}

export type NewScore = {
  title: string;
  composer?: string | null;
  filePath: string;
  fileHash: string;
  fileSize: number;
  pageCount: number;
  originalName?: string | null;
  coverPath?: string | null;
  isSample?: boolean;
};

export function insertScore(s: NewScore, now = Date.now()): string {
  const id = uuidv7(now);
  const db = sql();
  db.tx(() => {
    db.run(
      `INSERT INTO scores (id, title, composer, file_path, file_hash, file_size, page_count, original_name, cover_path, is_sample, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, s.title, s.composer ?? null, s.filePath, s.fileHash, s.fileSize, s.pageCount, s.originalName ?? null, s.coverPath ?? null, s.isSample ? 1 : 0, now, now],
    );
    db.run('INSERT INTO scores_fts (score_id, title, composer) VALUES (?,?,?)', [id, s.title, s.composer ?? null]);
  });
  notifyChanged('scores');
  return id;
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
