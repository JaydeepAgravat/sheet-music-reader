/**
 * Duplicate detection for imports (docs/PLAN.md §1.4: "Imported 12 · 3 duplicates skipped").
 * Identity is the file's content hash, never its name: the same PDF under two names is one score,
 * and two different PDFs both called "Nocturne.pdf" are two.
 */

export type ImportCandidate = { hash: string; name: string };

/** Why a file is skipped: already in the library, or an earlier file in the same batch. */
export type DuplicateReason = 'library' | 'batch';

export type ImportPlan<F extends ImportCandidate> = {
  /** Files to import, in the order they were picked. */
  toImport: F[];
  /** Files to skip, in the order they were picked. */
  duplicates: Array<{ file: F; reason: DuplicateReason }>;
};

export function planImport<F extends ImportCandidate>(files: readonly F[], existingHashes: ReadonlySet<string>): ImportPlan<F> {
  const toImport: F[] = [];
  const duplicates: ImportPlan<F>['duplicates'] = [];
  const inBatch = new Set<string>();
  for (const file of files) {
    if (existingHashes.has(file.hash)) duplicates.push({ file, reason: 'library' });
    else if (inBatch.has(file.hash)) duplicates.push({ file, reason: 'batch' });
    else {
      inBatch.add(file.hash);
      toImport.push(file);
    }
  }
  return { toImport, duplicates };
}
