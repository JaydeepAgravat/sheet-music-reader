import { notifyChanged } from '@/data/db/live';
import { sql, type Scalar } from '@/data/db/runner';
import { uuidv7 } from '@/data/ids';
import { normalizeForSearch } from '@/domain/search/query';

/**
 * Setlists (docs/PLAN.md Phase 6, §1.4 "Setlists").
 *
 * - Items keep their row when the score is trashed: listItems() returns it with `score.deleted`, and
 *   the UI shows "missing · Restore". When a score is deleted for good, migration v4's trigger drops
 *   its items, so listItems() never returns an entry without a score.
 * - The same score may appear more than once (a reprise), so items are addressed by item id.
 * - Positions are dense 0..n-1 after every write this module makes (a trigger delete can leave a gap,
 *   which is harmless: ordering is by position, and the next reorder renumbers).
 * - Writes bump the setlist's updated_at, which orders undated setlists.
 */

export type Setlist = {
  id: string;
  name: string;
  /** Local calendar date, YYYY-MM-DD. */
  eventDate: string | null;
  notes: string | null;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
  /** All entries, missing ones included. */
  itemCount: number;
  /** Entries whose score is in the Trash. */
  missingCount: number;
  /** Covers of the first (up to 4) live scores, in setlist order, without repeats. */
  coverPaths: string[];
};

export type SetlistItem = {
  id: string;
  setlistId: string;
  scoreId: string;
  position: number;
  /** 0-based page the reader opens this entry on. */
  startPage: number;
  notes: string | null;
  score: { id: string; title: string; composer: string | null; pageCount: number; coverPath: string | null; deleted: boolean };
};

/** Raw rows, for Undo. Treat as opaque. */
export type SetlistRow = {
  id: string;
  name: string;
  event_date: string | null;
  notes: string | null;
  archived: number;
  created_at: number;
  updated_at: number;
};
export type SetlistItemRow = {
  id: string;
  setlist_id: string;
  score_id: string;
  position: number;
  start_page: number;
  notes: string | null;
};
export type SetlistSnapshot = { setlist: SetlistRow; items: SetlistItemRow[] };

export type SetlistPatch = Partial<{ name: string; eventDate: string | null; notes: string | null; archived: boolean }>;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const inList = (ids: readonly string[]) => ids.map(() => '?').join(',');

const clean = (v: string | null | undefined) => {
  const t = v?.trim();
  return t ? t : null;
};

/** Anything that is not a YYYY-MM-DD string is stored as "no date". */
function cleanDate(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t && DATE.test(t) ? t : null;
}

/** Today's local date as YYYY-MM-DD (what event dates are compared against). */
export function localIsoDate(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

type ListRow = SetlistRow & { item_count: number; missing_count: number };

const LIST_COLUMNS = `sl.id, sl.name, sl.event_date, sl.notes, sl.archived, sl.created_at, sl.updated_at,
  (SELECT COUNT(*) FROM setlist_items si WHERE si.setlist_id = sl.id) AS item_count,
  (SELECT COUNT(*) FROM setlist_items si JOIN scores s ON s.id = si.score_id WHERE si.setlist_id = sl.id AND s.deleted_at IS NOT NULL) AS missing_count`;

/** Upcoming (today or later) ascending → undated, most recently edited first → past, most recent first. */
const LIST_ORDER = `CASE WHEN sl.event_date >= ?1 THEN 0 WHEN sl.event_date IS NULL THEN 1 ELSE 2 END,
  CASE WHEN sl.event_date >= ?1 THEN sl.event_date END ASC,
  CASE WHEN sl.event_date IS NULL THEN sl.updated_at END DESC,
  CASE WHEN sl.event_date < ?1 THEN sl.event_date END DESC,
  sl.name COLLATE NOCASE, sl.id`;

/** Covers for many setlists in one query. */
function coversFor(ids: readonly string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (!ids.length) return out;
  const rows = sql().all<{ setlist_id: string; cover_path: string }>(
    `SELECT si.setlist_id, s.cover_path FROM setlist_items si JOIN scores s ON s.id = si.score_id
     WHERE si.setlist_id IN (${inList(ids)}) AND s.deleted_at IS NULL AND s.cover_path IS NOT NULL
     ORDER BY si.setlist_id, si.position`,
    [...ids],
  );
  for (const r of rows) {
    let list = out.get(r.setlist_id);
    if (!list) out.set(r.setlist_id, (list = []));
    if (list.length < 4 && !list.includes(r.cover_path)) list.push(r.cover_path);
  }
  return out;
}

function query(where: string, params: Scalar[], today: string): Setlist[] {
  // ?1 is `today` (used by LIST_ORDER); the WHERE clause's own parameters follow it.
  const rows = sql().all<ListRow>(`SELECT ${LIST_COLUMNS} FROM setlists sl WHERE ${where} ORDER BY ${LIST_ORDER}`, [today, ...params]);
  const covers = coversFor(rows.map(r => r.id));
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    eventDate: r.event_date,
    notes: r.notes,
    archived: r.archived === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    itemCount: r.item_count,
    missingCount: r.missing_count,
    coverPaths: covers.get(r.id) ?? [],
  }));
}

