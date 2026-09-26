/**
 * Forward-only schema migrations, tracked with PRAGMA user_version.
 * Engine-agnostic: runs against op-sqlite in the app and node:sqlite in tests.
 *
 * Rules: never edit a shipped migration — add a new one. Each migration runs in a transaction.
 * Later phases add their own tables (page_map, links, bookmarks, layers, strokes) as new migrations.
 */
export type SqlExecutor = {
  /** Execute one or more statements with no result. */
  exec: (sql: string) => void;
  /** Return rows for a single query. */
  all: <T = Record<string, unknown>>(sql: string) => T[];
};

type Migration = { version: number; name: string; sql: string };

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'core library, collections, setlists, pedals, search',
    sql: `
      CREATE TABLE scores (
        id TEXT PRIMARY KEY NOT NULL,                -- uuid v7 (time-ordered)
        title TEXT NOT NULL,
        composer TEXT, arranger TEXT, genre TEXT,
        music_key TEXT, tempo_bpm INTEGER, time_sig TEXT, notes TEXT,
        file_path TEXT NOT NULL,                     -- app-private copy
        file_hash TEXT NOT NULL, file_size INTEGER NOT NULL, page_count INTEGER NOT NULL DEFAULT 0,
        original_name TEXT, original_uri TEXT,
        cover_path TEXT,                             -- top-staff crop of page 1 (WebP)
        is_sample INTEGER NOT NULL DEFAULT 0,        -- bundled samples don't count toward the free limit
        is_favorite INTEGER NOT NULL DEFAULT 0,
        -- per-score reader memory (docs/PLAN.md §1.4)
        reader_mode TEXT,                            -- NULL = auto by orientation | SINGLE | TWO_UP | HALF
        half_split REAL NOT NULL DEFAULT 0.5,
        page_filter TEXT,                            -- NULL = global default | ORIGINAL | PAPER | SEPIA | NIGHT | CONTRAST
        last_page INTEGER NOT NULL DEFAULT 0,
        last_opened_at INTEGER, last_played_at INTEGER, play_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        deleted_at INTEGER                           -- soft delete → Trash (purged after 30 days)
      );
      CREATE INDEX idx_scores_live_title ON scores(deleted_at, title COLLATE NOCASE);
      CREATE INDEX idx_scores_live_composer ON scores(deleted_at, composer COLLATE NOCASE);
      CREATE INDEX idx_scores_live_recent ON scores(deleted_at, last_opened_at DESC);
      CREATE INDEX idx_scores_live_added ON scores(deleted_at, created_at DESC);
      CREATE INDEX idx_scores_hash ON scores(file_hash);

      -- Search index maintained by the repository layer (not triggers) so tags can be denormalised in.
      -- unicode61 + remove_diacritics 2: "dvorak" matches "Dvořák". Prefix indexes keep type-ahead fast.
      CREATE VIRTUAL TABLE scores_fts USING fts5(
        score_id UNINDEXED, title, composer, arranger, genre, tags, notes,
        tokenize = 'unicode61 remove_diacritics 2',
        prefix = '1 2 3'
      );

      CREATE TABLE tags (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE
      );
      CREATE TABLE score_tags (
        score_id TEXT NOT NULL REFERENCES scores(id) ON DELETE CASCADE,
        tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (score_id, tag_id)
      );
      CREATE INDEX idx_score_tags_tag ON score_tags(tag_id);

      CREATE TABLE collections (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        sort INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE TABLE collection_scores (
        collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
        score_id TEXT NOT NULL REFERENCES scores(id) ON DELETE CASCADE,
        added_at INTEGER NOT NULL,
        PRIMARY KEY (collection_id, score_id)
      );
      CREATE INDEX idx_collection_scores_score ON collection_scores(score_id);

      CREATE TABLE setlists (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        event_date TEXT, notes TEXT,
        archived INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE TABLE setlist_items (
        id TEXT PRIMARY KEY NOT NULL,
        setlist_id TEXT NOT NULL REFERENCES setlists(id) ON DELETE CASCADE,
        -- No cascade: a trashed score shows as "missing · Restore" in the setlist.
        score_id TEXT NOT NULL REFERENCES scores(id),
        position INTEGER NOT NULL,
        start_page INTEGER NOT NULL DEFAULT 0,
        notes TEXT
      );
      CREATE INDEX idx_setlist_items_order ON setlist_items(setlist_id, position);

      CREATE TABLE pedal_mappings (
        keycode INTEGER PRIMARY KEY NOT NULL,
        action TEXT NOT NULL,        -- NEXT | PREV | NEXT_SONG | PREV_SONG | TOGGLE_HALF | TOGGLE_PERFORMANCE
        device_name TEXT
      );
    `,
  },
];

export const LATEST_VERSION = migrations[migrations.length - 1]?.version ?? 0;

/** Applies pending migrations in order. Returns the versions applied. */
export function migrate(db: SqlExecutor): number[] {
  db.exec('PRAGMA foreign_keys = ON;');
  const current = db.all<{ user_version: number }>('PRAGMA user_version;')[0]?.user_version ?? 0;
  if (current > LATEST_VERSION) {
    throw new Error(`Database schema v${current} is newer than this app (v${LATEST_VERSION}). Update the app.`);
  }
  const applied: number[] = [];
  for (const m of migrations) {
    if (m.version <= current) continue;
    db.exec('BEGIN IMMEDIATE;');
    try {
      db.exec(m.sql);
      db.exec(`PRAGMA user_version = ${m.version};`);
      db.exec('COMMIT;');
      applied.push(m.version);
    } catch (e) {
      db.exec('ROLLBACK;');
      throw new Error(`Migration ${m.version} (${m.name}) failed: ${(e as Error).message}`);
    }
  }
  return applied;
}
