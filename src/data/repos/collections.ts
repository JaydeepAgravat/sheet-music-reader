import { notifyChanged } from '@/data/db/live';
import { sql } from '@/data/db/runner';
import { uuidv7 } from '@/data/ids';

export type Collection = { id: string; name: string; count: number; coverPath: string | null };

export function listCollections(): Collection[] {
  return sql()
    .all<{ id: string; name: string; n: number; cover: string | null }>(
      `SELECT c.id, c.name,
         (SELECT COUNT(*) FROM collection_scores cs JOIN scores s ON s.id = cs.score_id WHERE cs.collection_id = c.id AND s.deleted_at IS NULL) AS n,
         (SELECT s.cover_path FROM collection_scores cs JOIN scores s ON s.id = cs.score_id
            WHERE cs.collection_id = c.id AND s.deleted_at IS NULL ORDER BY cs.added_at LIMIT 1) AS cover
       FROM collections c ORDER BY c.name COLLATE NOCASE`,
    )
    .map(r => ({ id: r.id, name: r.name, count: r.n, coverPath: r.cover }));
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
