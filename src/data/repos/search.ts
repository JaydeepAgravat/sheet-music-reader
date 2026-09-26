import { sql } from '@/data/db/runner';
import { buildFtsQuery, normalizeForSearch } from '@/domain/search/query';
import { listCollections, type Collection } from './collections';
import { listFacets, type Facet } from './scores';

export type SearchResults = {
  /** Best match first (title weighs most, then composer, arranger, tags…). */
  scoreIds: string[];
  composers: Facet[];
  tags: Facet[];
  collections: Collection[];
};

const EMPTY: SearchResults = { scoreIds: [], composers: [], tags: [], collections: [] };

/** Accent-insensitive prefix match of every query word against a label ("dvo sym" ↔ "Dvořák Symphony"). */
function labelMatches(label: string, words: string[]): boolean {
  const hay = normalizeForSearch(label).split(/\s+/);
  return words.every(w => hay.some(h => h.startsWith(w)));
}

export function searchLibrary(input: string, limit = 300): SearchResults {
  const fts = buildFtsQuery(input);
  if (!fts) return EMPTY;
  const words = normalizeForSearch(input).split(/\s+/).filter(Boolean);
  const scoreIds = sql()
    .all<{ score_id: string }>(
      `SELECT f.score_id FROM scores_fts f JOIN scores s ON s.id = f.score_id
       WHERE scores_fts MATCH ? AND s.deleted_at IS NULL
       ORDER BY bm25(scores_fts, 0, 10, 6, 3, 2, 3, 1) LIMIT ?`,
      [fts, limit],
    )
    .map(r => r.score_id);
  const facets = listFacets();
  return {
    scoreIds,
    composers: facets.composers.filter(f => labelMatches(f.label, words)).slice(0, 8),
    tags: facets.tags.filter(f => labelMatches(f.label, words)).slice(0, 8),
    collections: listCollections().filter(c => labelMatches(c.name, words)).slice(0, 8),
  };
}
