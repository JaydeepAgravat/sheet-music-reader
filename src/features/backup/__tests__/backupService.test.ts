import { BackupError, createBackup, inspectBackup, restoreBackup, suggestedBackupName, useBackup, verifyLibrary } from '../backupService';
import { LATEST_VERSION } from '@/data/db/migrations';
import { sql } from '@/data/db/runner';
import { getPref } from '@/data/prefs';
import { insertScore } from '@/data/repos/scores';
import { createTestDb } from '@/data/testing/testDb';
import NativeBackup from '@/specs/NativeBackup';
import NativeSafImport from '@/specs/NativeSafImport';

const H = (n: number) => n.toString(16).padStart(64, '0');
const nb = jest.mocked(NativeBackup);
const saf = jest.mocked(NativeSafImport);

let clock = 1_700_000_000_000;
const addScore = (title: string, hash: string) =>
  insertScore(
    { title, filePath: `/data/files/library/${title}.pdf`, fileHash: hash, fileSize: 100, pageCount: 1, coverPath: `file:///data/files/covers/${title}.webp` },
    (clock += 1000),
  );

type Written = { entries: { name: string; text: string }[]; files: { path: string; name: string; sha256: string }[] };

/** Backs up the current test db through the mocked native module and returns what it was given. */
async function backUp(): Promise<Written> {
  nb.pickDestination.mockResolvedValueOnce('content://docs/backup.zip');
  let written: Written | null = null;
  nb.writeBackup.mockImplementationOnce(async (_uri, entries, files) => {
    written = { entries: [...entries], files: [...files] };
    return { bytes: 1234, missing: [], damaged: [] };
  });
  const res = await createBackup();
  expect(res?.bytes).toBe(1234);
  return written!;
}

