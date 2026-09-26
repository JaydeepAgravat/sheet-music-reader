import { getScore, insertScore, listScores, nextInLibrary, updateReaderState } from '../scores';
import { forgetKey, learnKey, listLearned } from '../pedals';
import { createTestDb } from '@/data/testing/testDb';

const add = (title: string, composer: string | null = null, t = 1000) =>
  insertScore({ title, composer, filePath: `/x/${title}.pdf`, fileHash: title, fileSize: 1, pageCount: 10 }, t);

describe('scores repository', () => {
  beforeEach(() => createTestDb());

  it('inserts and reads back with defaults (AUTO mode, global filter)', () => {
    const id = add('Clair de Lune', 'Debussy');
    const s = getScore(id)!;
    expect(s).toMatchObject({ title: 'Clair de Lune', composer: 'Debussy', readerMode: 'AUTO', pageFilter: null, halfSplit: 0.5, lastPage: 0 });
  });

  it('remembers reader state per score, clamping the split', () => {
    const id = add('Nocturne');
    updateReaderState(id, { readerMode: 'HALF', halfSplit: 0.95, pageFilter: 'SEPIA', lastPage: 6 });
    expect(getScore(id)).toMatchObject({ readerMode: 'HALF', halfSplit: 0.8, pageFilter: 'SEPIA', lastPage: 6 });
    updateReaderState(id, { readerMode: 'AUTO', pageFilter: null });
    expect(getScore(id)).toMatchObject({ readerMode: 'AUTO', pageFilter: null });
  });

  it('sorts by title case-insensitively and finds the next score in the library', () => {
    const b = add('bach Prelude');
    const a = add('Autumn Leaves');
    const c = add('Czerny Etude');
    expect(listScores('title').map(s => s.id)).toEqual([a, b, c]);
    expect(nextInLibrary(a)?.id).toBe(b);
    expect(nextInLibrary(c)).toBeNull();
  });

  it('puts scores without a composer last when sorting by composer', () => {
    add('Untitled');
    add('Minuet', 'Bach');
    expect(listScores('composer').map(s => s.title)).toEqual(['Minuet', 'Untitled']);
  });
});

describe('pedal mappings repository', () => {
  beforeEach(() => createTestDb());

  it('learns, re-assigns and forgets keys', () => {
    learnKey({ keyCode: 96, action: 'NEXT', keyName: 'BUTTON_A', deviceName: 'AirTurn' });
    learnKey({ keyCode: 96, action: 'TOGGLE_HALF', keyName: 'BUTTON_A', deviceName: 'AirTurn' });
    expect(listLearned()).toEqual([{ keyCode: 96, action: 'TOGGLE_HALF', keyName: 'BUTTON_A', deviceName: 'AirTurn' }]);
    forgetKey(96);
    expect(listLearned()).toEqual([]);
  });
});