/**
 * Active setlists by default; `archived: true` lists the archive instead.
 * `today` (YYYY-MM-DD) splits upcoming from past events; tests pin it.
 */
export function listSetlists(opts: { archived?: boolean; today?: string } = {}): Setlist[] {
  return query('sl.archived = ?2', [opts.archived ? 1 : 0], opts.today ?? localIsoDate());
}

export function getSetlist(id: string): Setlist | null {
  return query('sl.id = ?2', [id], localIsoDate())[0] ?? null;
}

/** Every setlist (active and archived) — the free tier allows one. */
export function countSetlists(): number {
  return sql().all<{ n: number }>('SELECT COUNT(*) AS n FROM setlists')[0]?.n ?? 0;
}

// --- Setlist writes ----------------------------------------------------------------------------------

function touch(setlistId: string, now: number): void {
  sql().run('UPDATE setlists SET updated_at = ? WHERE id = ?', [now, setlistId]);
}

/** Throws on a blank name (the UI always supplies one). An invalid date is stored as no date. */
export function createSetlist(name: string, eventDate?: string | null, now = Date.now()): string {
  const n = clean(name);
  if (!n) throw new Error('Setlist name is required');
  const id = uuidv7(now);
  sql().run('INSERT INTO setlists (id, name, event_date, archived, created_at, updated_at) VALUES (?,?,?,0,?,?)', [
    id,
    n,
    cleanDate(eventDate),
    now,
    now,
  ]);
  notifyChanged('setlists');
  return id;
}

/** A blank name is ignored (never blanks a setlist's name). Invalid dates clear the date. */
export function updateSetlist(id: string, patch: SetlistPatch, now = Date.now()): void {
  const sets: string[] = [];
  const params: Scalar[] = [];
  const add = (col: string, v: Scalar) => {
    sets.push(`${col} = ?`);
    params.push(v);
  };
  if (patch.name !== undefined) {
    const n = clean(patch.name);
    if (n) add('name', n);
  }
  if (patch.eventDate !== undefined) add('event_date', cleanDate(patch.eventDate));
  if (patch.notes !== undefined) add('notes', clean(patch.notes));
  if (patch.archived !== undefined) add('archived', patch.archived ? 1 : 0);
  if (!sets.length) return;
  add('updated_at', now);
  params.push(id);
  sql().run(`UPDATE setlists SET ${sets.join(', ')} WHERE id = ?`, params);
  // Archiving changes the library's "in a setlist" badge.
  if (patch.archived !== undefined) notifyChanged('setlists', 'scores');
  else notifyChanged('setlists');
}

export function renameSetlist(id: string, name: string, now = Date.now()): void {
  updateSetlist(id, { name }, now);
}

