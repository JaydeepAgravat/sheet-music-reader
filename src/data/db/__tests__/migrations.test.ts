/**
 * Runs the real migration SQL against Node's built-in SQLite (FTS5 included),
 * so schema mistakes are caught in CI rather than on a device.
 */
import { DatabaseSync } from 'node:sqlite';
import { LATEST_VERSION, migrate, type SqlExecutor } from '../migrations';

function memoryDb(): { db: DatabaseSync; exec: SqlExecutor } {
  const db = new DatabaseSync(':memory:');
  return {
    db,
    exec: { exec: sql => db.exec(sql), all: <T,>(sql: string) => db.prepare(sql).all() as T[] },
  };
}

const now = Date.now();
const insertScore = (db: DatabaseSync, id: string, title: string, composer: string) =>
  db
    .prepare(
      'INSERT INTO scores (id, title, composer, file_path, file_hash, file_size, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)',
    )
    .run(id, title, composer, `/scores/${id}.pdf`, `h-${id}`, 1000, now, now);

describe('migrations', () => {
  it('applies every migration on a fresh database', () => {
    const { exec } = memoryDb();
    expect(migrate(exec)).toEqual(Array.from({ length: LATEST_VERSION }, (_, i) => i + 1));
    expect(exec.all<{ user_version: number }>('PRAGMA user_version')[0]?.user_version).toBe(LATEST_VERSION);
  });

  it('is idempotent', () => {
    const { exec } = memoryDb();
    migrate(exec);
    expect(migrate(exec)).toEqual([]);
  });

  it('refuses to run against a newer schema', () => {
    const { exec } = memoryDb();
    exec.exec(`PRAGMA user_version = ${LATEST_VERSION + 1}`);
    expect(() => migrate(exec)).toThrow(/newer than this app/);
  });

  it('search is accent-insensitive and prefix-matching', () => {
    const { db, exec } = memoryDb();
    migrate(exec);
    insertScore(db, 'a', 'Symphony No. 9', 'Antonín Dvořák');
    insertScore(db, 'b', 'Gymnopédie No. 1', 'Erik Satie');
    const add = db.prepare('INSERT INTO scores_fts (score_id, title, composer) SELECT id, title, composer FROM scores WHERE id = ?');
    add.run('a');
    add.run('b');
    const find = (q: string) => db.prepare('SELECT score_id FROM scores_fts WHERE scores_fts MATCH ?').all(q).map(r => r.score_id);
    expect(find('dvorak')).toEqual(['a']);
    expect(find('gymnopedie')).toEqual(['b']);
    expect(find('gym*')).toEqual(['b']);
    expect(find('sat*')).toEqual(['b']);
  });

  it('deleting a collection removes its memberships, not the scores', () => {
    const { db, exec } = memoryDb();
    migrate(exec);
    insertScore(db, 's1', 'Autumn Leaves', 'Joseph Kosma');
    db.prepare('INSERT INTO collections (id, name, created_at, updated_at) VALUES (?,?,?,?)').run('c1', 'Jazz', now, now);
    db.prepare('INSERT INTO collection_scores (collection_id, score_id, added_at) VALUES (?,?,?)').run('c1', 's1', now);
    db.prepare('DELETE FROM collections WHERE id = ?').run('c1');
    expect(db.prepare('SELECT COUNT(*) AS n FROM collection_scores').get()?.n).toBe(0);
  });
});
