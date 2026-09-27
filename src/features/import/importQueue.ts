import { create } from 'zustand';
import NativeSafImport, { type SourceFile } from '@/specs/NativeSafImport';
import NativeScoreRenderer from '@/specs/NativeScoreRenderer';
import { uuidv7 } from '@/data/ids';
import { addToCollection, findOrCreateCollection } from '@/data/repos/collections';
import { countScores, existingHashes, FREE_SCORE_LIMIT, insertScore } from '@/data/repos/scores';
import { LimitGate } from '@/domain/import/limitGate';
import { parseFileName } from '@/domain/import/parseTitle';
import { isLocked, openPaywall, usePro } from '@/features/billing/entitlement';
import { COVER_ASPECT } from '@/ui/components/ScoreCard';

/**
 * Background import: copy → hash (dedupe) → cover + page count → title/composer → collections.
 * Runs on native worker threads; JS only orchestrates, so the UI never blocks. One batch at a
 * time; new requests queue behind it.
 *
 * Free tier: only FREE_SCORE_LIMIT scores (samples don't count). Files past the limit are not
 * copied at all; the review card lists them and the paywall opens once for the batch. Scores
 * already in the library are never affected.
 */

export type FailReason = 'notPdf' | 'password' | 'unreadable' | 'noSpace' | 'copy';

export type DuplicateItem = { name: string; path: string; hash: string; size: number; uri: string; relativeDir: string };
export type FailedItem = { name: string; reason: FailReason };

export type ImportSummary = {
  id: number;
  imported: string[];
  duplicates: DuplicateItem[];
  failed: FailedItem[];
  /** Names of files not added because the free score limit was reached. */
  overLimit: string[];
  cancelled: boolean;
};

export type ImportRequest = {
  files: readonly SourceFile[];
  /** Create a collection per subfolder (folder import). */
  subfoldersToCollections?: boolean;
};

type Progress = { done: number; total: number; current: string };

type ImportState = {
  running: boolean;
  progress: Progress | null;
  /** Last finished batch, until the review card is dismissed. */
  summary: ImportSummary | null;
  cancelRequested: boolean;
  dismissSummary: () => void;
};

export const useImport = create<ImportState>((set, get) => ({
  running: false,
  progress: null,
  summary: null,
  cancelRequested: false,
  dismissSummary: () => {
    discardDuplicates(get().summary);
    set({ summary: null });
  },
}));

const COVER_WIDTH = 480;
const CONCURRENCY = 2;
let summarySeq = 0;
const queue: ImportRequest[] = [];

export function enqueueImport(req: ImportRequest): void {
  if (!req.files.length) return;
  queue.push(req);
  if (!useImport.getState().running) drain().catch(() => useImport.setState({ running: false, progress: null }));
}

export function cancelImport(): void {
  if (useImport.getState().running) useImport.setState({ cancelRequested: true });
  queue.length = 0;
}

async function drain(): Promise<void> {
  const req = queue.shift();
  if (!req) return;
  const summary = await runBatch(req);
  // A finished batch replaces the review card; leftover duplicate copies of the old one are dropped.
  discardDuplicates(useImport.getState().summary);
  useImport.setState({ running: false, progress: null, cancelRequested: false, summary });
  if (summary.overLimit.length > 0) openPaywall('imports');
  if (queue.length) await drain();
}

function reasonFor(e: unknown): FailReason {
  const code = (e as { code?: string })?.code ?? '';
  const msg = (e as Error)?.message ?? '';
  if (code === 'E_NOT_PDF') return 'notPdf';
  if (code === 'E_NO_SPACE') return 'noSpace';
  if (/PASSWORD/.test(msg)) return 'password';
  if (code === 'E_OPEN') return 'unreadable';
  return 'copy';
}

