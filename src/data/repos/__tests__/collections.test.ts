import {
  addToCollection,
  allCollectionCovers,
  collectionCovers,
  createCollection,
  deleteCollection,
  getCollection,
  listCollections,
  removeFromCollection,
  renameCollection,
  restoreCollection,
} from '../collections';
import { insertScore, listScores, trashScores } from '../scores';
import { createTestDb } from '@/data/testing/testDb';

const add = (title: string, cover: string | null = `/covers/${title}.webp`) =>
  insertScore({ title, composer: null, filePath: `/lib/${title}.pdf`, fileHash: title, fileSize: 10, pageCount: 3, coverPath: cover });

describe('collections repository', () => {
  beforeEach(() => createTestDb());

  it('lists covers oldest-first, skipping trashed scores and missing covers', () => {
    const [a, b, c, d, e] = [add('A'), add('B'), add('C', null), add('D'), add('E')];
    const col = createCollection('Gig');
    const other = createCollection('Empty');
    addToCollection(col, [b], 1);
    addToCollection(col, [a, c], 2);
    addToCollection(col, [d, e], 3);
    expect(collectionCovers(col)).toEqual(['/covers/B.webp', '/covers/A.webp', '/covers/D.webp']);
    trashScores([a]);
    expect(collectionCovers(col, 2)).toEqual(['/covers/B.webp', '/covers/D.webp']);
    const all = allCollectionCovers();
    expect(all.get(col)).toEqual(['/covers/B.webp', '/covers/D.webp', '/covers/E.webp']);
    expect(all.has(other)).toBe(false);
  });

  it('creates, renames, removes members and restores a deleted collection without touching scores', () => {
    const a = add('A');
    const b = add('B');
    const col = createCollection('  Choir  ');
    addToCollection(col, [a, b]);
    expect(getCollection(col)).toMatchObject({ name: 'Choir', count: 2 });
    renameCollection(col, 'Choir 2026');
    removeFromCollection(col, [b]);
    expect(listScores('title', { collectionId: col }).map(s => s.id)).toEqual([a]);
    const snap = deleteCollection(col)!;
    expect(listCollections()).toHaveLength(0);
    expect(listScores()).toHaveLength(2);
    restoreCollection(snap);
    expect(getCollection(col)).toMatchObject({ name: 'Choir 2026', count: 1 });
  });
});
