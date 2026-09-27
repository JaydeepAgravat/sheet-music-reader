import NativeSafImport from '@/specs/NativeSafImport';
import NativeScoreRenderer from '@/specs/NativeScoreRenderer';
import { sql } from '@/data/db/runner';
import { uuidv7 } from '@/data/ids';
import { getPref, setPref } from '@/data/prefs';
import { insertScore, updateMetadata } from '@/data/repos/scores';
import { logWarn } from '@/platform/log';
import { COVER_ASPECT } from '@/ui/components/ScoreCard';
import { SAMPLES } from './samples';

/**
 * The bundled sample scores (android/app/src/main/assets/samples, engraved by
 * scripts/gen-samples.mjs; sources and licences in design/samples/SOURCES.md).
 *
 * They're copied into the library once, on first launch, flagged is_sample (they never count
 * toward the free limit) and then treated like any other score: the user can edit, annotate or
 * delete them, and a deleted sample never comes back.
 */

/** Same cover size as imports (importQueue). */
const COVER_WIDTH = 480;

let running: Promise<number> | null = null;

/**
 * Adds the samples to the library unless that already happened on this install. Returns how many
 * were added. Safe to call on every launch: it's a no-op once `samplesSeeded` is set, and
 * concurrent calls share one run. A sample whose file is already in the library (live or in the
 * Trash, e.g. an earlier partial run) is skipped rather than duplicated. If a copy fails (e.g. no
 * space), the flag stays unset so the next launch finishes the job.
 */
export function seedSamplesOnce(): Promise<number> {
  if (getPref('samplesSeeded')) return Promise.resolve(0);
  running ??= seed().finally(() => {
    running = null;
  });
  return running;
}

async function seed(): Promise<number> {
  const libraryDir = NativeSafImport.libraryDir();
  const coversDir = NativeSafImport.coversDir();
  const known = new Set(sql().all<{ file_hash: string }>('SELECT file_hash FROM scores').map(r => r.file_hash));
  const start = Date.now();
  let added = 0;
  let failed = 0;

  for (const [i, sample] of SAMPLES.entries()) {
    if (known.has(sample.sha256)) continue;
    const path = `${libraryDir}/${uuidv7()}.pdf`;
    try {
      const copy = await NativeSafImport.copyAsset(`samples/${sample.file}`, path);
      if (known.has(copy.sha256)) {
        NativeSafImport.deleteFile(path);
        continue;
      }
      const coverPath = `${coversDir}/${copy.sha256.slice(0, 16)}-sample.webp`;
      const cover = await NativeScoreRenderer.renderCover(path, coverPath, COVER_WIDTH, COVER_ASPECT);
      // Consecutive timestamps keep the manifest order under "Recently added".
      const id = insertScore(
        {
          title: sample.title,
          composer: sample.composer,
          filePath: path,
          fileHash: copy.sha256,
          fileSize: copy.size,
          pageCount: cover.pageCount,
          originalName: sample.file,
          coverPath: `file://${coverPath}`,
          isSample: true,
        },
        start + i,
      );
      updateMetadata(id, { genre: sample.genre, musicKey: sample.key, tags: sample.tags }, start + i);
      known.add(copy.sha256);
      added++;
    } catch (e) {
      failed++;
      NativeSafImport.deleteFile(path);
      logWarn('samples: could not add', sample.file, e);
    }
  }
  if (!failed) setPref('samplesSeeded', true);
  return added;
}