async function runBatch({ files, subfoldersToCollections }: ImportRequest): Promise<ImportSummary> {
  const libraryDir = NativeSafImport.libraryDir();
  const coversDir = NativeSafImport.coversDir();
  const hashes = existingHashes();
  const summary: ImportSummary = { id: ++summarySeq, imported: [], duplicates: [], failed: [], overLimit: [], cancelled: false };
  const gate = new LimitGate(freeSlots());
  const collections = new Map<string, string>();
  let done = 0;
  let next = 0;
  let outOfSpace = false;
  useImport.setState({ running: true, cancelRequested: false, progress: { done: 0, total: files.length, current: files[0]?.name ?? '' } });

  const one = async (f: SourceFile) => {
    const id = uuidv7();
    const path = `${libraryDir}/${id}.pdf`;
    let slot = false;
    try {
      slot = await gate.acquire();
      if (!slot) {
        summary.overLimit.push(f.name);
        return;
      }
      const copy = await NativeSafImport.copyToLibrary(f.uri, path);
      if (hashes.has(copy.sha256)) {
        summary.duplicates.push({ name: f.name, path, hash: copy.sha256, size: copy.size, uri: f.uri, relativeDir: f.relativeDir });
        return;
      }
      hashes.add(copy.sha256); // duplicates inside the same batch too
      const scoreId = await addCopiedFile({ name: f.name, path, hash: copy.sha256, size: copy.size, uri: f.uri, relativeDir: f.relativeDir }, coversDir);
      summary.imported.push(scoreId);
      gate.commit();
      slot = false;
      const folder = f.relativeDir.split('/').filter(Boolean).pop();
      if (subfoldersToCollections && folder) {
        let colId = collections.get(folder);
        if (!colId) collections.set(folder, (colId = findOrCreateCollection(folder)));
        addToCollection(colId, [scoreId]);
      }
    } catch (e) {
      const reason = reasonFor(e);
      if (reason === 'noSpace') outOfSpace = true;
      NativeSafImport.deleteFile(path);
      summary.failed.push({ name: f.name, reason });
    } finally {
      if (slot) gate.release(); // duplicate or failed: the slot goes back
      done++;
      useImport.setState({ progress: { done, total: files.length, current: f.name } });
    }
  };

  const worker = async () => {
    while (next < files.length) {
      if (useImport.getState().cancelRequested || outOfSpace) {
        summary.cancelled = useImport.getState().cancelRequested;
        return;
      }
      const f = files[next++];
      if (f) await one(f);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return summary;
}

/** How many more scores this batch may add: unlimited with Pro. */
function freeSlots(): number {
  if (usePro.getState().isPro) return Infinity;
  return Math.max(0, FREE_SCORE_LIMIT - countScores().counted);
}

/** Turns a copied PDF into a library score (cover, page count, parsed title). */
async function addCopiedFile(item: DuplicateItem, coversDir: string): Promise<string> {
  const coverPath = `${coversDir}/${item.hash.slice(0, 16)}-${Date.now().toString(36)}.webp`;
  const cover = await NativeScoreRenderer.renderCover(item.path, coverPath, COVER_WIDTH, COVER_ASPECT);
  const folder = item.relativeDir.split('/').filter(Boolean).pop();
  const { title, composer } = parseFileName(item.name, folder);
  return insertScore({
    title,
    composer,
    filePath: item.path,
    fileHash: item.hash,
    fileSize: item.size,
    pageCount: cover.pageCount,
    originalName: item.name,
    originalUri: item.uri,
    coverPath: `file://${coverPath}`,
  });
}

/** Review card → "Import anyway" for a skipped duplicate (its copy is still on disk). */
export async function importDuplicateAnyway(item: DuplicateItem): Promise<string | null> {
  if (isLocked('imports')) {
    openPaywall('imports');
    return null;
  }
  try {
    const id = await addCopiedFile(item, NativeSafImport.coversDir());
    const s = useImport.getState().summary;
    if (s) {
      useImport.setState({
        summary: { ...s, imported: [...s.imported, id], duplicates: s.duplicates.filter(d => d.path !== item.path) },
      });
    }
    return id;
  } catch {
    return null;
  }
}

/** Deletes the kept copies of skipped duplicates (review card dismissed or replaced). */
export function discardDuplicates(summary: ImportSummary | null): void {
  summary?.duplicates.forEach(d => NativeSafImport.deleteFile(d.path));
}