describe('backupService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useBackup.setState({ running: false, op: null, progress: null, error: null });
  });

  it('names backups by local date', () => {
    expect(suggestedBackupName(new Date(2026, 8, 7))).toBe('ScoreReader-backup-2026-09-07.zip');
  });

  it('returns null when the destination picker is cancelled', async () => {
    createTestDb();
    nb.pickDestination.mockResolvedValueOnce(null);
    await expect(createBackup()).resolves.toBeNull();
    expect(nb.writeBackup).not.toHaveBeenCalled();
  });

  it('writes manifest, library and settings first, then one PDF per hash and covers', async () => {
    createTestDb();
    addScore('A', H(1));
    addScore('B', H(2));
    const w = await backUp();
    expect(w.entries.map(e => e.name)).toEqual(['manifest.json', 'library.json', 'settings.json']);
    const manifest = JSON.parse(w.entries[0]!.text);
    expect(manifest).toEqual(
      expect.objectContaining({ format: 1, app: 'score-reader', schemaVersion: LATEST_VERSION, counts: expect.objectContaining({ scores: 2, pdfBytes: 200 }) }),
    );
    expect(w.files.map(f => f.name)).toEqual([`pdfs/${H(1)}.pdf`, `pdfs/${H(2)}.pdf`, `covers/${H(1)}.webp`, `covers/${H(2)}.webp`]);
    expect(w.files[0]).toEqual({ path: '/data/files/library/A.pdf', name: `pdfs/${H(1)}.pdf`, sha256: H(1) });
    expect(w.files[2]?.sha256).toBe('');
    expect(w.files[2]?.path).toBe('/data/files/covers/A.webp');
    expect(getPref('lastBackupScores')).toBe(2);
    expect(getPref('lastBackupAt')).toEqual(expect.any(Number));
    expect(useBackup.getState().running).toBe(false);
  });

  it('restores into another library, extracting only missing PDFs', async () => {
    createTestDb();
    addScore('A', H(1));
    addScore('B', H(2));
    const w = await backUp();

    createTestDb();
    addScore('Mine', H(1));
    nb.readTextEntries.mockResolvedValueOnce(w.entries);
    nb.fileSize.mockResolvedValueOnce(5000);
    const handle = await inspectBackup('content://docs/backup.zip');
    expect(handle.preview.counts.scores).toBe(2);
    expect(handle.preview.archiveBytes).toBe(5000);
    expect(handle.preview.merge.scores).toEqual({ total: 2, new: 1, existing: 1 });
    expect(handle.preview.replace.removed.scores).toBe(1);

    const restored = await restoreBackup(handle, 'merge');
    const items = nb.extractFiles.mock.calls[0]![1];
    expect(items.map(i => i.name)).toEqual([`pdfs/${H(2)}.pdf`, `covers/${H(2)}.webp`]);
    expect(items[0]?.destPath).toMatch(/^\/data\/files\/library\/[0-9a-f-]{36}\.pdf$/);
    expect(items[0]?.sha256).toBe(H(2));
    expect(restored.inserted.scores).toBe(1);
    expect(restored.failedFiles).toEqual([]);
    const b = sql().all<{ file_path: string; cover_path: string }>("SELECT file_path, cover_path FROM scores WHERE title = 'B'")[0];
    expect(b?.file_path).toBe(items[0]?.destPath);
    expect(b?.cover_path).toBe(`file://${items[1]?.destPath}`);
  });

  it('skips scores whose PDF fails verification and deletes orphans on replace', async () => {
    createTestDb();
    addScore('A', H(1));
    addScore('B', H(2));
    const w = await backUp();

    createTestDb();
    addScore('Old', H(9));
    nb.readTextEntries.mockResolvedValueOnce(w.entries);
    const handle = await inspectBackup('content://x');
    nb.extractFiles.mockImplementationOnce(async (_u, items) =>
      items.map(i => ({ name: i.name, destPath: i.destPath, ok: i.name !== `pdfs/${H(2)}.pdf`, sha256: '' })),
    );
    const res = await restoreBackup(handle, 'replace');
    expect(res.failedFiles).toEqual([H(2)]);
    expect(res.skippedScores.map(s => s.title)).toEqual(['B']);
    expect(sql().all<{ title: string }>('SELECT title FROM scores').map(r => r.title)).toEqual(['A']);
    const deleted = saf.deleteFile.mock.calls.map(c => c[0]);
    expect(deleted).toEqual(expect.arrayContaining(['/data/files/library/Old.pdf', '/data/files/covers/Old.webp']));
    // B's cover was extracted but is useless without its PDF.
    const coverOfB = nb.extractFiles.mock.calls[0]![1].find(i => i.name === `covers/${H(2)}.webp`)!.destPath;
    expect(deleted).toContain(coverOfB);
  });

  it('refuses a backup from a newer app version', async () => {
    createTestDb();
    nb.readTextEntries.mockResolvedValueOnce([
      { name: 'manifest.json', text: JSON.stringify({ format: 1, app: 'score-reader', schemaVersion: LATEST_VERSION + 1, createdAt: 1, counts: {}, files: [] }) },
      { name: 'library.json', text: JSON.stringify({ schemaVersion: LATEST_VERSION + 1, tables: {} }) },
    ]);
    await expect(inspectBackup('content://x')).rejects.toMatchObject({ code: 'newerVersion' });
    expect(useBackup.getState().error).toBe('newerVersion');
  });

  it('rejects files that are not backups', async () => {
    createTestDb();
    nb.readTextEntries.mockResolvedValueOnce([]);
    await expect(inspectBackup('content://x')).rejects.toMatchObject({ code: 'notBackup' });
    nb.readTextEntries.mockResolvedValueOnce([{ name: 'manifest.json', text: '{nope' }]);
    await expect(inspectBackup('content://x')).rejects.toMatchObject({ code: 'corrupt' });
  });

  it('maps native failures and refuses to run twice', async () => {
    createTestDb();
    addScore('A', H(1));
    nb.pickDestination.mockResolvedValueOnce('content://d');
    nb.writeBackup.mockRejectedValueOnce(Object.assign(new Error('full'), { code: 'E_NO_SPACE' }));
    await expect(createBackup()).rejects.toBeInstanceOf(BackupError);
    expect(useBackup.getState().error).toBe('noSpace');

    nb.pickDestination.mockResolvedValueOnce('content://d');
    nb.writeBackup.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'E_CANCELLED' }));
    await expect(createBackup()).rejects.toMatchObject({ code: 'cancelled' });
    expect(useBackup.getState().error).toBeNull();

    useBackup.setState({ running: true });
    await expect(createBackup()).rejects.toMatchObject({ code: 'busy' });
  });

  it('refuses a restore that does not fit in free space', async () => {
    createTestDb();
    addScore('A', H(1));
    const w = await backUp();
    createTestDb();
    nb.readTextEntries.mockResolvedValueOnce(w.entries);
    const handle = await inspectBackup('content://x');
    saf.freeBytes.mockReturnValueOnce(1000);
    await expect(restoreBackup(handle, 'merge')).rejects.toMatchObject({ code: 'noSpace' });
    expect(nb.extractFiles).not.toHaveBeenCalled();
  });

  it('verifies the library against file hashes', async () => {
    createTestDb();
    const a = addScore('A', H(1));
    const b = addScore('B', H(2));
    const c = addScore('C', H(3));
    nb.hashFiles.mockImplementationOnce(async paths =>
      paths.map(p => ({ path: p, ok: !p.endsWith('C.pdf'), sha256: p.endsWith('A.pdf') ? H(1) : H(5) })),
    );
    const r = await verifyLibrary();
    expect(r.checked).toBe(3);
    expect(r.missing).toEqual([c]);
    expect(r.mismatched).toEqual([b]);
    expect(r.missing).not.toContain(a);
  });
});
