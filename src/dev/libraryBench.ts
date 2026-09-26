import { sql } from '@/data/db/runner';
import { notifyChanged } from '@/data/db/live';
import { uuidv7 } from '@/data/ids';
import { listScores } from '@/data/repos/scores';
import { searchLibrary } from '@/data/repos/search';
import { summarize, type Summary } from './stats';
import { reportToHost } from './reportToHost';

const WORDS = ['Nocturne', 'Prelude', 'Etude', 'Sonata', 'Waltz', 'Ballade', 'Fantasia', 'Minuet', 'Gavotte', 'Air', 'Hymn', 'Blues', 'Rhapsody', 'Serenade', 'Impromptu', 'Invention', 'Toccata', 'Fugue', 'Aria', 'Lullaby'];
const COMPOSERS = ['Chopin', 'Bach', 'Mozart', 'Beethoven', 'Debussy', 'Satie', 'Dvořák', 'Fauré', 'Schubert', 'Liszt', 'Ellington', 'Gershwin', 'Brahms', 'Grieg', 'Händel', null];

/** Dev only: inserts synthetic scores that all point at an existing PDF (for scroll/search benchmarks). */
export function seedSyntheticScores(count: number): number {
  const template = listScores()[0];
  if (!template) return 0;
  const db = sql();
  const now = Date.now();
  db.tx(() => {
    for (let i = 0; i < count; i++) {
      const id = uuidv7(now - i);
      const title = `${WORDS[i % WORDS.length]} No. ${(i % 97) + 1} in ${'CDEFGAB'[i % 7]}${i % 3 ? ' minor' : ' major'}`;
      const composer = COMPOSERS[i % COMPOSERS.length] ?? null;
      db.run(
        `INSERT INTO scores (id, title, composer, file_path, file_hash, file_size, page_count, cover_path, created_at, updated_at, genre)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [id, title, composer, template.filePath, `bench-${id}`, 1000, template.pageCount, template.coverPath, now - i, now - i, i % 4 ? 'Classical' : 'Jazz'],
      );
      db.run('INSERT INTO scores_fts (score_id, title, composer, genre) VALUES (?,?,?,?)', [id, title, composer, i % 4 ? 'Classical' : 'Jazz']);
    }
  });
  notifyChanged('scores');
  return count;
}

export function removeSyntheticScores(): void {
  const db = sql();
  db.tx(() => {
    db.run("DELETE FROM scores_fts WHERE score_id IN (SELECT id FROM scores WHERE file_hash LIKE 'bench-%')");
    db.run("DELETE FROM scores WHERE file_hash LIKE 'bench-%'");
  });
  notifyChanged('scores');
}

/** Times what the library does per keystroke: FTS search + the filtered, sorted list. */
export function benchmarkSearch(): { search: Summary; list: Summary; total: number; fullListMs: number } {
  const queries = ['n', 'no', 'noc', 'noct', 'chopin', 'dvorak', 'faure', 'son maj', 'b', 'ba', 'bach', 'ellington', 'prelude no 4', 'xyz', 'hand', 'etude', 'minor', 'jazz', 'waltz c', 'gershwin r'];
  const search: number[] = [];
  const list: number[] = [];
  for (let round = 0; round < 5; round++) {
    for (const q of queries) {
      const t0 = performance.now();
      const r = searchLibrary(q);
      const t1 = performance.now();
      listScores('title', { ids: r.scoreIds });
      const t2 = performance.now();
      search.push(t1 - t0);
      list.push(t2 - t1);
    }
  }
  const t0 = performance.now();
  const total = listScores('title').length;
  const fullList = performance.now() - t0;
  const report = { total, search: summarize(search), list: summarize(list), fullListMs: +fullList.toFixed(1) };
  reportToHost('library-bench', report);
  return report;
}
