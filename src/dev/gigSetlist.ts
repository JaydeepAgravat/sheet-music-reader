import { addToSetlist, createSetlist, updateItem, listItems } from '@/data/repos/setlists';
import { listScores } from '@/data/repos/scores';

/**
 * Dev: a 15-song "gig" from distinct library PDFs — cycling through the library if it has
 * fewer — with a start page set on every 4th song, for the Phase 6 pedal gig simulation.
 */
export function createGigSetlist(): { id: string; songs: number } | null {
  // One entry per distinct PDF (synthetic benchmark scores all share a few files).
  const seen = new Set<string>();
  const real = listScores('title').filter(s => s.pageCount > 0 && !seen.has(s.filePath) && !!seen.add(s.filePath));
  if (!real.length) return null;
  const ids = Array.from({ length: 15 }, (_, i) => real[i % real.length]!.id);
  const id = createSetlist(`Gig simulation ${new Date().toLocaleTimeString()}`);
  addToSetlist(id, ids);
  listItems(id).forEach((item, i) => {
    if (i % 4 === 3 && item.score.pageCount > 2) updateItem(item.id, { startPage: 1 });
  });
  return { id, songs: ids.length };
}
