import type { CodegenTypes, TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/**
 * Backup archives (one .zip). android/.../backup/*: BackupModule adapts content URIs, threads and
 * events to the pure BackupZipWriter / BackupZipReader. Layout: docs/BACKUP_FORMAT.md.
 *
 * One archive operation (write / read / extract / hash) runs at a time on a background thread; a
 * second one rejects E_BUSY. cancel() stops the running one, which then rejects E_CANCELLED.
 *
 * Rejection codes: E_BUSY, E_CANCELLED, E_NO_ACTIVITY, E_NO_PICKER, E_PICK, E_WRITE, E_NO_SPACE,
 * E_READ.
 */

export type BackupTextEntry = { name: string; text: string };

export type BackupFile = {
  /** Absolute path of a file in app storage (a "file://" prefix is tolerated). */
  path: string;
  /** Entry name, e.g. "pdfs/<sha256>.pdf". */
  name: string;
  /** Expected lowercase hex SHA-256; "" = don't check. A mismatch is reported in `damaged`. */
  sha256: string;
};

export type BackupWriteResult = {
  /** Bytes written to the destination. */
  bytes: CodegenTypes.Double;
  /** Entry names whose source file didn't exist (not archived). */
  missing: ReadonlyArray<string>;
  /** Entry names whose source no longer matched its expected SHA-256 (not archived). */
  damaged: ReadonlyArray<string>;
};

export type BackupExtractItem = {
  /** Entry name inside the archive. Several items may name the same entry. */
  name: string;
  /** Absolute destination inside app storage (anything else fails). Written via "<dest>.part" + rename. */
  destPath: string;
  /** Expected lowercase hex SHA-256; "" = don't check (the zip CRC-32 still applies). */
  sha256: string;
};

export type BackupExtractResult = {
  name: string;
  destPath: string;
  /** The file exists at destPath and matches its expected hash. */
  ok: boolean;
  /** Actual SHA-256 ("" if the entry was missing or unreadable). */
  sha256: string;
};

export type BackupHashResult = {
  path: string;
  /** false = missing or unreadable. */
  ok: boolean;
  sha256: string;
};

export type BackupProgress = {
  /** write | read | verify */
  op: string;
  /** Files finished / total (write: archived files; read: extracted items; verify: hashed files). */
  done: CodegenTypes.Int32;
  total: CodegenTypes.Int32;
  /** write: file bytes copied; read: archive bytes consumed; verify: bytes hashed. */
  bytesDone: CodegenTypes.Double;
  /** -1 when unknown (a provider that doesn't report the archive size). */
  bytesTotal: CodegenTypes.Double;
  /** Entry or path being processed ("" at start/end). */
  current: string;
};

export interface Spec extends TurboModule {
  /** SAF "Create document" (application/zip). Resolves the new document's URI, or null if cancelled. */
  pickDestination(suggestedName: string): Promise<string | null>;
  /** SAF "Open document" for zips (also octet-stream: some providers mislabel .zip). Null if cancelled. */
  pickBackupFile(): Promise<string | null>;
  /**
   * Streams a zip to destUri: text entries first (DEFLATED), then files (STORED, two-pass for
   * CRC-32 + SHA-256). ZIP64 is used automatically past 4 GiB / 65,535 entries. On cancel or error
   * the partial document is deleted when the provider allows it. Emits op 'write' progress.
   */
  writeBackup(
    destUri: string,
    entries: ReadonlyArray<BackupTextEntry>,
    files: ReadonlyArray<BackupFile>,
  ): Promise<BackupWriteResult>;
  /** Reads just these (small) entries, stopping once all were seen. Missing ones are absent. */
  readTextEntries(
    uri: string,
    names: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<BackupTextEntry>>;
  /**
   * Extracts the listed entries in one sequential pass, verifying SHA-256 on the fly; mismatched or
   * missing ones leave no file and come back ok = false. Results are in `items` order. Emits op
   * 'read' progress. On E_CANCELLED, files already extracted stay: the caller deletes them.
   */
  extractFiles(
    uri: string,
    items: ReadonlyArray<BackupExtractItem>,
  ): Promise<ReadonlyArray<BackupExtractResult>>;
  /** SHA-256 of app-storage files (library integrity check). Emits op 'verify' progress. */
  hashFiles(paths: ReadonlyArray<string>): Promise<ReadonlyArray<BackupHashResult>>;
  /** Cancels the running archive operation (no-op when idle). */
  cancel(): void;
  /** Size of a content URI in bytes, -1 when the provider doesn't say. */
  fileSize(uri: string): Promise<CodegenTypes.Double>;

  /** Throttled to ~10 per second, plus one at the start and end of each operation. */
  readonly onBackupProgress: CodegenTypes.EventEmitter<BackupProgress>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('Backup');
