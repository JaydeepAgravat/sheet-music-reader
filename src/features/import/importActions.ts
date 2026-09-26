import NativeSafImport, { type PickedFolder, type SourceFile } from '@/specs/NativeSafImport';
import { enqueueImport } from './importQueue';

/** Library "Import" → system file picker (multi-select). */
export async function pickAndImportFiles(): Promise<void> {
  const files = await NativeSafImport.pickFiles();
  enqueueImport({ files });
}

export type FolderListing = { folder: PickedFolder; files: SourceFile[]; subfolders: number };

/** Library "Import a folder" → tree picker + recursive listing (the caller confirms, then imports). */
export async function pickFolderListing(): Promise<FolderListing | null> {
  const folder = await NativeSafImport.pickFolder();
  if (!folder) return null;
  const files = [...(await NativeSafImport.listFolder(folder.uri))];
  const subfolders = new Set(files.map(f => f.relativeDir).filter(Boolean)).size;
  return { folder, files, subfolders };
}

/** Files shared to the app or opened with it: import straight away (the grant is short-lived). */
export function importPendingShares(): number {
  const files = NativeSafImport.takePendingShares();
  enqueueImport({ files });
  return files.length;
}
