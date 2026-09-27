import type { CodegenTypes, TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/**
 * Getting PDFs in: system pickers (Storage Access Framework), folder trees, and files shared or
 * "opened with" the app. android/.../saf/SafImportModule.kt.
 *
 * Nothing is read in place: every import is stream-copied into app storage (content URIs expire,
 * cloud files move), hashed on the way for duplicate detection.
 */

export type SourceFile = {
  /** content:// (or file://) URI. */
  uri: string;
  /** Display name including extension, e.g. "Autumn Leaves - Kosma.pdf". */
  name: string;
  /** Bytes; -1 when the provider doesn't know (common for cloud files). */
  size: CodegenTypes.Double;
  /**
   * Folder path relative to the picked tree root ("" for the root itself, "Jazz/Standards" for a
   * nested file). Always "" for picked or shared files.
   */
  relativeDir: string;
  /** Provider-backed virtual file (e.g. Google Docs export) — copied via a typed stream. */
  virtual: boolean;
};

export type PickedFolder = { uri: string; name: string };

export type CopyResult = {
  path: string;
  size: CodegenTypes.Double;
  /** Lowercase hex SHA-256 of the copied bytes. */
  sha256: string;
};

export interface Spec extends TurboModule {
  /**
   * Multi-select document picker. Offers PDFs but accepts any file ("*" + "/" + "*" with a PDF
   * hint) because some cloud providers report PDFs as octet-stream; returns only files whose MIME
   * type is application/pdf OR whose name ends in .pdf. Resolves [] on cancel.
   */
  pickFiles(): Promise<ReadonlyArray<SourceFile>>;
  /** Folder picker (ACTION_OPEN_DOCUMENT_TREE). Resolves null on cancel. */
  pickFolder(): Promise<PickedFolder | null>;
  /** Recursive walk of a picked tree: every PDF (same rule as pickFiles), sorted by path then name. */
  listFolder(treeUri: string): Promise<ReadonlyArray<SourceFile>>;
  /**
   * Stream-copies uri → destPath (parent dirs created; written to a temp file then renamed, so a
   * failed copy never leaves a partial file) while computing SHA-256. Checks the %PDF- header;
   * rejects E_NOT_PDF if missing, E_NO_SPACE when storage runs out, E_COPY otherwise. Runs on a
   * background thread; several may run concurrently.
   */
  copyToLibrary(uri: string, destPath: string): Promise<CopyResult>;
  /**
   * Copies a file bundled in the APK assets (path relative to the assets root, e.g.
   * "samples/hymn.pdf") to destPath, with the same temp-file, %PDF- check, hashing and error codes
   * as copyToLibrary. Used to seed the bundled sample scores on first run.
   */
  copyAsset(assetPath: string, destPath: string): Promise<CopyResult>;
  /** Files handed to us by ACTION_SEND / SEND_MULTIPLE / VIEW since the last call (then cleared). */
  takePendingShares(): ReadonlyArray<SourceFile>;
  /** Absolute app-private directory for library PDFs (filesDir/library). */
  libraryDir(): string;
  /** Absolute app-private directory for covers (filesDir/covers). */
  coversDir(): string;
  /** Deletes a file inside app storage; false if missing or outside app storage. */
  deleteFile(path: string): boolean;
  /** Usable bytes on the app's storage volume. */
  freeBytes(): CodegenTypes.Double;

  /** A share/"open with" arrived while the app was running — call takePendingShares(). */
  readonly onShareReceived: CodegenTypes.EventEmitter<CodegenTypes.Int32>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('SafImport');
