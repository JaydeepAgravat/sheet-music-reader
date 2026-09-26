import { open, type DB } from '@op-engineering/op-sqlite';
import { migrate, type SqlExecutor } from './migrations';

let instance: DB | null = null;

/** Opens (once) the library database and brings its schema up to date. */
export function getDb(): DB {
  if (instance) return instance;
  const db = open({ name: 'library.db' });
  // WAL: readers never block the writer (smooth scrolling during imports).
  db.executeSync('PRAGMA journal_mode = WAL;');
  db.executeSync('PRAGMA synchronous = NORMAL;');
  db.executeSync('PRAGMA foreign_keys = ON;');
  const exec: SqlExecutor = {
    exec: sql => {
      // op-sqlite executes one statement per call; split on statement boundaries.
      for (const stmt of splitStatements(sql)) db.executeSync(stmt);
    },
    all: <T,>(sql: string) => db.executeSync(sql).rows as T[],
  };
  migrate(exec);
  instance = db;
  return db;
}

/** Splits a migration script into statements. Our migrations contain no semicolons inside strings. */
export function splitStatements(sql: string): string[] {
  return sql
    .replace(/--[^\n]*/g, '')
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => `${s};`);
}
