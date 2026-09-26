import { addToCollection, findOrCreateCollection, listCollections } from '../collections';
import {
  daysLeftInTrash,
  deleteForever,
  expiredTrashIds,
  getScoreDetail,
  insertScore,
  listFacets,
  listScores,
  listTrash,
  restoreScores,
  setFavorite,
  trashScores,
  updateMetadata,
} from '../scores';
import { sql } from '@/data/db/runner';
import { createTestDb } from '@/data/testing/testDb';

const DAY = 86_400_000;
const add = (title: string, composer: string | null = null) =>
  insertScore({ title, composer, filePath: `/lib/${title}.pdf`, fileHash: title, fileSize: 10, pageCount: 3, coverPath: `/covers/${title}.webp` });
const fts = (q: string) => sql().all<{ score_id: string }>('SELECT score_id FROM scores_fts WHERE scores_fts MATCH ?', [q]).map(r => r.score_id);

describe('library repository', () => {
  beforeEach(() => createTestDb());

  it('edits metadata, keeps tags unique and searchable', () => {
    const id = add('Autumn Leaves', 'Kosma');
    updateMetadata(id, { genre: 'Jazz', musicKey: 'G minor', tempoBpm: 120.4, tags: ['Standards', 'standards ', 'Gig'] });
    const d = getScoreDetail(id)!;
    expect(d).toMatchObject({ genre: 'Jazz', musicKey: 'G minor', tempoBpm: 120 });
    expect(d.tags).toEqual(['Gig', 'Standards']);
    expect(fts('standards*')).toEqual([id]);
    updateMetadata(id, { tags: ['Gig'] });
    expect(listFacets().tags.map(t => t.label)).toEqual(['Gig']);
  });

  it('never blanks a title', () => {
    const id = add('Clair de Lune');
    updateMetadata(id, { title: '   ' });
    expect(getScoreDetail(id)!.title).toBe('Clair de Lune');
  });

  it('filters by favourite, composer, tag and collection', () => {
    const a = add('Prelude', 'Bach');
    const b = add('Minuet', 'Bach');
    add('Nocturne', 'Chopin');
    setFavorite([a], true);
    updateMetadata(b, { tags: ['Grade 3'] });
    const col = findOrCreateCollection('Baroque');
    addToCollection(col, [a, b]);
    expect(listScores('title', { favorite: true }).map(s => s.id)).toEqual([a]);
    expect(listScores('title', { composer: 'bach' })).toHaveLength(2);
    expect(listScores('title', { tagId: listFacets().tags[0]!.value }).map(s => s.id)).toEqual([b]);
    expect(listScores('title', { collectionId: col })).toHaveLength(2);
    expect(findOrCreateCollection('baroque')).toBe(col);
    expect(listCollections()[0]).toMatchObject({ name: 'Baroque', count: 2 });
  });

  it('trash hides scores from library and search, restore brings them back', () => {
    const id = add('Gymnopédie', 'Satie');
    trashScores([id], 1000);
    expect(listScores()).toEqual([]);
    expect(fts('gymnopedie')).toEqual([]);
    expect(listTrash().map(s => s.id)).toEqual([id]);
    restoreScores([id]);
    expect(listScores().map(s => s.id)).toEqual([id]);
    expect(fts('gymnopedie')).toEqual([id]);
  });

  it('purges after 30 days and returns files to delete', () => {
    const id = add('Old');
    trashScores([id], 0);
    expect(daysLeftInTrash(0, 29.5 * DAY)).toBe(1);
    expect(expiredTrashIds(29 * DAY)).toEqual([]);
    expect(expiredTrashIds(30 * DAY)).toEqual([id]);
    expect(deleteForever([id])).toEqual(['/lib/Old.pdf', '/covers/Old.webp']);
    expect(listTrash()).toEqual([]);
  });

  it('deleteForever ignores live scores', () => {
    const id = add('Live');
    expect(deleteForever([id])).toEqual([]);
    expect(listScores()).toHaveLength(1);
  });
});
