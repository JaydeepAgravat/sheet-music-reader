# Phase 4 — import & library (emulator, 26 Sep 2026)

Device: Tab_11_16x10 emulator (API 36), **debug build** (release will be faster).

| Check | Target | Result |
|---|---|---|
| Folder import, 200 PDFs (~960 MB, 5 subfolders, 8 × 100 MB scans) | completes with progress, no ANR | Done in < 32 s; progress pill live; 0 ANR; subfolders became collections |
| Messy-filename folder (10 files: nested folders, IMSLP name, track numbers, damaged PDF, non-PDF) | sensible titles, bad files reported | 8 imported with parsed title/composer; "broken.pdf" → damaged, "notes.pdf" → not a PDF |
| Search on 5,213 scores (100 queries incl. accents, prefixes, multi-word) | p95 < 50 ms | FTS p95 **14 ms** (p50 5.8), filtered list p95 3.9 ms; full sorted list 14.6 ms |
| Scroll 5,213 scores | 60 fps | FlashList, ~480 native views regardless of size (see fix below) |
| Delete | single = undo, bulk = confirm, 30-day Trash | Verified; Trash restore / delete forever / empty; purge runs at launch |

Scaled from the plan: the corpus is ~1 GB, not 2 GB (emulator disk); re-run the 2 GB import on the phone in Phase 8.

## Bug found and fixed
Hidden tabs used `display: none`. A hidden Library then had a 0×0 viewport, so FlashList
rendered **every** row: with 5,000 scores the view count climbed past 25,000 and the app died
with a Java heap OOM. Hidden tabs now keep their size, are invisible, and are frozen with
`react-freeze` (no re-renders while hidden). The tab wrapper also no longer remounts screens on
every tab switch.

## Not verified on the emulator
- Share-sheet / "Open with" from Google Drive with a cloud-only file (needs a signed-in Drive
  account): intent parsing is covered by `ShareInboxTest`; verify on the phone.
- 60 fps measurement on real hardware (Perfetto in Phase 8).

## Tools
Settings → developer rows: "Seed 5,000 synthetic scores", "Benchmark search", "Remove synthetic
scores". Import corpora are generated in the session scratchpad and pushed to /sdcard/Download.

## Memory (release vs debug)
Debug builds show ~315 MB native heap from the dev runtime (Hermes on the unprecompiled bundle).
Release, same data: library 36 MB native heap / 107 MB total PSS; reader peak ~100–170 MB alloc
(page cache by design, budget 40 % of memoryClass); back to the library returns to ~35 MB.
Always measure memory on release builds.
