import { notifyChanged } from '@/data/db/live';
import { sql } from '@/data/db/runner';
import { uuidv7 } from '@/data/ids';

export type Collection = { id: string; name: string; count: number; coverPath: string | null };

const COLLECTION_COLUMNS = `c.id, c.name,
  (SELECT COUNT(*) FROM collection_scores cs JOIN scores s ON s.id = cs.score_id WHERE cs.collection_id = c.id AND s.deleted_at IS NULL) AS n,
  (SELECT s.cover_path FROM collection_scores cs JOIN scores s ON s.id = cs.score_id
     WHERE cs.collection_id = c.id AND s.deleted_at IS NULL ORDER BY cs.added_at, s.title COLLATE NOCASE, s.id LIMIT 1) AS cover`;
type CollectionListRow = { id: string; name: string; n: number; cover: string | null };
const toCollection = (r: CollectionListRow): Collection => ({ id: r.id, name: r.name, count: r.n, coverPath: r.cover });

export function listCollections(): Collection[] {
  return sql().all<CollectionListRow>(`SELECT ${COLLECTION_COLUMNS} FROM collections c ORDER BY c.name COLLATE NOCASE`).map(toCollection);
}

export function createCollection(name: string, now = Date.now()): string {
  const id = uuidv7(now);
  sql().run('INSERT INTO collections (id, name, created_at, updated_at) VALUES (?,?,?,?)', [id, name.trim(), now, now]);
  notifyChanged('collections');
  return id;
}

/** Folder import: reuse a collection with the same name (case-insensitive) instead of duplicating it. */
export function findOrCreateCollection(name: string, now = Date.now()): string {
  const existing = sql().all<{ id: string }>('SELECT id FROM collections WHERE name = ? COLLATE NOCASE', [name.trim()])[0];
  return existing?.id ?? createCollection(name, now);
}

export function addToCollection(collectionId: string, scoreIds: readonly string[], now = Date.now()): void {
  const db = sql();
  db.tx(() => {
    for (const id of scoreIds) {
      db.run('INSERT OR IGNORE INTO collection_scores (collection_id, score_id, added_at) VALUES (?,?,?)', [collectionId, id, now]);
    }
  });
  notifyChanged('collections');
}

export function removeFromCollection(collectionId: string, scoreIds: readonly string[]): void {
  if (!scoreIds.length) return;
  sql().run(`DELETE FROM collection_scores WHERE collection_id = ? AND score_id IN (${scoreIds.map(() => '?').join(',')})`, [collectionId, ...scoreIds]);
  notifyChanged('collections');
}

export function getCollection(id: string): Collection | null {
  const r = sql().all<CollectionListRow>(`SELECT ${COLLECTION_COLUMNS} FROM collections c WHERE c.id = ?`, [id])[0];
  return r ? toCollection(r) : null;
}

const COVERS_SQL = `SELECT collection_id AS id, cover_path AS cover FROM (
    SELECT cs.collection_id, s.cover_path,
      ROW_NUMBER() OVER (PARTITION BY cs.collection_id ORDER BY cs.added_at, s.title COLLATE NOCASE, s.id) AS rn
    FROM collection_scores cs JOIN scores s ON s.id = cs.score_id
    WHERE s.deleted_at IS NULL AND s.cover_path IS NOT NULL %WHERE%
  ) WHERE rn <= ? ORDER BY collection_id, rn`;

/** Up to `limit` cover images of a collection's live scores, oldest membership first (for stacked artwork). */
export function collectionCovers(collectionId: string, limit = 3): string[] {
  return sql()
    .all<{ id: string; cover: string }>(COVERS_SQL.replace('%WHERE%', 'AND cs.collection_id = ?'), [collectionId, limit])
    .map(r => r.cover);
}

/** collectionCovers for every collection in one query (the Collections grid). */
export function allCollectionCovers(limit = 3): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const r of sql().all<{ id: string; cover: string }>(COVERS_SQL.replace('%WHERE%', ''), [limit])) {
    const list = out.get(r.id);
    if (list) list.push(r.cover);
    else out.set(r.id, [r.cover]);
  }
  return out;
}

/** Collections this score belongs to, by name. */
export function collectionsForScore(scoreId: string): Collection[] {
  return sql()
    .all<CollectionListRow>(
      `SELECT ${COLLECTION_COLUMNS} FROM collections c
       WHERE EXISTS (SELECT 1 FROM collection_scores cs WHERE cs.collection_id = c.id AND cs.score_id = ?)
       ORDER BY c.name COLLATE NOCASE`,
      [scoreId],
    )
    .map(toCollection);
}

/** A blank name is ignored (never blanks a collection's name). */
export function renameCollection(id: string, name: string, now = Date.now()): void {
  const n = name.trim();
  if (!n) return;
  sql().run('UPDATE collections SET name = ?, updated_at = ? WHERE id = ?', [n, now, id]);
  notifyChanged('collections');
}

/** Raw rows, for Undo. Treat as opaque. */
export type CollectionSnapshot = {
  collection: { id: string; name: string; sort: number; created_at: number; updated_at: number };
  members: Array<{ collection_id: string; score_id: string; added_at: number }>;
};

/** Deletes a collection (never its scores). Keep the snapshot for Undo (restoreCollection). */
export function deleteCollection(id: string): CollectionSnapshot | null {
  const db = sql();
  const snap = db.tx(() => {
    const collection = db.all<CollectionSnapshot['collection']>('SELECT id, name, sort, created_at, updated_at FROM collections WHERE id = ?', [id])[0];
    if (!collection) return null;
    const members = db.all<CollectionSnapshot['members'][number]>(
      'SELECT collection_id, score_id, added_at FROM collection_scores WHERE collection_id = ?',
      [id],
    );
    db.run('DELETE FROM collections WHERE id = ?', [id]); // memberships cascade
    return { collection, members };
  });
  if (snap) notifyChanged('collections', 'scores');
  return snap;
}

/** Undo for deleteCollection. Scores deleted for good in the meantime are skipped. */
export function restoreCollection(snapshot: CollectionSnapshot): void {
  const c = snapshot.collection;
  const db = sql();
  db.tx(() => {
    db.run('INSERT OR IGNORE INTO collections (id, name, sort, created_at, updated_at) VALUES (?,?,?,?,?)', [
      c.id,
      c.name,
      c.sort,
      c.created_at,
      c.updated_at,
    ]);
    for (const m of snapshot.members) {
      db.run(
        'INSERT OR IGNORE INTO collection_scores (collection_id, score_id, added_at) SELECT ?, id, ? FROM scores WHERE id = ?',
        [m.collection_id, m.added_at, m.score_id],
      );
    }
  });
  notifyChanged('collections', 'scores');
}
