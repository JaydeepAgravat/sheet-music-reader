import { create } from 'zustand';
import {
  BACKUP_FORMAT,
  ENTRY_LIBRARY,
  ENTRY_MANIFEST,
  ENTRY_SETTINGS,
  buildManifest,
  parseManifest,
  type Manifest,
} from '@/data/backup/manifest';
import { exportSettings, importSettings } from '@/data/backup/settings';
import i18n, { resolveLanguage } from '@/i18n';
import {
  BackupDataError,
  applyRestore,
  buildSnapshot,
  listArchiveFiles,
  localFilesByHash,
  parseSnapshot,
  planRestore,
  snapshotCounts,
  type RestoreMode,
  type RestorePlan,
  type RestoreSummary,
  type Snapshot,
  type SnapshotCounts,
} from '@/data/backup/snapshot';
import { sql } from '@/data/db/runner';
import { uuidv7 } from '@/data/ids';
import { getPref, setPref } from '@/data/prefs';
import { countScores } from '@/data/repos/scores';
import NativeBackup, { type BackupExtractItem, type BackupProgress } from '@/specs/NativeBackup';
import NativeSafImport from '@/specs/NativeSafImport';

/**
 * Backup & restore orchestration (no UI). Native does the heavy lifting on a background thread
 * (android/.../backup); this file picks documents, builds/validates the JSON entries, decides which
 * files to extract and applies the data in one SQLite transaction. Format: docs/BACKUP_FORMAT.md.
 *
 * One operation at a time (useBackup.running). Every failure surfaces as a BackupError whose code
 * maps to a `backup.errors.*` string (backupErrorKey).
 */

export type BackupOp = 'backup' | 'restore' | 'verify';

export type BackupErrorCode =
  | 'busy'
  | 'cancelled'
  | 'noPicker'
  | 'noSpace'
  | 'writeFailed'
  | 'readFailed'
  | 'notBackup'
  | 'newerVersion'
  | 'corrupt'
  | 'restoreFailed';

export class BackupError extends Error {
  constructor(readonly code: BackupErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'BackupError';
  }
}

/** i18n key of the message for an error code ('cancelled' has none: it isn't shown). */
export const backupErrorKey = (code: Exclude<BackupErrorCode, 'cancelled'>) =>
  `backup.errors.${code}` as const;

type BackupState = {
  running: boolean;
  op: BackupOp | null;
  progress: BackupProgress | null;
  /** Last failure (not set for user cancellations) until clearError(). */
  error: BackupErrorCode | null;
  clearError: () => void;
};

export const useBackup = create<BackupState>(set => ({
  running: false,
  op: null,
  progress: null,
  error: null,
  clearError: () => set({ error: null }),
}));

/** Stops the running archive operation; its promise rejects with code 'cancelled'. */
export function cancelBackupOp(): void {
  if (useBackup.getState().running) NativeBackup.cancel();
}

type ProgressFn = (p: BackupProgress) => void;

function toBackupError(e: unknown, fallback: BackupErrorCode): BackupError {
  if (e instanceof BackupError) return e;
  if (e instanceof BackupDataError) {
    const map = {
      notBackup: 'notBackup',
      newerFormat: 'newerVersion',
      newerSchema: 'newerVersion',
      corrupt: 'corrupt',
    } as const;
    return new BackupError(map[e.code], e.message);
  }
  if (e instanceof SyntaxError) return new BackupError('corrupt', e.message);
  const code = (e as { code?: unknown })?.code;
  const msg = (e as Error)?.message;
  const native: Record<string, BackupErrorCode> = {
    E_BUSY: 'busy',
    E_CANCELLED: 'cancelled',
    E_NO_ACTIVITY: 'noPicker',
    E_NO_PICKER: 'noPicker',
    E_NO_SPACE: 'noSpace',
    E_WRITE: 'writeFailed',
    E_READ: 'readFailed',
    E_PICK: 'readFailed',
  };
  return new BackupError((typeof code === 'string' && native[code]) || fallback, msg);
}

