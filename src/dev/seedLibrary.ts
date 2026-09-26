import NativeScoreRenderer from '@/specs/NativeScoreRenderer';
import { insertScore, listScores } from '@/data/repos/scores';

/**
 * Dev only: adds the PDFs pushed by scripts/push-test-pdfs.sh to the library (files are referenced
 * in place, not copied). Real imports arrive with the SAF importer in Phase 4.
 */
export async function seedLibraryFromTestPdfs(): Promise<{ added: number; failed: number }> {
  const files = await NativeScoreRenderer.listTestPdfs();
  const existing = new Set(listScores().map(s => s.filePath));
  let added = 0;
  let failed = 0;
  for (const f of files) {
    if (existing.has(f.path)) continue;
    const filesDir = f.path.replace(/\/test-pdfs\/[^/]+$/, '');
    const cover = `${filesDir}/covers/dev-${f.name.replace(/\W+/g, '_')}.webp`;
    try {
      const r = await NativeScoreRenderer.renderCover(f.path, cover, 480, 0.8);
      insertScore({
        title: f.name.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' '),
        filePath: f.path,
        fileHash: `dev:${f.name}:${f.bytes}`,
        fileSize: f.bytes,
        pageCount: r.pageCount,
        originalName: f.name,
        coverPath: `file://${cover}`,
      });
      added++;
    } catch {
      failed++;
    }
  }
  return { added, failed };
}
