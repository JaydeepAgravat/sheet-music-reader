import { createTestDb } from '@/data/testing/testDb';
import { getPref, prefsStore, setPref } from '@/data/prefs';
import { countScores, getScoreDetail, insertScore, listScores, trashScores, deleteForever } from '@/data/repos/scores';
import NativeSafImport from '@/specs/NativeSafImport';
import NativeScoreRenderer from '@/specs/NativeScoreRenderer';
import { SAMPLES, sampleFor } from '../samples';
import { seedSamplesOnce } from '../seedSamples';

jest.mock('@/specs/NativeScoreRenderer', () => ({
  __esModule: true,
  default: { renderCover: jest.fn() },
}));
jest.mock('@/ui/components/ScoreCard', () => ({ COVER_ASPECT: 1.3 }));

const saf = NativeSafImport as jest.Mocked<typeof NativeSafImport>;
const renderer = NativeScoreRenderer as jest.Mocked<typeof NativeScoreRenderer>;

/** The copied bytes hash to the manifest's sha256 (the asset is the file the manifest describes). */
const hashOf = (assetPath: string) => SAMPLES.find(s => `samples/${s.file}` === assetPath)!.sha256;

describe('seedSamplesOnce', () => {
  beforeEach(() => {
    createTestDb();
    prefsStore.remove('samplesSeeded');
    jest.clearAllMocks();
    saf.copyAsset.mockImplementation(async (assetPath: string, destPath: string) => ({ path: destPath, size: 1000, sha256: hashOf(assetPath) }));
    renderer.renderCover.mockImplementation(async () => ({ width: 480, height: 360, pageCount: 3 }));
  });

  it('adds every bundled sample as is_sample, with metadata, and none count toward the free limit', async () => {
    expect(SAMPLES).toHaveLength(4);
    await expect(seedSamplesOnce()).resolves.toBe(4);

    const scores = listScores('added');
    expect(scores).toHaveLength(4);
    expect(scores.every(s => s.isSample)).toBe(true);
    expect(countScores()).toEqual({ total: 4, counted: 0 });
    expect(getPref('samplesSeeded')).toBe(true);

    const hymn = SAMPLES.find(s => s.genre === 'Choral')!;
    const row = scores.find(s => s.title === hymn.title)!;
    const detail = getScoreDetail(row.id)!;
    expect(detail).toMatchObject({ composer: hymn.composer, genre: hymn.genre, musicKey: hymn.key, originalName: hymn.file, pageCount: 3 });
    expect(detail.tags.sort()).toEqual([...hymn.tags].sort());
    expect(detail.coverPath).toMatch(/^file:\/\/\/data\/files\/covers\/.+\.webp$/);
    expect(sampleFor(detail.originalName)?.licence).toBe(hymn.licence);

    expect(saf.copyAsset).toHaveBeenCalledTimes(4);
    for (const [asset, dest] of saf.copyAsset.mock.calls) {
      expect(asset).toMatch(/^samples\/[\w-]+\.pdf$/);
      expect(dest).toMatch(/^\/data\/files\/library\/.+\.pdf$/);
    }
  });

  it('is idempotent: a second run (or a concurrent one) adds nothing', async () => {
    // Concurrent calls share one run (both report its result); the samples are copied once.
    await expect(Promise.all([seedSamplesOnce(), seedSamplesOnce()])).resolves.toEqual([4, 4]);
    expect(saf.copyAsset).toHaveBeenCalledTimes(4);
    await expect(seedSamplesOnce()).resolves.toBe(0);
    expect(listScores()).toHaveLength(4);
    expect(saf.copyAsset).toHaveBeenCalledTimes(4);
  });

  it('skips entirely once seeded, so deleted samples never come back', async () => {
    await seedSamplesOnce();
    const ids = listScores().map(s => s.id);
    trashScores(ids);
    deleteForever(ids);
    expect(listScores()).toHaveLength(0);

    await expect(seedSamplesOnce()).resolves.toBe(0);
    expect(listScores()).toHaveLength(0);
    expect(saf.copyAsset).toHaveBeenCalledTimes(4);
  });

  it('seeds into a library that already has the user’s own scores', async () => {
    insertScore({ title: 'Autumn Leaves', filePath: '/lib/a.pdf', fileHash: 'user-hash', fileSize: 10, pageCount: 2 });
    await expect(seedSamplesOnce()).resolves.toBe(4);
    expect(countScores()).toEqual({ total: 5, counted: 1 });
  });

  it('keeps the flag unset after a failed copy and finishes on the next launch without duplicates', async () => {
    const failing = SAMPLES[1]!.file;
    saf.copyAsset.mockImplementation(async (assetPath: string, destPath: string) => {
      if (assetPath.endsWith(failing)) throw Object.assign(new Error('disk full'), { code: 'E_NO_SPACE' });
      return { path: destPath, size: 1000, sha256: hashOf(assetPath) };
    });
    await expect(seedSamplesOnce()).resolves.toBe(3);
    expect(getPref('samplesSeeded')).toBe(false);
    expect(saf.deleteFile).toHaveBeenCalledWith(expect.stringMatching(/^\/data\/files\/library\/.+\.pdf$/));

    // A sample trashed in between isn't re-added either (its hash is still in the library).
    trashScores([listScores()[0]!.id]);
    saf.copyAsset.mockClear();
    saf.copyAsset.mockImplementation(async (assetPath: string, destPath: string) => ({ path: destPath, size: 1000, sha256: hashOf(assetPath) }));
    await expect(seedSamplesOnce()).resolves.toBe(1);
    expect(saf.copyAsset).toHaveBeenCalledTimes(1);
    expect(saf.copyAsset.mock.calls[0]![0]).toBe(`samples/${failing}`);
    expect(getPref('samplesSeeded')).toBe(true);
    expect(listScores()).toHaveLength(3);
  });

  it('does nothing when already seeded on this install', async () => {
    setPref('samplesSeeded', true);
    await expect(seedSamplesOnce()).resolves.toBe(0);
    expect(saf.copyAsset).not.toHaveBeenCalled();
  });
});
