import {
  collectionsForScore,
  createCollection,
  addToCollection,
  deleteCollection,
  getCollection,
  listCollections,
  renameCollection,
  restoreCollection,
} from '../collections';
import { deleteForever, getScore, insertScore, listScores, restoreScores, trashScores } from '../scores';
import {
  addToSetlist,
  countSetlists,
  createSetlist,
  deleteSetlist,
  duplicateSetlist,
  getSetlist,
  listItems,
  listSetlists,
  localIsoDate,
  moveItem,
  removeItems,
  renameSetlist,
  restoreItems,
  restoreSetlist,
  scoresInAnySetlist,
  searchSetlists,
  setlistsContaining,
  updateItem,
  updateSetlist,
} from '../setlists';
import { notifyChanged } from '@/data/db/live';
import { sql } from '@/data/db/runner';
import { createTestDb } from '@/data/testing/testDb';

jest.mock('@/data/db/live', () => ({ notifyChanged: jest.fn() }));

const add = (title: string, pageCount = 4) =>
  insertScore({ title, filePath: `/lib/${title}.pdf`, fileHash: title, fileSize: 10, pageCount, coverPath: `/covers/${title}.webp` });
const titles = (setlistId: string) => listItems(setlistId).map(i => i.score.title);
const positions = (setlistId: string) => listItems(setlistId).map(i => i.position);

