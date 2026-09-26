import { getDb } from './database';

/**
 * The tiny SQL surface repositories use. The app backs it with op-sqlite (synchronous JSI calls,
 * sub-millisecond for our queries); tests back it with node:sqlite, so repository SQL is tested for real.
 */
export type Scalar = string | number | null;
export type SqlRunner = {
  run: (sql: string, params?: Scalar[]) => void;
  all: <T>(sql: string, params?: Scalar[]) => T[];
  /** Runs fn inside BEGIN/COMMIT (ROLLBACK on throw). */
  tx: <T>(fn: () => T) => T;
};

let runner: SqlRunner | null = null;

export function sql(): SqlRunner {
  if (runner) return runner;
  const db = getDb();
  const r: SqlRunner = {
    run: (q, p) => {
      db.executeSync(q, p);
    },
    all: <T,>(q: string, p?: Scalar[]) => db.executeSync(q, p).rows as T[],
    tx: fn => {
      db.executeSync('BEGIN IMMEDIATE;');
      try {
        const out = fn();
        db.executeSync('COMMIT;');
        return out;
      } catch (e) {
        db.executeSync('ROLLBACK;');
        throw e;
      }
    },
  };
  runner = r;
  return r;
}

/** Tests: swap in a node:sqlite-backed runner. */
export function setSqlRunnerForTests(r: SqlRunner | null): void {
  runner = r;
}