/** Copies name/notes and every entry (start pages and notes too). The copy is undated and active. */
export function duplicateSetlist(id: string, newName: string, now = Date.now()): string | null {
  const src = sql().all<SetlistRow>('SELECT * FROM setlists WHERE id = ?', [id])[0];
  if (!src) return null;
  const newId = uuidv7(now);
  const db = sql();
  db.tx(() => {
    db.run('INSERT INTO setlists (id, name, event_date, notes, archived, created_at, updated_at) VALUES (?,?,NULL,?,0,?,?)', [
      newId,
      clean(newName) ?? src.name,
      src.notes,
      now,
      now,
    ]);
    const items = db.all<SetlistItemRow>('SELECT * FROM setlist_items WHERE setlist_id = ? ORDER BY position, id', [id]);
    items.forEach((it, i) => {
      db.run('INSERT INTO setlist_items (id, setlist_id, score_id, position, start_page, notes) VALUES (?,?,?,?,?,?)', [
        uuidv7(now),
        newId,
        it.score_id,
        i,
        it.start_page,
        it.notes,
      ]);
    });
  });
  notifyChanged('setlists', 'setlist_items', 'scores');
  return newId;
}

/** Deletes a setlist and its entries. Keep the snapshot for Undo (restoreSetlist). */
export function deleteSetlist(id: string): SetlistSnapshot | null {
  const db = sql();
  const snap = db.tx(() => {
    const setlist = db.all<SetlistRow>('SELECT * FROM setlists WHERE id = ?', [id])[0];
    if (!setlist) return null;
    const items = db.all<SetlistItemRow>('SELECT * FROM setlist_items WHERE setlist_id = ? ORDER BY position, id', [id]);
    db.run('DELETE FROM setlists WHERE id = ?', [id]); // items cascade
    return { setlist, items };
  });
  if (snap) notifyChanged('setlists', 'setlist_items', 'scores');
  return snap;
}

/** Undo for deleteSetlist. Entries whose score was deleted for good in the meantime are dropped. */
export function restoreSetlist(snapshot: SetlistSnapshot): void {
  const s = snapshot.setlist;
  const db = sql();
  db.tx(() => {
    db.run('INSERT OR IGNORE INTO setlists (id, name, event_date, notes, archived, created_at, updated_at) VALUES (?,?,?,?,?,?,?)', [
      s.id,
      s.name,
      s.event_date,
      s.notes,
      s.archived,
      s.created_at,
      s.updated_at,
    ]);
    for (const it of snapshot.items) insertItemRow(it);
    renumber(s.id);
  });
  notifyChanged('setlists', 'setlist_items', 'scores');
}

// --- Items -------------------------------------------------------------------------------------------

type ItemJoinRow = SetlistItemRow & {
  title: string;
  composer: string | null;
  page_count: number;
  cover_path: string | null;
  deleted_at: number | null;
};

/** Entries in order, trashed scores included (score.deleted = true). */
export function listItems(setlistId: string): SetlistItem[] {
  return sql()
    .all<ItemJoinRow>(
      `SELECT si.id, si.setlist_id, si.score_id, si.position, si.start_page, si.notes,
         s.title, s.composer, s.page_count, s.cover_path, s.deleted_at
       FROM setlist_items si JOIN scores s ON s.id = si.score_id
       WHERE si.setlist_id = ? ORDER BY si.position, si.id`,
      [setlistId],
    )
    .map(r => ({
      id: r.id,
      setlistId: r.setlist_id,
      scoreId: r.score_id,
      position: r.position,
      startPage: r.start_page,
      notes: r.notes,
      score: {
        id: r.score_id,
        title: r.title,
        composer: r.composer,
        pageCount: r.page_count,
        coverPath: r.cover_path,
        deleted: r.deleted_at !== null,
      },
    }));
}

function orderedItemIds(setlistId: string): string[] {
  return sql()
    .all<{ id: string }>('SELECT id FROM setlist_items WHERE setlist_id = ? ORDER BY position, id', [setlistId])
    .map(r => r.id);
}

/** Rewrites positions as 0..n-1 in the given (or current) order. Call inside a transaction. */
function renumber(setlistId: string, ids: readonly string[] = orderedItemIds(setlistId)): void {
  ids.forEach((id, i) => sql().run('UPDATE setlist_items SET position = ? WHERE id = ? AND position != ?', [i, id, i]));
}

