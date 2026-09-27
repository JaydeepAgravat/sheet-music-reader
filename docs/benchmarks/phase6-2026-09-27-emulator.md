# Phase 6 — setlists, collections & backup (emulator, 27 Sep 2026)

Device: Tab_11_16x10 emulator (API 36), debug build.

| Check | Target | Result |
|---|---|---|
| Gig simulation: 15-song setlist (10–300 pages, start pages on 3 songs) via simulated pedal (`KEYCODE_PAGE_DOWN`) | zero wrong turns | **1,217 / 1,217 positions in exact order, 0 wrong turns**; next song at its start page with no flash; `Next: …` pill on each last page; end card after the last song |
| PREV on page 1 of a song | previous song | Lands on the previous song's last page (PREV_SONG → its start page) |
| Backup → wipe app data → restore (Replace) round trip | hash-identical | **Identical** library digest (all tables + file hashes): 208 scores, 1.13 GB of PDFs, 9 collections, 2 setlists, ink |
| Library file check | finds damaged files | Reported 5 scores whose PDFs were removed; "Show" filters the library to them |

Scaled from the plan: ~1.2 GB instead of 3 GB / 1,000 scores (the emulator has 5.8 GB of storage). ZIP64 (>4 GB, >65,535 entries) is covered by JVM tests (`BACKUP_BIG_ZIP_TEST=1`). Re-run the 3 GB round trip on the tablet in Phase 8.

Backup and restore throughput were not timed precisely on the emulator; measure on hardware.

## Bugs found and fixed during verification
- Migration v4 (a trigger) failed on device: the op-sqlite statement splitter cut the trigger body at its inner `;`. The splitter now keeps `BEGIN … END` whole, and a test runs every migration statement by statement, as the app does.
- A setlist song with a start page first drew page 1 for one frame (and wasted the pre-render): the reader now starts on the start page in its first frame.
- Replace-restore's confirmation dialog opened behind the restore sheet (two modals on Android): confirmation is now inline in the sheet and is skipped when nothing would be removed.
- Presses closer than the 200 ms pedal debounce are dropped by design — scripts must space them.

## Not verified
- SAF with Google Drive / USB providers, `deleteDocument` on cancel for real providers.
- Performance-mode setlist flow with real pedals; TalkBack reorder actions.
