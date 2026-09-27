import {
  BackupDataError,
  assertSchemaSupported,
  snapshotCounts,
  type ArchiveFile,
  type Snapshot,
  type SnapshotCounts,
} from './snapshot';

/** Archive format version. Bump only for changes old apps can't read (docs/BACKUP_FORMAT.md). */
export const BACKUP_FORMAT = 1;
export const BACKUP_APP = 'score-reader';

export const ENTRY_MANIFEST = 'manifest.json';
export const ENTRY_LIBRARY = 'library.json';
export const ENTRY_SETTINGS = 'settings.json';

export type ManifestFile = { name: string; sha256: string; size: number };

export type Manifest = {
  format: number;
  app: string;
  /** PRAGMA user_version of the database that was backed up. */
  schemaVersion: number;
  /** ms since epoch. */
  createdAt: number;
  counts: SnapshotCounts;
  /** The PDF entries (covers are optional extras, not listed). */
  files: ManifestFile[];
};

export function buildManifest(
  snapshot: Snapshot,
  pdfs: readonly ArchiveFile[],
  now = Date.now(),
): Manifest {
  return {
    format: BACKUP_FORMAT,
    app: BACKUP_APP,
    schemaVersion: snapshot.schemaVersion,
    createdAt: now,
    counts: snapshotCounts(snapshot),
    files: pdfs.map(f => ({ name: f.name, sha256: f.sha256, size: f.size })),
  };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Validates an untrusted manifest.json. Throws BackupDataError (notBackup, newerFormat, newerSchema, corrupt). */
export function parseManifest(json: unknown): Manifest {
  const m = json as Partial<Manifest> | null;
  if (typeof m !== 'object' || m === null || m.app !== BACKUP_APP || !isNum(m.format)) {
    throw new BackupDataError('notBackup', 'Not a Score Reader backup');
  }
  if (m.format > BACKUP_FORMAT)
    throw new BackupDataError(
      'newerFormat',
      `Backup format ${m.format} is newer than this app (${BACKUP_FORMAT})`,
    );
  if (!isNum(m.schemaVersion)) throw new BackupDataError('corrupt', 'manifest.json: schemaVersion');
  assertSchemaSupported(m.schemaVersion);
  const c = (m.counts ?? {}) as Partial<SnapshotCounts>;
  const files = Array.isArray(m.files) ? m.files : [];
  return {
    format: m.format,
    app: m.app,
    schemaVersion: m.schemaVersion,
    createdAt: isNum(m.createdAt) ? m.createdAt : 0,
    counts: {
      scores: isNum(c.scores) ? c.scores : 0,
      setlists: isNum(c.setlists) ? c.setlists : 0,
      collections: isNum(c.collections) ? c.collections : 0,
      strokes: isNum(c.strokes) ? c.strokes : 0,
      pdfBytes: isNum(c.pdfBytes) ? c.pdfBytes : 0,
    },
    files: files
      .filter(
        (f): f is ManifestFile =>
          typeof f?.name === 'string' && typeof f.sha256 === 'string' && isNum(f.size),
      )
      .map(f => ({ name: f.name, sha256: f.sha256, size: f.size })),
  };
}