/** Inserts an item row unless its setlist or score is gone. Returns whether it was inserted. */
function insertItemRow(it: SetlistItemRow): boolean {
  const db = sql();
  const ok = db.all<{ ok: number }>(
    'SELECT (EXISTS (SELECT 1 FROM setlists WHERE id = ?) AND EXISTS (SELECT 1 FROM scores WHERE id = ?)) AS ok',
    [it.setlist_id, it.score_id],
  )[0]?.ok;
  if (!ok) return false;
  db.run('INSERT OR IGNORE INTO setlist_items (id, setlist_id, score_id, position, start_page, notes) VALUES (?,?,?,?,?,?)', [
    it.id,
    it.setlist_id,
    it.score_id,
    it.position,
    it.start_page,
    it.notes,
  ]);
  return true;
}

/**
 * Adds scores (in the given order) at `atPosition` (clamped; default: the end). Repeats are allowed
 * (a reprise). Trashed or unknown scores are skipped. Returns the new item ids.
 */
export function addToSetlist(setlistId: string, scoreIds: readonly string[], atPosition?: number, now = Date.now()): string[] {
  const db = sql();
  const added = db.tx(() => {
    if (!db.all('SELECT 1 FROM setlists WHERE id = ?', [setlistId]).length) return [];
    const live = new Set(
      scoreIds.length
        ? db.all<{ id: string }>(`SELECT id FROM scores WHERE id IN (${inList(scoreIds)}) AND deleted_at IS NULL`, [...scoreIds]).map(r => r.id)
        : [],
    );
    const ids = orderedItemIds(setlistId);
    const at = Math.max(0, Math.min(Math.round(atPosition ?? ids.length), ids.length));
    const newIds: string[] = [];
    for (const scoreId of scoreIds) {
      if (!live.has(scoreId)) continue;
      const id = uuidv7(now);
      db.run('INSERT INTO setlist_items (id, setlist_id, score_id, position, start_page) VALUES (?,?,?,?,0)', [
        id,
        setlistId,
        scoreId,
        at + newIds.length,
      ]);
      newIds.push(id);
    }
    if (newIds.length) {
      renumber(setlistId, [...ids.slice(0, at), ...newIds, ...ids.slice(at)]);
      touch(setlistId, now);
    }
    return newIds;
  });
  if (added.length) notifyChanged('setlists', 'setlist_items', 'scores');
  return added;
}

/** Removes entries. Keep the returned rows for Undo (restoreItems). */
export function removeItems(itemIds: readonly string[], now = Date.now()): SetlistItemRow[] {
  if (!itemIds.length) return [];
  const db = sql();
  const rows = db.tx(() => {
    const removed = db.all<SetlistItemRow>(`SELECT * FROM setlist_items WHERE id IN (${inList(itemIds)}) ORDER BY setlist_id, position`, [...itemIds]);
    db.run(`DELETE FROM setlist_items WHERE id IN (${inList(itemIds)})`, [...itemIds]);
    for (const setlistId of new Set(removed.map(r => r.setlist_id))) {
      renumber(setlistId);
      touch(setlistId, now);
    }
    return removed;
  });
  if (rows.length) notifyChanged('setlists', 'setlist_items', 'scores');
  return rows;
}

/**
 * Undo for removeItems: puts each entry back at its old position (the list returns to exactly what it
 * was if nothing else changed). Entries whose setlist or score is gone for good are dropped.
 */
export function restoreItems(rows: readonly SetlistItemRow[], now = Date.now()): void {
  if (!rows.length) return;
  const db = sql();
  const sorted = [...rows].sort((a, b) => a.setlist_id.localeCompare(b.setlist_id) || a.position - b.position);
  const touched = new Set<string>();
  db.tx(() => {
    for (const it of sorted) {
      // Ascending positions: each earlier re-insert has already made room for the later ones.
      db.run('UPDATE setlist_items SET position = position + 1 WHERE setlist_id = ? AND position >= ?', [it.setlist_id, it.position]);
      if (insertItemRow(it)) touched.add(it.setlist_id);
    }
    for (const id of new Set(sorted.map(r => r.setlist_id))) renumber(id);
    for (const id of touched) touch(id, now);
  });
  notifyChanged('setlists', 'setlist_items', 'scores');
}

