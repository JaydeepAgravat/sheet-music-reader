import { getDb } from './database';

/**
 * The tiny SQL surface repositories use. The app backs it with op-sqlite (synchronous JSI calls,
 * sub-millisecond for our queries); tests back it with node:sqlite, so repository SQL is tested for real.
 */
/** Uint8Array binds as a BLOB. Blobs read back as ArrayBuffer (op-sqlite) or Uint8Array (node:sqlite): use toBytes(). */
export type Scalar = string | number | null | Uint8Array;
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

/** Normalises a BLOB column value (ArrayBuffer from op-sqlite, Uint8Array from node:sqlite) to a Uint8Array. */
export function toBytes(v: unknown): Uint8Array {
  if (v instanceof Uint8Array) return v;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  if (ArrayBuffer.isView(v)) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  return new Uint8Array(0);
}