/** Runs one operation: busy guard, progress wiring, error mapping, store updates. */
async function run<T>(
  op: BackupOp,
  fallback: BackupErrorCode,
  onProgress: ProgressFn | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  if (useBackup.getState().running) throw new BackupError('busy');
  useBackup.setState({ running: true, op, progress: null, error: null });
  const sub = NativeBackup.onBackupProgress(p => {
    useBackup.setState({ progress: p });
    onProgress?.(p);
  });
  try {
    return await fn();
  } catch (e) {
    const err = toBackupError(e, fallback);
    if (err.code !== 'cancelled') useBackup.setState({ error: err.code });
    throw err;
  } finally {
    sub.remove();
    useBackup.setState({ running: false, op: null, progress: null });
  }
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "ScoreReader-backup-YYYY-MM-DD.zip" (local date). */
export function suggestedBackupName(now = new Date()): string {
  return `ScoreReader-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate(),
  )}.zip`;
}

// --- Backup ------------------------------------------------------------------------------------------

export type BackupResult = {
  uri: string;
  bytes: number;
  counts: SnapshotCounts;
  /** Archive entries left out because their local file is missing / no longer matches its hash. */
  missing: string[];
  damaged: string[];
};

/**
 * Picks a destination ("Create document"), then writes the whole library there. Resolves null when
 * the picker is cancelled. Records lastBackupAt / lastBackupScores on success.
 */
export async function createBackup(onProgress?: ProgressFn): Promise<BackupResult | null> {
  if (useBackup.getState().running) throw new BackupError('busy');
  let uri: string | null;
  try {
    uri = await NativeBackup.pickDestination(suggestedBackupName());
  } catch (e) {
    throw toBackupError(e, 'writeFailed');
  }
  if (!uri) return null;
  const dest = uri;
  return run('backup', 'writeFailed', onProgress, async () => {
    // Synchronous reads back to back: the snapshot and the file list describe the same moment.
    const snapshot = buildSnapshot();
    const { pdfs, covers } = listArchiveFiles();
    const manifest = buildManifest(snapshot, pdfs);
    const entries = [
      { name: ENTRY_MANIFEST, text: JSON.stringify(manifest) },
      { name: ENTRY_LIBRARY, text: JSON.stringify(snapshot) },
      { name: ENTRY_SETTINGS, text: JSON.stringify(exportSettings()) },
    ];
    const files = [...pdfs, ...covers].map(f => ({ path: f.path, name: f.name, sha256: f.sha256 }));
    const res = await NativeBackup.writeBackup(dest, entries, files);
    setPref('lastBackupAt', Date.now());
    setPref('lastBackupScores', countScores().total);
    return {
      uri: dest,
      bytes: res.bytes,
      counts: manifest.counts,
      missing: [...res.missing],
      damaged: [...res.damaged],
    };
  });
}

// --- Open / preview --------------------------------------------------------------------------------------

export type BackupPreview = {
  createdAt: number;
  schemaVersion: number;
  counts: SnapshotCounts;
  /** Archive size in bytes (-1 if the provider doesn't say). */
  archiveBytes: number;
  merge: RestorePlan;
  replace: RestorePlan;
};

/** An opened, validated backup, ready for restoreBackup. Holds the parsed library in memory. */
export type BackupHandle = {
  uri: string;
  manifest: Manifest;
  snapshot: Snapshot;
  settings: unknown;
  preview: BackupPreview;
};

/** Picks a backup file ("Open document") and validates it. Resolves null when the picker is cancelled. */
export async function openBackup(): Promise<BackupHandle | null> {
  if (useBackup.getState().running) throw new BackupError('busy');
  let uri: string | null;
  try {
    uri = await NativeBackup.pickBackupFile();
  } catch (e) {
    throw toBackupError(e, 'readFailed');
  }
  return uri ? inspectBackup(uri) : null;
}

/**
 * Reads manifest.json, library.json and settings.json (without extracting anything else) and
 * validates them: not ours → 'notBackup'; newer format or schema → 'newerVersion'; malformed → 'corrupt'.
 */
export async function inspectBackup(uri: string): Promise<BackupHandle> {
  try {
    const texts = await NativeBackup.readTextEntries(uri, [
      ENTRY_MANIFEST,
      ENTRY_LIBRARY,
      ENTRY_SETTINGS,
    ]);
    const text = (name: string) => texts.find(t => t.name === name)?.text;
    const manifestText = text(ENTRY_MANIFEST);
    if (manifestText === undefined) throw new BackupError('notBackup');
    const manifest = parseManifest(JSON.parse(manifestText));
    const libraryText = text(ENTRY_LIBRARY);
    if (libraryText === undefined) throw new BackupError('corrupt', 'library.json missing');
    const snapshot = parseSnapshot(JSON.parse(libraryText));
    const settingsText = text(ENTRY_SETTINGS);
    let settings: unknown = null;
    try {
      settings = settingsText === undefined ? null : JSON.parse(settingsText);
    } catch {
      settings = null; // settings are optional: a broken file just isn't applied
    }
    const archiveBytes = await NativeBackup.fileSize(uri);
    return {
      uri,
      manifest,
      snapshot,
      settings,
      preview: {
        createdAt: manifest.createdAt,
        schemaVersion: snapshot.schemaVersion,
        counts: snapshotCounts(snapshot),
        archiveBytes,
        merge: planRestore(snapshot, 'merge'),
        replace: planRestore(snapshot, 'replace'),
      },
    };
  } catch (e) {
    const err = toBackupError(e, 'readFailed');
    if (err.code !== 'cancelled') useBackup.setState({ error: err.code });
    throw err;
  }
}

// --- Restore --------------------------------------------------------------------------------------------

export type RestoreResult = RestoreSummary & {
  /** SHA-256 of PDFs that failed to extract (their scores are in skippedScores). */
  failedFiles: string[];
  /** Replace only: preferences restored from settings.json. */
  settingsApplied: number;
};

/** Headroom kept free on top of the PDFs to extract (DB growth, covers, the OS). */
const SPACE_MARGIN = 64 * 1024 * 1024;

const stripFileUri = (p: string) => p.replace(/^file:\/\//, '');

/**
 * Restores an opened backup. Only PDFs whose hash isn't already in the library are extracted
 * (verified against their SHA-256 on the way); the rest reuse the local file. Scores whose PDF
 * fails verification are skipped and reported. Replace also deletes local files nothing uses any
 * more and restores settings; merge keeps local settings.
 */
export async function restoreBackup(
  handle: BackupHandle,
  mode: RestoreMode,
  onProgress?: ProgressFn,
): Promise<RestoreResult> {
  return run('restore', 'readFailed', onProgress, async () => {
    const plan = planRestore(handle.snapshot, mode);
    if (plan.files.bytes + SPACE_MARGIN > NativeSafImport.freeBytes())
      throw new BackupError('noSpace');

    const libraryDir = NativeSafImport.libraryDir();
    const coversDir = NativeSafImport.coversDir();
    const items: (BackupExtractItem & { hash: string; kind: 'pdf' | 'cover' })[] = [];
    for (const f of plan.files.needed) {
      items.push({
        name: f.pdf,
        destPath: `${libraryDir}/${uuidv7()}.pdf`,
        sha256: f.sha256,
        hash: f.sha256,
        kind: 'pdf',
      });
      if (f.cover) {
        const coverPath = `${coversDir}/${f.sha256.slice(0, 16)}-${Date.now().toString(36)}.webp`;
        items.push({
          name: f.cover,
          destPath: coverPath,
          sha256: '',
          hash: f.sha256,
          kind: 'cover',
        });
      }
    }
    const cleanup = () => items.forEach(i => NativeSafImport.deleteFile(i.destPath));

    let results: readonly { destPath: string; ok: boolean }[] = [];
    if (items.length) {
      try {
        results = await NativeBackup.extractFiles(
          handle.uri,
          items.map(({ name, destPath, sha256 }) => ({ name, destPath, sha256 })),
        );
      } catch (e) {
        cleanup();
        throw e;
      }
    }

    const local = localFilesByHash();
    const filePaths = new Map(local.pdfs);
    const coverPaths = new Map(local.covers);
    const failedFiles: string[] = [];
    items.forEach((item, i) => {
      const ok = results[i]?.ok === true;
      if (item.kind === 'pdf') {
        if (ok) filePaths.set(item.hash, item.destPath);
        else failedFiles.push(item.hash);
      } else if (ok) {
        coverPaths.set(item.hash, `file://${item.destPath}`);
      }
    });
    // A cover without its PDF is useless.
    items.forEach((item, i) => {
      if (item.kind === 'cover' && results[i]?.ok && !filePaths.has(item.hash))
        NativeSafImport.deleteFile(item.destPath);
    });

    let summary: RestoreSummary;
    try {
      summary = applyRestore(handle.snapshot, mode, filePaths, coverPaths);
    } catch (e) {
      cleanup();
      throw new BackupError('restoreFailed', (e as Error)?.message);
    }
    summary.orphanFiles.forEach(f => NativeSafImport.deleteFile(stripFileUri(f)));
    const settingsApplied = mode === 'replace' ? importSettings(handle.settings) : 0;
    // Prefs are reactive (theme, pedals…); the language is set once at startup, so apply it now.
    if (settingsApplied) i18n.changeLanguage(resolveLanguage(getPref('language'))).catch(() => {});
    return { ...summary, failedFiles, settingsApplied };
  });
}

// --- Integrity check ------------------------------------------------------------------------------------

export type VerifyResult = {
  /** Distinct files hashed. */
  checked: number;
  /** Score ids whose PDF is missing / unreadable. */
  missing: string[];
  /** Score ids whose PDF no longer matches its file_hash. */
  mismatched: string[];
};

/**
 * Re-hashes every library PDF (SHA-256, native, background thread) and compares with file_hash.
 * Reads the whole library once: ~seconds per GB on a current tablet.
 */
export async function verifyLibrary(onProgress?: ProgressFn): Promise<VerifyResult> {
  return run('verify', 'readFailed', onProgress, async () => {
    const rows = sql().all<{ id: string; file_path: string; file_hash: string }>(
      'SELECT id, file_path, file_hash FROM scores ORDER BY id',
    );
    const paths = [...new Set(rows.map(r => r.file_path))];
    const hashes = await NativeBackup.hashFiles(paths);
    const byPath = new Map(paths.map((p, i) => [p, hashes[i]]));
    const missing: string[] = [];
    const mismatched: string[] = [];
    for (const r of rows) {
      const h = byPath.get(r.file_path);
      if (!h?.ok) missing.push(r.id);
      else if (h.sha256 !== r.file_hash) mismatched.push(r.id);
    }
    return { checked: paths.length, missing, mismatched };
  });
}

export { BACKUP_FORMAT };
