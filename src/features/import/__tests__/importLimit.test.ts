import type * as Queue from '../importQueue';

jest.mock('@/data/repos/scores', () => ({
  FREE_SCORE_LIMIT: 15,
  countScores: jest.fn(() => ({ total: 0, counted: 0 })),
  existingHashes: jest.fn(() => new Set<string>()),
  insertScore: jest.fn(() => `score-${Math.random()}`),
}));
jest.mock('@/data/repos/setlists', () => ({ countSetlists: jest.fn(() => 0) }));
jest.mock('@/data/repos/collections', () => ({ addToCollection: jest.fn(), findOrCreateCollection: jest.fn(() => 'col') }));
jest.mock('@/specs/NativeScoreRenderer', () => ({
  __esModule: true,
  default: { renderCover: jest.fn(async () => ({ width: 480, height: 600, pageCount: 3 })) },
}));
jest.mock('@/ui/components/ScoreCard', () => ({ COVER_ASPECT: 1.3 }));
jest.mock('@/app/navigationRef', () => ({
  navigationRef: { isReady: jest.fn(() => true), getCurrentRoute: jest.fn(() => ({ name: 'Main' })), navigate: jest.fn() },
}));
jest.mock('@/ui/feedback/store', () => ({ showToast: jest.fn() }));
jest.mock('@/i18n', () => ({ __esModule: true, default: { t: (k: string) => k } }));

const file = (name: string) => ({ uri: `content://x/${name}`, name, size: 10, relativeDir: '', virtual: false });

function setup({ counted, pro = false }: { counted: number; pro?: boolean }) {
  jest.resetModules();
  require('@/data/prefs').setPref('proUnlocked', pro);
  const scores = require('@/data/repos/scores');
  scores.countScores.mockReturnValue({ total: counted + 4, counted });
  const saf = require('@/specs/NativeSafImport').default;
  // Each file's bytes hash to its name unless it's called "dup*" (same hash as an existing score).
  saf.copyToLibrary.mockImplementation(async (uri: string, path: string) => ({
    path,
    size: 10,
    sha256: uri.includes('dup') ? 'existing' : uri,
  }));
  scores.existingHashes.mockReturnValue(new Set(['existing']));
  const queue = require('../importQueue') as typeof Queue;
  const nav = require('@/app/navigationRef').navigationRef;
  return { queue, saf, nav, scores };
}

async function runToSummary(queue: typeof Queue) {
  for (let i = 0; i < 200 && (queue.useImport.getState().running || !queue.useImport.getState().summary); i++) {
    await new Promise<void>(r => setImmediate(r));
  }
  return queue.useImport.getState().summary!;
}

describe('import free limit', () => {
  it('imports up to 15 counted scores; the rest are not copied and open the paywall once', async () => {
    const { queue, saf, nav } = setup({ counted: 13 });
    queue.enqueueImport({ files: ['a', 'b', 'c', 'd', 'e'].map(n => file(`${n}.pdf`)) });
    const summary = await runToSummary(queue);
    expect(summary.imported).toHaveLength(2);
    expect(summary.overLimit).toHaveLength(3);
    expect(saf.copyToLibrary).toHaveBeenCalledTimes(2);
    expect(nav.navigate).toHaveBeenCalledTimes(1);
    expect(nav.navigate).toHaveBeenCalledWith('Paywall', { reason: 'imports' });
  });

  it('a duplicate does not use up a free slot', async () => {
    const { queue } = setup({ counted: 14 });
    queue.enqueueImport({ files: [file('dup.pdf'), file('new.pdf'), file('late.pdf')] });
    const summary = await runToSummary(queue);
    expect(summary.duplicates.map(d => d.name)).toEqual(['dup.pdf']);
    expect(summary.imported).toHaveLength(1);
    expect(summary.overLimit).toEqual(['late.pdf']);
  });

  it('at the limit, nothing is copied (shares included)', async () => {
    const { queue, saf } = setup({ counted: 15 });
    queue.enqueueImport({ files: [file('shared.pdf')] });
    const summary = await runToSummary(queue);
    expect(summary.overLimit).toEqual(['shared.pdf']);
    expect(saf.copyToLibrary).not.toHaveBeenCalled();
  });

  it('Pro imports everything and never opens the paywall', async () => {
    const { queue, nav } = setup({ counted: 300, pro: true });
    queue.enqueueImport({ files: ['a', 'b', 'c'].map(n => file(`${n}.pdf`)) });
    const summary = await runToSummary(queue);
    expect(summary.imported).toHaveLength(3);
    expect(summary.overLimit).toHaveLength(0);
    expect(nav.navigate).not.toHaveBeenCalled();
  });

  it('"Import anyway" for a duplicate is gated at the limit', async () => {
    const { queue, nav } = setup({ counted: 15 });
    const id = await queue.importDuplicateAnyway({ name: 'x.pdf', path: '/p', hash: 'h', size: 1, uri: 'u', relativeDir: '' });
    expect(id).toBeNull();
    expect(nav.navigate).toHaveBeenCalledWith('Paywall', { reason: 'imports' });
  });
});