describe('setlists repository', () => {
  beforeEach(() => {
    createTestDb();
    jest.mocked(notifyChanged).mockClear();
  });

  it('orders upcoming dates ascending, then undated by last edit, then past dates descending', () => {
    const today = '2026-09-27';
    const past1 = createSetlist('Past old', '2026-01-10', 1);
    const undatedOld = createSetlist('Undated old', null, 2);
    const later = createSetlist('Later gig', '2026-12-01', 3);
    const todayGig = createSetlist('Tonight', today, 4);
    const past2 = createSetlist('Last week', '2026-09-20', 5);
    const undatedNew = createSetlist('Undated new', undefined, 6);
    const archived = createSetlist('Archived', '2026-10-01', 7);
    updateSetlist(archived, { archived: true }, 8);
    expect(listSetlists({ today }).map(s => s.id)).toEqual([todayGig, later, undatedNew, undatedOld, past2, past1]);
    expect(listSetlists({ archived: true, today }).map(s => s.id)).toEqual([archived]);
    // Editing an undated setlist moves it up among the undated ones.
    renameSetlist(undatedOld, 'Undated edited', 9);
    expect(listSetlists({ today }).map(s => s.id).slice(2, 4)).toEqual([undatedOld, undatedNew]);
    expect(countSetlists()).toBe(7);
    expect(localIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('creates, renames and updates; never blanks a name; invalid dates are no date', () => {
    expect(() => createSetlist('   ')).toThrow();
    const id = createSetlist('  Friday  ', 'next friday');
    expect(getSetlist(id)).toMatchObject({ name: 'Friday', eventDate: null, notes: null, archived: false, itemCount: 0, missingCount: 0, coverPaths: [] });
    renameSetlist(id, '  ');
    updateSetlist(id, { eventDate: '2026-10-02', notes: ' Bring the capo ' });
    expect(getSetlist(id)).toMatchObject({ name: 'Friday', eventDate: '2026-10-02', notes: 'Bring the capo' });
    updateSetlist(id, { eventDate: null, notes: '' });
    expect(getSetlist(id)).toMatchObject({ eventDate: null, notes: null });
    expect(getSetlist('nope')).toBeNull();
    expect(notifyChanged).toHaveBeenCalledWith('setlists');
  });

  it('adds scores (appending or at a position), allows repeats, skips trashed scores', () => {
    const [a, b, c, t] = [add('A'), add('B'), add('C'), add('Trashed')];
    trashScores([t]);
    const id = createSetlist('Gig');
    expect(addToSetlist(id, [a, b])).toHaveLength(2);
    expect(addToSetlist(id, [c, t], 1)).toHaveLength(1);
    addToSetlist(id, [a]); // reprise
    addToSetlist(id, [b], 99);
    expect(titles(id)).toEqual(['A', 'C', 'B', 'A', 'B']);
    expect(positions(id)).toEqual([0, 1, 2, 3, 4]);
    expect(addToSetlist('missing', [a])).toEqual([]);
    expect(notifyChanged).toHaveBeenCalledWith('setlists', 'setlist_items', 'scores');
  });

  it('summaries count missing entries and collect up to 4 distinct live covers', () => {
    const ids = ['A', 'B', 'C', 'D', 'E', 'F'].map(n => add(n));
    const id = createSetlist('Gig');
    addToSetlist(id, [ids[0]!, ids[0]!, ids[1]!, ids[2]!, ids[3]!, ids[4]!, ids[5]!]);
    trashScores([ids[1]!]);
    const s = getSetlist(id)!;
    expect(s.itemCount).toBe(7);
    expect(s.missingCount).toBe(1);
    expect(s.coverPaths).toEqual(['/covers/A.webp', '/covers/C.webp', '/covers/D.webp', '/covers/E.webp']);
  });

  it('moves an item and renumbers positions', () => {
    const id = createSetlist('Gig');
    const [i0, , i2] = addToSetlist(id, [add('A'), add('B'), add('C'), add('D')]);
    moveItem(id, i2!, 0);
    expect(titles(id)).toEqual(['C', 'A', 'B', 'D']);
    moveItem(id, i0!, 10);
    expect(titles(id)).toEqual(['C', 'B', 'D', 'A']);
    moveItem(id, i0!, -3);
    expect(titles(id)).toEqual(['A', 'C', 'B', 'D']);
    expect(positions(id)).toEqual([0, 1, 2, 3]);
    moveItem(id, 'not-an-item', 0);
    expect(titles(id)).toEqual(['A', 'C', 'B', 'D']);
  });

  it('removes items and restores them to their exact positions', () => {
    const id = createSetlist('Gig');
    const items = addToSetlist(id, [add('A'), add('B'), add('C'), add('D'), add('E')]);
    const removed = removeItems([items[1]!, items[3]!]);
    expect(titles(id)).toEqual(['A', 'C', 'E']);
    expect(positions(id)).toEqual([0, 1, 2]);
    restoreItems(removed);
    expect(titles(id)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(positions(id)).toEqual([0, 1, 2, 3, 4]);
    expect(removeItems([])).toEqual([]);
  });

  it('updates start page (clamped) and notes', () => {
    const id = createSetlist('Gig');
    const [item] = addToSetlist(id, [add('A', 3)]);
    updateItem(item!, { startPage: 9, notes: ' Capo 2 ' });
    expect(listItems(id)[0]).toMatchObject({ startPage: 2, notes: 'Capo 2' });
    updateItem(item!, { startPage: -1, notes: '' });
    expect(listItems(id)[0]).toMatchObject({ startPage: 0, notes: null });
  });

  it('duplicates a setlist with its entries; the copy is undated and active', () => {
    const id = createSetlist('Sunday', '2026-10-04');
    updateSetlist(id, { notes: 'Service', archived: true });
    const [first] = addToSetlist(id, [add('A'), add('B')]);
    updateItem(first!, { startPage: 1, notes: 'Intro' });
    const copy = duplicateSetlist(id, 'Sunday (copy)')!;
    expect(getSetlist(copy)).toMatchObject({ name: 'Sunday (copy)', eventDate: null, notes: 'Service', archived: false, itemCount: 2 });
    expect(listItems(copy).map(i => [i.score.title, i.startPage, i.notes, i.position])).toEqual([
      ['A', 1, 'Intro', 0],
      ['B', 0, null, 1],
    ]);
    expect(listItems(copy)[0]!.id).not.toBe(first);
    expect(duplicateSetlist('missing', 'x')).toBeNull();
  });

  it('deletes a setlist and restores it from the snapshot', () => {
    const id = createSetlist('Gig', '2026-10-01');
    const a = add('A');
    addToSetlist(id, [a, add('B'), a]);
    const before = { setlist: getSetlist(id), items: listItems(id) };
    const snap = deleteSetlist(id)!;
    expect(getSetlist(id)).toBeNull();
    expect(sql().all('SELECT * FROM setlist_items')).toHaveLength(0);
    restoreSetlist(snap);
    expect(getSetlist(id)).toEqual(before.setlist);
    expect(listItems(id)).toEqual(before.items);
    expect(deleteSetlist('missing')).toBeNull();
  });

  it('restoring drops entries whose score was deleted for good meanwhile', () => {
    const id = createSetlist('Gig');
    const [a, b] = [add('A'), add('B')];
    addToSetlist(id, [a, b]);
    const snap = deleteSetlist(id)!;
    trashScores([b]);
    deleteForever([b]);
    restoreSetlist(snap);
    expect(titles(id)).toEqual(['A']);
    expect(positions(id)).toEqual([0]);
  });

  it('keeps trashed scores as missing entries; delete forever removes them (trigger)', () => {
    const id = createSetlist('Gig');
    const [a, b, c] = [add('A'), add('B'), add('C')];
    addToSetlist(id, [a, b, c]);
    trashScores([b]);
    expect(listItems(id).map(i => [i.score.title, i.score.deleted])).toEqual([
      ['A', false],
      ['B', true],
      ['C', false],
    ]);
    restoreScores([b]);
    expect(listItems(id)[1]!.score.deleted).toBe(false);
    trashScores([b]);
    deleteForever([b]);
    expect(titles(id)).toEqual(['A', 'C']);
    // Any other delete path (Trash purge, backup Replace) is covered by the trigger too.
    sql().run('DELETE FROM scores WHERE id = ?', [c]);
    expect(titles(id)).toEqual(['A']);
    expect(getScore(c)).toBeNull();
  });

  it('flags library scores that are in an active setlist', () => {
    const [a, b, c] = [add('A'), add('B'), add('C')];
    const gig = createSetlist('Gig');
    const old = createSetlist('Old');
    addToSetlist(gig, [a]);
    addToSetlist(old, [b]);
    updateSetlist(old, { archived: true });
    const flags = Object.fromEntries(listScores().map(s => [s.title, s.inSetlist]));
    expect(flags).toEqual({ A: true, B: false, C: false });
    expect(scoresInAnySetlist()).toEqual(new Set([a]));
    expect(setlistsContaining(b).map(s => s.id)).toEqual([old]);
    expect(setlistsContaining(c)).toEqual([]);
    expect(notifyChanged).toHaveBeenCalledWith('setlists', 'scores');
  });

  it('searches names case- and accent-insensitively, best match first', () => {
    const today = '2026-09-27';
    const cafe = createSetlist('Café Gig');
    const jazz = createSetlist('Jazz at the Café', '2026-10-01');
    const summer = createSetlist('Summer Festival');
    const arch = createSetlist('Cafe Archive');
    updateSetlist(arch, { archived: true });
    expect(searchSetlists('cafe', 8, today).map(s => s.id)).toEqual([cafe, jazz, arch]);
    expect(searchSetlists('CAFÉ gig', 8, today).map(s => s.id)).toEqual([cafe]);
    expect(searchSetlists('estiv', 8, today).map(s => s.id)).toEqual([summer]);
    expect(searchSetlists('   ')).toEqual([]);
    expect(searchSetlists('cafe', 1, today)).toHaveLength(1);
  });
});

describe('collections repository additions', () => {
  beforeEach(() => createTestDb());

  it('gets, renames, lists by score, deletes and restores collections', () => {
    const [a, b] = [add('A'), add('B')];
    const col = createCollection('Baroque');
    const other = createCollection('Advent');
    addToCollection(col, [a, b], 10);
    addToCollection(other, [a], 11);
    expect(getCollection(col)).toMatchObject({ name: 'Baroque', count: 2, coverPath: '/covers/A.webp' });
    expect(getCollection('nope')).toBeNull();
    renameCollection(col, '  Early music ');
    renameCollection(col, '   ');
    expect(getCollection(col)!.name).toBe('Early music');
    expect(collectionsForScore(a).map(c => c.name)).toEqual(['Advent', 'Early music']);
    const snap = deleteCollection(col)!;
    expect(getCollection(col)).toBeNull();
    expect(listScores()).toHaveLength(2); // scores stay
    trashScores([b]);
    deleteForever([b]);
    restoreCollection(snap);
    expect(getCollection(col)).toMatchObject({ name: 'Early music', count: 1 });
    expect(listCollections()).toHaveLength(2);
    expect(deleteCollection('nope')).toBeNull();
  });
});
