import { DatabaseSync } from 'node:sqlite';
import { migrate } from '@/data/db/migrations';
import { setSqlRunnerForTests, type SqlRunner } from '@/data/db/runner';

/** A fresh, fully migrated in-memory database wired in as the app's SQL runner. */
export function createTestDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  const runner: SqlRunner = {
    run: (q, p = []) => {
      db.prepare(q).run(...p);
    },
    all: <T,>(q: string, p: (string | number | null)[] = []) => db.prepare(q).all(...p) as T[],
    tx: fn => {
      db.exec('BEGIN');
      try {
        const out = fn();
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
  migrate({ exec: s => db.exec(s), all: <T,>(s: string) => db.prepare(s).all() as T[] });
  setSqlRunnerForTests(runner);
  return db;
}