/** Drag-reorder: moves one entry to `toIndex` (clamped) and renumbers 0..n-1 in one transaction. */
export function moveItem(setlistId: string, itemId: string, toIndex: number, now = Date.now()): void {
  const db = sql();
  const moved = db.tx(() => {
    const ids = orderedItemIds(setlistId);
    const from = ids.indexOf(itemId);
    if (from < 0) return false;
    const to = Math.max(0, Math.min(Math.round(toIndex), ids.length - 1));
    ids.splice(from, 1);
    ids.splice(to, 0, itemId);
    renumber(setlistId, ids);
    touch(setlistId, now);
    return true;
  });
  if (moved) notifyChanged('setlists', 'setlist_items');
}

/** Per-entry start page (clamped to the score's pages) and notes (blank clears). */
export function updateItem(itemId: string, patch: Partial<{ startPage: number; notes: string | null }>, now = Date.now()): void {
  const db = sql();
  const cur = db.all<{ setlist_id: string; page_count: number }>(
    'SELECT si.setlist_id, s.page_count FROM setlist_items si JOIN scores s ON s.id = si.score_id WHERE si.id = ?',
    [itemId],
  )[0];
  if (!cur) return;
  const sets: string[] = [];
  const params: Scalar[] = [];
  if (patch.startPage !== undefined) {
    let p = Math.max(0, Math.round(patch.startPage));
    if (cur.page_count > 0) p = Math.min(p, cur.page_count - 1);
    sets.push('start_page = ?');
    params.push(p);
  }
  if (patch.notes !== undefined) {
    sets.push('notes = ?');
    params.push(clean(patch.notes));
  }
  if (!sets.length) return;
  db.tx(() => {
    db.run(`UPDATE setlist_items SET ${sets.join(', ')} WHERE id = ?`, [...params, itemId]);
    touch(cur.setlist_id, now);
  });
  notifyChanged('setlists', 'setlist_items');
}

// --- Membership & search -----------------------------------------------------------------------------

/** Setlists (active and archived) that contain this score, in list order. */
export function setlistsContaining(scoreId: string, today = localIsoDate()): Setlist[] {
  return query('EXISTS (SELECT 1 FROM setlist_items si WHERE si.setlist_id = sl.id AND si.score_id = ?2)', [scoreId], today);
}

/** Scores in at least one active (non-archived) setlist — same rule as Score.inSetlist. */
export function scoresInAnySetlist(): Set<string> {
  return new Set(
    sql()
      .all<{ score_id: string }>('SELECT DISTINCT si.score_id FROM setlist_items si JOIN setlists sl ON sl.id = si.setlist_id WHERE sl.archived = 0')
      .map(r => r.score_id),
  );
}

/**
 * Grouped search ("Setlists"): case- and accent-insensitive. Ranked: name starts with the query →
 * every query word starts a word of the name → name contains the query. Active before archived.
 */
export function searchSetlists(input: string, limit = 8, today = localIsoDate()): Setlist[] {
  const q = normalizeForSearch(input);
  if (!q) return [];
  const words = q.split(' ');
  const rank = (name: string): number => {
    const n = normalizeForSearch(name);
    if (n.startsWith(q)) return 0;
    const hay = n.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    if (words.every(w => hay.some(h => h.startsWith(w)))) return 1;
    if (n.includes(q)) return 2;
    return -1;
  };
  return query('1', [], today)
    .map(s => ({ s, r: rank(s.name) }))
    .filter(x => x.r >= 0)
    .sort((a, b) => Number(a.s.archived) - Number(b.s.archived) || a.r - b.r)
    .slice(0, limit)
    .map(x => x.s);
}
