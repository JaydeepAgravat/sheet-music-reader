# Backup format (v1)

One `.zip` file, written via SAF "Create document" (suggested name `ScoreReader-backup-YYYY-MM-DD.zip`).
Code: `src/data/backup/*` (data), `src/features/backup/backupService.ts` (orchestration),
`android/.../backup/*` (archive I/O), `src/specs/NativeBackup.ts` (bridge).

## Layout

Entries are written in this order. The JSON entries come first so a restore preview reads only the
first few KB of the archive.

| Entry | Compression | Content |
|---|---|---|
| `manifest.json` | DEFLATED | Format header, counts, list of PDF entries |
| `library.json` | DEFLATED | Every row of every library table |
| `settings.json` | DEFLATED | Allow-listed preferences |
| `pdfs/<sha256>.pdf` | STORED | One per distinct `scores.file_hash` |
| `covers/<sha256>.webp` | STORED | Optional; keyed by the **PDF's** hash |

PDFs and covers are stored uncompressed because they are already compressed. Each file is read twice
while writing: the first pass computes CRC-32 (the zip format needs it before the data of a STORED
entry), SHA-256 and the size. The second pass copies the file. DEFLATE level 0 would read each file once,
but it still sends every byte through the deflater and it needs data descriptors. The first pass also
checks the PDF against `file_hash`: a PDF that no longer matches is left out and reported as `damaged`
instead of being saved under the wrong name.

### manifest.json

```json
{
  "format": 1,
  "app": "score-reader",
  "schemaVersion": 4,
  "createdAt": 1790486361618,
  "counts": { "scores": 1000, "setlists": 12, "collections": 30, "strokes": 52000, "pdfBytes": 3100000000 },
  "files": [{ "name": "pdfs/<sha256>.pdf", "sha256": "<sha256>", "size": 1234567 }]
}
```

- `format`: the archive format version. An app refuses a higher version (`newerVersion`). Increase it
  only for changes that older apps can't read.
- `schemaVersion`: the database `PRAGMA user_version` when the backup was made (`LATEST_VERSION` in
  `migrations.ts`). An app with a lower schema version refuses the backup (`newerVersion`). A lower
  schema version in the backup is fine: columns the backup doesn't have get their defaults.
- `createdAt` is in ms since the epoch. `counts.scores` includes trashed scores. `pdfBytes` is the sum
  of the distinct PDFs.
- `files` lists the PDFs the backup was meant to contain. If a local file was missing or damaged at
  backup time, the list can include an entry the zip doesn't have. The restore checks every file
  anyway. Covers aren't listed. The zip CRC-32 protects them.

### library.json

```json
{
  "schemaVersion": 4,
  "tables": {
    "scores": { "columns": ["id", "title", "..."], "rows": [["0199…", "Autumn Leaves", "..."]] },
    "ink_strokes": { "columns": ["id", "...", "points", "..."], "rows": [["…", "...", { "$b64": "AACAPw…" }, "..."]] }
  }
}
```

- It contains every real table, found through `sqlite_master` and `PRAGMA table_info`. Today these are
  `scores`, `tags`, `score_tags`, `collections`, `collection_scores`, `setlists`, `setlist_items`,
  `pedal_mappings` and `ink_strokes`. Tables and columns added by later migrations are included
  automatically. `scores_fts` and its shadow tables are left out: the search index is derived data,
  and the restore rebuilds it. Triggers are part of the schema, not the data.
- Rows are ordered by primary key. A cell is a string, a number, `null`, or `{"$b64": "…"}` for a
  BLOB (standard base64).
- Trashed scores are included, with their `deleted_at` value.
- `scores.file_path` is rewritten to `pdfs/<file_hash>.pdf`. A non-null `scores.cover_path` is
  rewritten to `covers/<file_hash>.webp`. The archive doesn't depend on any device, and the restore
  maps these back to new local paths.

### settings.json

