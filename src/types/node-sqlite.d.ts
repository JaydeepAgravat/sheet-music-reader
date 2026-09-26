/**
 * Minimal typings for Node's built-in SQLite, used only by Jest tests that run our real
 * migration SQL. (Full @types/node would leak Node globals into React Native code.)
 */
declare module 'node:sqlite' {
  type Row = Record<string, any>;
  interface StatementSync {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    get(...params: unknown[]): Row | undefined;
    all(...params: unknown[]): Row[];
  }
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
