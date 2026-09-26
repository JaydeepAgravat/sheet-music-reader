# Phase 2 renderer results — 26 Sep 2026

**Device:** `Tab_11_16x10` emulator (Android 15, 1600×2560 @ 320 dpi, arm64, host: Apple silicon). Cache budget auto-sized to 76 MB (40% of memoryClass).
**Build:** renderer commit after `bdefb35`. Page rendered at view size (1600 px wide, fit-to-width A4).

## Acceptance (docs/PLAN.md Phase 2)

| Criterion | Target | Result | |
|---|---|---|---|
| Turn latency for cached pages (p95) | < 50 ms | **20.1 ms** JS→pixel, release build (p50 16.0, p99 22.2, max 34.9) | ✅ |
| Open 300-page 100 MB scan → first page | < 1 s | **86 ms** (open 60 ms incl. all 300 page sizes) | ✅ |
| 500 rapid turns | no OOM | cache peak 69 MB ≤ 76 MB budget; native heap 172 → 200 MB; no crash (native + JS paths) | ✅ |
| Open/close ×100 incl. races with in-flight renders | no crash | 0 crashes, 0 leaked render threads, 0 bytes cached after closing | ✅ |

## Detail

### Pedal-paced turns (250 ms apart, ±2 prefetch)
| | Pages already cached at turn | Render time p50 / p95 / max |
|---|---|---|
| scan-300p (native) | 99.7 % (300 turns) | 36.8 / 39.8 / 40.9 ms |
| vector-50p (native) | 99.5 % (200 turns) | 14.0 / 15.7 / 18.3 ms |
| scan-300p through RN, release | **100 %** (500 turns, 0 timeouts) | — |

The misses are direction reversals at the ends of the document in the test loop, where the page two back was already evicted.

### JS → pixel (scan-300p, 500 paced turns)
| Build | p50 | p95 | p99 | max |
|---|---|---|---|---|
| **Release** | **16.0** | **20.1** | **22.2** | 34.9 |
| Debug | 33.0 | 37.0 | 49.5 | 53.5 |

Native part only (prop arrives → drawn): p50 1.1 ms, p95 1.7 ms. The rest is React commit + the next vsync, i.e. about one frame in release.

### Open times
scan-300p 60 ms · vector-50p 38 ms · poster 13 ms · mixed 4 ms · tiny <1 ms (all page sizes read up front, so JS can lay out before any bitmap exists).

### Worst-case vector page (A0, ~60k ops)
27 ms at 1600 px, 44 ms at 3200 px (2× zoom).

### Correctness
- `/Rotate 90` displays landscape, correctly oriented.
- CropBox respected (area outside the crop box is not shown).
- `corrupt.pdf` and `not-a-pdf.pdf` fail with a clean exception (`E_OPEN`), no native crash.
- Half-page composite: next page's top over current page's bottom, divider + page tags.
- Filters (Paper, Sepia, Night, High-contrast) are GPU colour matrices: zero re-render cost.

## Decisions
- **No PDFium fallback for v1 (for now).** PdfRenderer handled every valid file in the corpus, and on Android it is already PDFium-based. The remaining known gap is password-protected PDFs, which get a clear message in Phase 4 instead of +5 MB APK. Revisit after the Phase 8 real-world corpus (~200 musician PDFs from beta testers).
- **Pedal turns will be driven natively in Phase 3.** JS→pixel is already ~1 frame in release, but routing pedal key events straight to the active page view (then telling JS) keeps turns instant even if the JS thread is busy (e.g. search indexing during an import).

## Fixed during benchmarking
- Bitmap pool could hold an extra 48 MB on top of the cache → pool capped at budget/5.
- Renders finishing after `close()` were cached for a dead document (35 MB lingering) → dropped atomically with close.
- Night filter was muddy on scanned (off-white) paper → inversion with contrast stretch.