```json
{ "prefs": { "themeMode": "dark", "pedalDebounceMs": 150, "inkPresets": ["..."] } }
```

These are the preferences in `BACKED_UP_PREFS` (`src/data/prefs.ts`): theme, haptics, language, page
turn, tap zones, default filter, pedal debounce, volume keys, library view and sort, ink presets,
active ink tool, and finger drawing. Left out on purpose:

- one-time hints (`readerHintsShown`, `performanceHintShown`)
- device-specific state (`greetedPedals`; `inkToolbarPos`, which depends on screen size)
- search history (`recentSearches`)
- backup status (`lastBackupAt`, `lastBackupScores`, `backupBannerDismissed`)

A new pref isn't backed up until someone adds it to the list. Only **Replace** restores settings.
Values are validated when read, so a bad value falls back to its default.

## Restore

1. **Preview.** The app reads the three JSON entries and nothing else, then validates them
   (`notBackup` / `newerVersion` / `corrupt`). It plans both modes: counts of new and existing items,
   the PDFs to extract, and what Replace would remove.
2. **Extract.** Only PDFs whose hash no local score has are extracted, along with their covers. Every
   other PDF reuses the local file. Each extracted file goes into the library under a new uuid name:
   the app writes `<dest>.part`, hashes it on the way, and renames it only if the SHA-256 matches.
   Before starting, the app checks that there is enough free space (the PDF bytes plus 64 MB).
3. **Apply.** One SQLite transaction:
   - **Replace** deletes every library table and the search index, then inserts everything. Local
     files that no restored score uses are deleted afterwards.
   - **Merge**:
     - Scores are paired one-to-one by `file_hash`: the same id first, then in library order. A matched
       score keeps its local row. Its missing tags (matched by name), collection memberships, setlist
       entries and ink strokes (by id) are added.
     - An unmatched score is inserted. It keeps its id if the id is free locally; otherwise it gets a
       new uuid and every reference to it is remapped.
     - Collections match by name, ignoring case.
     - Setlists match by id. A setlist that already exists is skipped, including its items.
     - Pedal mappings are only restored into an empty table.
     - Local settings stay as they are.
   - A score whose PDF failed verification is skipped, along with its tags, memberships, setlist items
     and ink. It is reported in `skippedScores`.
   - The search index is rebuilt for every live score that was inserted or changed.
4. A missing cover leaves `cover_path` null, and the library shows its placeholder. Restore never
   calls the renderer.

Several scores can share one PDF (duplicates imported with "Import anyway"). The backup holds that PDF
once, and after a restore all those scores point at one file. `deleteForever` only returns files that
no remaining score references.

## Limits

- **Size and entry count.** The writer uses `java.util.zip.ZipOutputStream`, which comes from OpenJDK
  on Android 7+ (the app's minSdk is 29). It switches to ZIP64 records by itself once the archive
  passes 4 GiB or 65,535 entries. The reader uses `ZipInputStream`: one sequential pass over the local
  headers that never reads the central directory, so neither limit applies to reading. `ZipFile` isn't
  used because content URIs from cloud providers often can't seek. `BackupZipTest` covers both limits
  on the JVM. `zip64EntryCount` writes 70,000 entries. `zip64ArchiveSize` streams a 4.4 GiB archive
  through a pipe and extracts an entry that sits past the 4 GiB offset. It takes about 12 s, so it
  only runs with `BACKUP_BIG_ZIP_TEST=1 ./gradlew :app:testDebugUnitTest`. A single file larger than
  4 GiB also gets ZIP64 fields, but no real score is that large.
- **Streaming.** Because the reader streams, a restore reads the archive once from start to end, even
  when it needs only a few PDFs. It stops as soon as it has every file it wanted.
- **JSON entries.** Each JSON entry is capped at 256 MB when read. `library.json` crosses the JS/native
  bridge as a single string: tens of MB for a 1,000-score library with a lot of ink.
- **Covers.** Covers are optional. A backup with no cover entries restores fine.
