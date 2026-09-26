# App 2: Offline Sheet Music Reader for Android (forScore-style)

**Build-ready report for Claude Code.** Research date: 26 Sep 2026.

> **How to use this file with Claude Code**
> 1. Put it in the repo as `docs/PRODUCT_SPEC.md`; copy section 11 (build plan) into `CLAUDE.md`.
> 2. **Build the PDF spike (M1) first.** Page rendering performance decides whether the app is good. Don't build library screens before the reader feels instant.
> 3. Items marked **(verify)** weren't fully confirmed in research.
> 4. **Project rule: bare React Native (React Native Community CLI). Do not use Expo, Expo modules, expo-* packages, EAS or config plugins.** Native code goes in `android/` as Kotlin Turbo Modules / Fabric components.

---

## 0. TL;DR

| Item | Decision |
|---|---|
| Product | Fast, modern, fully offline PDF sheet music reader + library + setlists + pedal page turns + stylus annotation, for Android tablets (phones supported) |
| Users | Pianists, band/orchestra players, gigging musicians, worship musicians who read PDFs, music students and teachers |
| Positioning | **"forScore-style reader for Android. Instant page turns. No account. No subscription. Buy once."** |
| Price | Free up to **15 scores**, then **$12.99 one-time Pro** (covers all the user's Android devices via Play) |
| Backend | None. Local SQLite + app-private PDF storage + zip backup to a user-chosen folder |
| Stack | **Bare React Native (CLI, no Expo)** + New Architecture + **custom Kotlin page-render module** + react-native-skia ink + op-sqlite (FTS5) |
| v1 build time | ~8–10 weeks solo (the renderer and ink are the hard parts) |
| Main competitor | **MobileSheets** ($15.99, powerful but dated UI, steep learning curve) |
| Watch | **enScore** (new 2026 indie, $9.99 Pro), **Lectern** (tiny indie, praised for clean UI) |

**Why this wins:** forScore (iPad-only, $24.99, 1M copies sold) has no Android version, and neither do OnSong, Piascore or Newzik (web only). Android users praise MobileSheets' depth but complain about its dated UI, learning curve, sync fragility, random resets and lag with huge PDFs. Almost nobody complains it lacks features. **A cleaner, rock-solid, local-only app wins without matching its breadth.**

---

## 1. Market analysis

### 1.1 Competitor table

| App | Android? | Installs · Rating | Price (USD) | Backend |
|---|---|---|---|---|
| **MobileSheets** (`com.zubersoft.mobilesheetspro`) | Yes (+ iOS, Windows, E-Ink sold separately) | 100K+ · 4.7 (5.3K); updated 24 Sep 2026 | **$15.99 one-time per platform** | None required; optional Dropbox/Drive/OneDrive/Nextcloud sync |
| MobileSheets Trial (`com.zubersoft.mobilesheetsfree`) | Yes | 500K+ · 4.0 (1.69K) | Free: 8 songs, 2 bookmarks, 2 links per song | None |
| **forScore** (reference) | **No** | App Store 4.8 (~43K); 1M copies sold; ~102M sessions in 2024 | $24.99 one-time; Pro $14.99/yr or $2.99/30 days | None |
| Newzik | **No** (web only) | App Store 4.6 (1.5K) | $24.99; $44.99/yr; $9.99/mo; $179 lifetime | Cloud |
| OnSong | **No, no plans** | iOS 4.5 | $29.99/yr or $59.99/yr | Optional |
| Piascore | **No** ("under review") | App Store 4.6 | Free + $5.99 upgrade; IMSLP built in | Minimal |
| SongbookPro (`com.songbookpro.songbookpro`) | Yes | 500K+ · 4.6 (9.33K) | ~$6.99 one-time per platform; 12-song trial; Groups subscription | Bring your own cloud; Groups server |
| SongBook (LinkeSOFT) | Yes | 50K+ · 4.7–4.8 | ~$19 (**uncertain**) | Optional cloud |
| MuseScore app (`com.musescore.playerlite`) | Yes | 10M+ · 4.2 (161K) | Subscriptions; billing complaints | Account; **not a reader for your own PDFs** |
| Musicnotes | Yes | 1M+ · 4.2 | Pro $49.99/yr, Pro-Premium $99.99/yr + per-song purchases | Store |
| PCO Music Stand | Yes | 100K+ · 4.1 | Needs Planning Center Services + add-on (~$5–10/mo) | Hard dependency |
| Charts by WorshipTools | Yes | ~670K · 4.47 | Free | Account |
| nkoda | Yes | 100K+ · **2.4** | $14.99/mo or $149.99/yr | Hard dependency; crashes and login loops |
| Henle Library | Yes | 10K+ · 3.4 | Per-score purchases; can't import own PDFs | Store |
| **ScorePDF** (`com.enoiu.scorepdf`) | Yes | 100K+ · **4.8** (4.23K) | Free with ads + Pro one-time | None |
| GoScore | Yes | 50K+ · 4.3 | Free with ads + Premium unlock | None |
| Orpheus classic | **Removed from Play Dec 2025** | 50K+ · 2.9 | — | — |
| Orpheus 2.0 | Yes | 1K+ · 3.8 | Free 30 charts; Pro subscription | Account |
| **Lectern** (indie) | Yes | 1K+ · 4.7 (20) | Free + Pro one-time | Firebase analytics; Drive backup |
| **enScore** (indie, 2026) | Yes | 1K+, no ratings yet | Pro **$9.99** one-time; Sync $14.99/yr optional | Offline, no account |
| MusicReader | Yes | 10K+ · 3.5 | $10–15/yr | Account |
| IMSLP (official) | Yes | ~430K · 4.41 | Free | Online library |

### 1.2 Competitor profiles

**MobileSheets (the incumbent to beat)**
- Features: almost everything. PDF/image/ChordPro/ABC import, 20 metadata fields, setlists, layered stylus annotation with stamps, half-page turns, dual page, auto-scroll, Bluetooth/USB/MIDI pedals, face-gesture turns, link points for repeats, cropping, audio player with A-B loop, metronome, transposition for ChordPro, MIDI commands, paired-tablet page turns, cloud library sync, Windows companion.
- Pros: depth; reliable for many long-time users; responsive solo developer; no subscription or account; strong organization for 1,000+ scores.
- Cons: dated UI (users compare it to Windows 8; a Material 3 redesign has been promised); steep learning curve; per-platform licenses; sync bugs (accented titles break annotation sync; Nextcloud/Drive issues); a long-running "randomly returns to library" bug (forum thread with 161K views); lag on huge annotated PDFs; confusing icons. No tuner or pitch pipe.

**forScore (what Android users envy)**
- Loved features: fast metadata and search; Apple Pencil ink with layers and stamps; half-page turns; Links and Buttons for repeats/D.C./coda; crop, rearrange, insert pages; setlists; metronome that reads tempo metadata; tuner and pitch pipe; pedal support; face gestures (Pro); practice dashboard; nearby-device sync; backups and recovery.
- Cons: no folders; learning curve for advanced tools; Apple-only.

**ScorePDF / GoScore / Lectern / enScore (indie readers)**
- ScorePDF keeps **4.8★ with a simple, clean reader** (pedals, page reordering for repeats, half-page, dark filters, setlists). Proof that simple and fast beats deep and complex for many users. Complaints: blank pages when scrolling fast through big files (since fixed), some cloud PDFs invisible to import, ad quality.
- Lectern: tiny, but praised as "clean, not clunky". Validates the positioning.
- enScore: new, cross-platform, IMSLP search, half-page turns, pressure ink, practice logging, $9.99 Pro. **The closest direct competitor. Watch its updates and reviews.**

**Worship segment** (SongbookPro, WorshipTools, PCO, OnSong)
- Mostly chord charts (ChordPro/lyrics) rather than PDF scores. OnSong refuses to build for Android. **Don't chase this in v1**; basic ChordPro rendering + transpose is a v2 wedge.

### 1.3 Review analysis: complaints

Sources: Play Store (MobileSheets, Trial, SongbookPro, SongBook, PCO, MuseScore, Musicnotes, nkoda, Henle, ScorePDF, GoScore, Orpheus 2.0, Lectern), AppBrain snippets, App Store reviews, ~70 recent Zubersoft forum threads. Reddit wasn't accessible. Counts are indicative.

| # | Theme | ~Count | Implication for you |
|---|---|---|---|
| 1 | Sync / cloud reliability (duplicates, annotations not syncing, near library loss) | 14 | **No sync in v1.** Local-first + backups. Zero sync bugs by design |
| 2 | Crashes, freezes, random resets | 10 | Stability is the feature. Crash-free > features |
| 3 | Subscription / billing dark patterns (MuseScore, Musicnotes, nkoda, OnSong) | 9 | One-time price, clearly stated |
| 4 | Dated UI / steep learning curve | 8 | Modern Material 3 UI, sensible defaults, 3-minute onboarding |
| 5 | Pedal problems (stops working, MIDI mode, soft keyboard disappears) | 7 | Pedal "learn" screen, all common keycodes, soft-keyboard hint |
| 6 | Import problems (cloud PDFs invisible, Drive root lost, hanging imports) | 7 | Accept `*/*` and check the extension; stream-copy files; share-sheet import |
| 7 | Annotation gaps (no eraser, pen button not eraser, no lasso) | 7 | Eraser, pen-button eraser, lasso select in v1 |
| 8 | Large-PDF lag / blank pages | 5 | Pre-render cache; test with 300-page, 100 MB scans |
| 9 | Half-page / zoom problems on 16:10 screens | 5 | Half-page = crop rects designed for widescreen |
| 10 | Login loops (nkoda, PCO, MuseScore) | 5 | No account, ever |
| 11 | Backup / migration pain (Orpheus 2.0, MobileSheets restore) | 5 | One-file zip backup + importer from MobileSheets/Orpheus folders (P1) |
| 12 | Per-platform repurchase | 4 | Android-only; one purchase covers all Android devices |
| 13 | Missing OneDrive | 3 | System picker covers any cloud with a DocumentsProvider |
| 14 | Sharing charts with bandmates is hard | 2 | Share score (PDF, optionally with flattened annotations) |
| 15 | Can't delete duplicate pages | 2 | Page manager: delete, reorder, duplicate |
| 16 | Ads | 2 | No ads |

### 1.4 Praise themes (what users value)

| Theme | ~Count | Implication |
|---|---|---|
| Responsive developer | 10 | Reply to every review and email; public changelog |
| Replaces binders | 8 | Import from camera scan (P1) and PDFs |
| Organization and fast search at 1,000+ scores | 7 | FTS5 search, metadata, filters |
| Setlists that flow in performance | 6 | Setlist performance mode, one pedal press to the next song |
| No subscription / no account | 5 | Lead with it |
| Reliable with pedals on stage | 5 | Test with real pedals |
| Clean, simple, fast to learn | 5 | Ruthless simplicity |
| Half-page turns + repeat links | 4 | P0 |
| Stylus annotation feels natural | 4 | Low-latency ink |
| Camera scan, backing tracks, face gestures | 2 each | P1/P2 |

### 1.5 Feature requests (Zubersoft forum + Play reviews) and forScore gaps

- Visible next/previous page arrows or tap zones
- **Sticky notes** on pages (26K-view thread)
- Audio-synced automatic page turns (15.7K views)
- **Lasso select** and move annotations
- Multi-track backing tracks
- **Performance lock mode** (disable accidental touches)
- Favourites
- **Pitch pipe / tuner** (38K-view thread)
- Split a score into parts
- Annotation presets, line tool, single-use eraser
- Archive setlists
- "Played vs opened" history
- Incremental backups, zip import with setlists
- Flats/sharps preference when transposing
- Scroll by less than half a page
- PDF outline/bookmark navigation
- From Play: delete duplicate pages, share charts, OneDrive, lyric search, pan while zoomed, folders

**forScore gaps on Android:** polish and a stage-tested reputation; Pencil-grade ink; one purchase across devices; metronome + tuner + practice dashboard in one app; crop/rearrange/copy-paste pages; Links and Buttons for repeats. **Hardware is not the gap:** the Galaxy Tab Ultra (14.6") and TCL NXTPAPER 14 (3:2) are praised for reading music. The software is.

---

## 2. Market size & pricing

- Tablet web share (StatCounter, Aug 2026): iOS 52.3%, Android 47.5%. 2025 tablet shipments 151.9M (IDC).
- MobileSheets forum: ~2,900 Android topics vs 409 for iPadOS. The Android base is the core.
- Estimated paid Android reader market: roughly 100K–300K lifetime paid installs for the incumbent (**rough estimate**). Niche, but real, with low competition in quality.
- **Churn to capture:** Orpheus classic removed (50K+ past installs), nkoda 2.4★, OnSong/Piascore/Newzik absent.
- **Price:** anchors are MobileSheets $15.99, forScore $24.99, enScore $9.99, SongbookPro $6.99. **Pro $12.99 one-time** (launch $9.99). Regional pricing via Play (India ~₹399).
- **Free tier:** 15 scores, all core reading features, pedals, 1 setlist, basic ink. Pro unlocks unlimited scores, unlimited setlists, layers, stamps, crop, links/jumps, metronome, backups automation, themes.

---

## 3. Positioning & users

**Pitch:** *"Your whole music library on your Android tablet. Instant page turns, pedal support, pencil annotations. Works offline. No account. Buy once."*

**Personas**
1. **Gigging musician** (jazz, pop, function band): 500–3,000 charts, fake books, setlists, pedal. Needs instant search and zero-lag turns on stage.
2. **Classical player / pianist:** long scores, repeats and D.S./coda jumps, half-page turns, detailed pencil markings.
3. **Student / teacher:** lessons, annotations, metronome, practice tracking.
4. **Worship musician** (PDF charts): setlists per service, pedals (chord-chart features are v2).

**Non-goals (v1):** cloud sync servers, accounts, ensemble/conductor features, OMR/AI playback, sheet music store, iOS/Windows versions, full ChordPro engine, MIDI device control.

---

## 4. Feature spec

**P0** = launch, **P1** = next 1–2 updates, **P2** = later.

### 4.1 Import (P0)
- System picker (SAF) multi-select PDFs (accept `application/pdf` and `*/*` with an extension check so cloud providers aren't hidden). Folder import via `ACTION_OPEN_DOCUMENT_TREE` (recursive) with a progress sheet.
- **Share sheet / "Open with"** (`ACTION_SEND`, `ACTION_SEND_MULTIPLE`, `ACTION_VIEW` for PDFs) from Drive, email, WhatsApp, browser.
- Copy every file into app-private storage (`files/scores/<uuid>.pdf`) by **stream**, since cloud files may be virtual. Keep the original name and URI as metadata.
- Deduplicate by hash (size + SHA-1 of the first and last 1 MB). Offer "import anyway".
- Auto-fill title from the filename (strip underscores, numbers, "pdf"); composer detection from a "Title - Composer" pattern.
- Generate a thumbnail of page 1 at import.
- P1: camera scan to PDF (ML Kit Document Scanner, on-device); images (JPG/PNG) as scores; zip import from a backup; import from MobileSheets export folders **(verify format)**.
- **Acceptance:** importing 200 PDFs (2 GB) from a folder completes without an ANR and shows progress; a cloud-only Drive file imports via the share sheet.

### 4.2 Library (P0)
- Grid (covers) / list views; sort by title, composer, recently played, date added; filters: composer, genre, key, tags, collection, favourites (P1).
- Metadata per score: title, composer, arranger, genre, key, tempo (BPM), time signature, tags (many), collections (many), difficulty (P1), notes, custom fields (P2).
- **Search:** SQLite FTS5 across title, composer, tags and notes; results as you type; under 50 ms for 5,000 scores.
- Batch edit metadata (multi-select). Delete and restore (trash, 30 days).
- Recents: "opened" and "played" (played = open more than 30 s in performance mode) (P1).
- **Acceptance:** 5,000-score library scrolls at 60 fps on a mid-range tablet; search returns in under 50 ms.

### 4.3 Reader (P0, the core of the product)
- **Page modes:** single page (fit page), two-up (landscape), **half-page turn** (next half slides in: top half shows the next page's top while the bottom still shows the current page's bottom), vertical continuous scroll (P1).
- **Turning:** tap zones (right/left thirds; configurable), swipe, **Bluetooth/USB pedals**, volume keys (toggle), optional on-screen arrows.
- **Speed target:** page turn visible in **under 50 ms** from a pedal press for cached pages; next ±2 pages always pre-rendered.
- Zoom: pinch zoom with pan; double-tap to fit; remember zoom per score (P1).
- Per-score display: **crop margins** (auto-detect whitespace + manual), rotate, brightness/contrast/sepia/dark filters (P1: dark mode that inverts pages).
- **Links / jumps (repeats, D.S., coda):** tap a hotspot on page X → jump to page Y (and optionally back). Created in edit mode by dragging from source to target. Pedal "next" follows a link if the current page ends with one (configurable).
- Bookmarks: named page bookmarks, list in a drawer; PDF outline if present (P1).
- **Performance mode (lock):** hides all UI; disables annotation and accidental taps except turn zones; keeps the screen awake; immersive full screen.
- Page manager (Pro): reorder, delete, duplicate, insert a blank page, rotate; stored as a page map over the original PDF (non-destructive).
- **Acceptance:**
  - 300-page, 100 MB scanned PDF: open in under 1 s to the first page; pedal-turn latency under 50 ms p95; no OOM after 500 rapid turns; no crash when closing during rendering.
  - Half-page mode correct on 16:10 and 3:2 screens in portrait and landscape.

### 4.4 Pedals & keyboard input (P0)
- Default mapping: **Next** = DPAD_DOWN, DPAD_RIGHT, PAGE_DOWN, SPACE, ENTER, MEDIA_NEXT; **Previous** = DPAD_UP, DPAD_LEFT, PAGE_UP, MEDIA_PREVIOUS. Volume keys optional.
- **"Press your pedal" learn screen:** captures a keycode and assigns it to next, previous, next song in setlist, previous song, toggle half-page, or toggle performance mode. Shows the device name ("AirTurn detected").
- Debounce: ignore `repeatCount > 0` and presses within 150–250 ms (configurable).
- Consume mapped keys at the Activity level (`dispatchKeyEvent`) **only while the reader is active**, so arrows don't move focus.
- Soft-keyboard hint: if a hardware keyboard is detected (`Configuration.keyboard != KEYBOARD_NOKEYS`) and a text field is focused, show "Your pedal counts as a keyboard, so Android hid the on-screen keyboard. Tap here for how to fix it".
- P2: BLE-MIDI pedals (M-Vave Chocolate MIDI mode, AirTurn mode 7).
- **Acceptance:** tested with at least 2 real pedals (e.g. a Donner/M-Vave in arrow mode and a PageFlip/AirTurn in PgUp/PgDn mode); no double turns in 500 presses.

### 4.5 Annotation (P0 basic, Pro advanced)
- Tools: pen (3 presets), highlighter, **eraser (stroke eraser)**, text (P0), shapes/lines (P1), stamps (music symbols: dynamics, fingerings 1–5, breath, fermata, accidentals, bowings) (Pro), **lasso select** to move/delete (Pro).
- **Stylus-first:** when a stylus is detected, fingers turn pages and pan while the stylus draws (palm rejection via `pointerType`). Finger drawing is a toggle.
- Pressure-sensitive width (Pro) using a perfect-freehand-style outline algorithm.
- **Pen side button = eraser** where the device reports it (S Pen; Lenovo pens **(verify)**).
- Layers (Pro): named layers, visibility toggle (e.g. "Teacher", "My fingerings").
- Undo/redo per page session.
- Stored in normalized page coordinates (0..1) so ink survives crop and zoom.
- Export: share the PDF with annotations **flattened** (render pages with ink to a new PDF) (Pro).
- **Acceptance:** ink latency visually tight on a Galaxy Tab S-series with S Pen; 2,000 strokes on one page stay smooth; strokes stay aligned after crop changes.

### 4.6 Setlists (P0: 1 free, unlimited Pro)
- Create, reorder (drag), duplicate, archive (P1); add scores from library search; per-entry start page and notes.
- **Setlist performance mode:** pedal next at the last page → next song (configurable), a small "next up" indicator, jump list.
- Share a setlist as a text list or as a merged PDF (Pro, P1).

### 4.7 Tools (Pro)
- **Metronome (P0 Pro):** BPM from score metadata, tap tempo, accent patterns, visual flash, audio click via a **native audio scheduler** (JS timers drift).
- **Pitch pipe (P1)** and **tuner (P1)** (tuner needs the mic; request permission only then).
- Practice log (P2): time per score, streaks.
- Audio track per score with A-B loop and speed change (P2).
- Face-gesture page turns (P2, ML Kit face detection on-device).
- Audio-synced auto page turns (P2).

### 4.8 Backup & data (P0)
- **Export backup:** single `.zip` (SQLite DB dump + PDFs + ink + settings) via SAF "Create document".
- **Auto backup to a folder** (Pro): persisted tree URI (e.g. a Drive-synced or SD-card folder), daily or weekly, keep last N. Incremental: copy only new or changed PDFs by hash (P1).
- Restore with preview and merge/replace.
- Android Auto Backup covers only the DB and settings (25 MB cap), not PDFs; say so in-app.
- **Acceptance:** backup/restore round-trip of a 1,000-score, 3 GB library completes; resulting library is identical (hash check).

### 4.9 Settings
Page turn behaviour, tap zones, pedal mappings, half-page split position, theme (light/dark/sepia), default page mode per orientation, stylus options, backup, Pro, support (email with logs), privacy policy, licenses.

---

## 5. Screens & navigation

```
Library (home)
 ├─ top: search bar, sort, filter chips (composer/genre/tag/collection)
 ├─ grid/list of scores → long-press multi-select → batch edit / add to setlist / delete
 ├─ FAB: Import (files / folder / scan[P1])
 └─ tabs: Library | Setlists | Collections | Settings

Reader (full screen)
 ├─ tap center: show overlay (title, page slider, thumbnails strip, tools)
 ├─ overlay buttons: annotate, bookmarks, links edit, crop, page mode, metronome, info
 ├─ annotation toolbar (floating, draggable)
 └─ performance mode: nothing visible, turn zones only

Setlist → list of songs → Play setlist → Reader in setlist mode
Settings → Pedals (learn screen), Display, Stylus, Backup, Pro
Paywall → shown on the 16th import or a Pro feature tap
```

Design: tablet-first layouts (two-pane library on ≥ 840 dp width), large touch targets, Material 3, high contrast for stage lighting, dark theme default in performance mode.

---

## 6. Data model (SQLite via op-sqlite, FTS5 enabled)

```sql
CREATE TABLE scores (
  id TEXT PRIMARY KEY,                 -- uuid v7
  title TEXT NOT NULL, composer TEXT, arranger TEXT, genre TEXT,
  music_key TEXT, tempo_bpm INTEGER, time_sig TEXT, difficulty INTEGER, notes TEXT,
  file_path TEXT NOT NULL,             -- app-private path
  file_hash TEXT NOT NULL, file_size INTEGER, page_count INTEGER,
  original_name TEXT, original_uri TEXT,
  thumb_path TEXT,
  is_favorite INTEGER DEFAULT 0,
  default_page_mode TEXT,              -- SINGLE | TWO_UP | HALF | SCROLL
  last_page INTEGER DEFAULT 0, last_opened_at INTEGER, last_played_at INTEGER, play_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE VIRTUAL TABLE scores_fts USING fts5(title, composer, arranger, genre, tags, notes, content='');

CREATE TABLE tags (id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL);
CREATE TABLE score_tags (score_id TEXT REFERENCES scores(id) ON DELETE CASCADE, tag_id TEXT REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY(score_id, tag_id));
CREATE TABLE collections (id TEXT PRIMARY KEY, name TEXT NOT NULL, sort INTEGER);
CREATE TABLE collection_scores (collection_id TEXT, score_id TEXT, PRIMARY KEY(collection_id, score_id));

-- Non-destructive page map: display order over original PDF pages
CREATE TABLE page_map (score_id TEXT REFERENCES scores(id) ON DELETE CASCADE, display_index INTEGER, source_page INTEGER, rotation INTEGER DEFAULT 0,
  crop_l REAL, crop_t REAL, crop_r REAL, crop_b REAL,   -- normalized 0..1
  PRIMARY KEY(score_id, display_index));

CREATE TABLE links (id TEXT PRIMARY KEY, score_id TEXT REFERENCES scores(id) ON DELETE CASCADE,
  from_display_index INTEGER, x REAL, y REAL, w REAL, h REAL,       -- normalized hotspot
  to_display_index INTEGER, to_y REAL DEFAULT 0, label TEXT, auto_follow INTEGER DEFAULT 0);

CREATE TABLE bookmarks (id TEXT PRIMARY KEY, score_id TEXT REFERENCES scores(id) ON DELETE CASCADE, display_index INTEGER, name TEXT);

CREATE TABLE layers (id TEXT PRIMARY KEY, score_id TEXT REFERENCES scores(id) ON DELETE CASCADE, name TEXT, visible INTEGER DEFAULT 1, sort INTEGER);
CREATE TABLE strokes (
  id TEXT PRIMARY KEY, layer_id TEXT REFERENCES layers(id) ON DELETE CASCADE,
  source_page INTEGER NOT NULL,        -- anchored to the original page, not display index
  tool TEXT NOT NULL,                  -- PEN | HIGHLIGHTER | TEXT | STAMP | SHAPE
  color INTEGER, width REAL, opacity REAL,
  points BLOB,                         -- packed Float32Array [x,y,pressure]* normalized
  text TEXT, stamp_id TEXT, bbox_l REAL, bbox_t REAL, bbox_r REAL, bbox_b REAL,
  created_at INTEGER, deleted_at INTEGER
);
CREATE INDEX idx_strokes_page ON strokes(layer_id, source_page);

CREATE TABLE setlists (id TEXT PRIMARY KEY, name TEXT NOT NULL, event_date TEXT, notes TEXT, archived INTEGER DEFAULT 0, created_at INTEGER, updated_at INTEGER);
CREATE TABLE setlist_items (id TEXT PRIMARY KEY, setlist_id TEXT REFERENCES setlists(id) ON DELETE CASCADE, score_id TEXT REFERENCES scores(id), position INTEGER, start_display_index INTEGER DEFAULT 0, notes TEXT);

CREATE TABLE pedal_mappings (keycode INTEGER PRIMARY KEY, action TEXT NOT NULL, device_name TEXT);
CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER);
```

---

## 7. Tech stack & architecture

### 7.1 The key decision: PDF rendering

Research on existing RN PDF libraries:
- **react-native-pdf** (PDFium, v7.x): easy, but 383 open issues, including 2026 **SIGSEGV crashes on fast close** and historic OOMs with 80 MB files. It is a whole-document view, which makes a custom ink layer, half-page and crop hard. ❌ Not for the core reader.
- **react-native-pdf-renderer** (Android `PdfRenderer`): light, but crashes zooming large pages unless `maxPageResolution` is set; bitmap only. ⚠️
- ✅ **Custom Kotlin module (recommended):**
  - API: `renderPage(docId, sourcePage, cropRect, targetWidthPx, targetHeightPx, quality) → bitmap handle/file`, `open(docPath) → docId, pageCount, pageSizes`, `close(docId)`, `prefetch(docId, pages[])`, `cancel(requestId)`.
  - Engine: `android.graphics.pdf.PdfRenderer` (API 21+). It allows **one open page per instance and isn't thread-safe**, so use a dedicated render thread per document, or 2 instances for prefetch. Fall back to **PDFium** (e.g. a maintained `pdfium-android` fork) for PDFs that PdfRenderer rejects **(verify library)**. Evaluate Jetpack `androidx.pdf` (check alpha/beta status).
  - LRU bitmap cache: current ±2 pages at display resolution. A 14.6" tablet page is ~21 MB ARGB_8888; keep 3–5 in memory and use `RGB_565` for pages without transparency. On-disk WebP cache for thumbnails and a low-res preview (shown instantly, then replaced by the sharp render).
  - Pass bitmaps to JS-side rendering without copying: either a **native view** (`ScorePageView`) that draws the cached bitmap and exposes an overlay slot, or Skia images via a shared texture **(prototype both in M1; pick the lower latency)**.
- Build as a **Kotlin Turbo Module + Fabric native component** (`ScorePageView`) inside the app's `android/` project, with TypeScript codegen specs in `src/specs/`. New Architecture only.

### 7.2 Full stack

| Concern | Choice | Notes |
|---|---|---|
| App | **Bare React Native (Community CLI, latest stable 0.8x)**, New Architecture + Hermes, TypeScript strict. **No Expo** | `npx @react-native-community/cli init` |
| Local native modules | **Kotlin Turbo Modules / Fabric components** with codegen specs | `ScoreRenderer` + `ScorePageView`, `KeyEvents`, `Metronome`, `SafImport`, `KeepAwake` |
| Ink | **@shopify/react-native-skia** (Canvas + Path, UI-thread drawing with Reanimated shared values) | Prototype Jetpack **androidx.ink** / front-buffered rendering in a native view if Skia latency isn't good enough |
| Gestures / stylus | **react-native-gesture-handler** Pan with `stylusData` (pressure, tilt) and `pointerType` | Pen button and historical points may need a native hook **(verify)** |
| Animation | react-native-reanimated | Page transitions, half-page slide |
| DB | **@op-engineering/op-sqlite** (JSI, FTS5, reactive queries) | |
| Settings | **react-native-mmkv 4.x** | Pedal map cache, UI state, entitlement cache |
| File import | Custom Kotlin SAF module (`ACTION_OPEN_DOCUMENT` multi, `ACTION_OPEN_DOCUMENT_TREE`, stream copy, persistable permissions) | `@react-native-documents/picker` core `pick()` is free, but its docs mark `keepLocalCopy` / directory picker / Save As as sponsor-only **(verify)** |
| Key events | **Override `dispatchKeyEvent` directly in `MainActivity.kt`** and forward to a `KeyEvents` Turbo Module (event emitter) | react-native-keyevent is stale and also edits MainActivity; doing it yourself gives debounce, repeat filtering and device names |
| Keep awake | Tiny `KeepAwake` module setting `FLAG_KEEP_SCREEN_ON` on the Activity window | Or `@sayem314/react-native-keep-awake` **(verify maintenance)** |
| Navigation | React Navigation 7 (native stack + tabs) | |
| Release | Gradle `bundleRelease` + Fastlane `supply` / GitHub Actions | No EAS |
| Metronome | Native AudioTrack/Oboe scheduler | JS timers drift |
| Camera scan (P1) | ML Kit Document Scanner API (on-device) | |
| Face gestures (P2) | ML Kit Face Detection + CameraX (or react-native-vision-camera frame processor) | |
| IAP | **react-native-iap 16.x** (Nitro, Play Billing v8, RN 0.79+), one non-consumable `pro_lifetime` | RevenueCat unnecessary |
| Testing | Jest, RN Testing Library, Maestro; a native instrumentation benchmark for rendering | |

### 7.3 Architecture

```
android/app/src/main/java/<pkg>/
  MainActivity.kt   dispatchKeyEvent override → KeyEventsModule
  renderer/         ScoreRendererModule.kt (Turbo Module: PdfRenderer + PDFium fallback, render queue, LRU cache)
                    ScorePageViewManager.kt (Fabric component drawing cached bitmaps)
  keys/             KeyEventsModule.kt (debounce, repeat filter, device name → JS events)
  saf/              SafImportModule.kt (pickers, tree walk, stream copy, hashing)
  audio/            MetronomeModule.kt (AudioTrack scheduler)
src/specs/          codegen specs: NativeScoreRenderer.ts, ScorePageViewNativeComponent.ts, NativeKeyEvents.ts, NativeSafImport.ts, NativeMetronome.ts
src/
  domain/           page-map math (crop, half-page rects), link resolution, setlist navigation (pure TS)
  data/             db, migrations, repositories, fts indexing
  reader/           ReaderScreen, PageView (native), InkLayer (Skia), overlays, performance mode
  library/          grid/list, search, filters, batch edit
  setlists/
  backup/           zip export/import, folder auto-backup
  billing/
  ui/               design system
```

---

## 8. Implementation notes & pitfalls

1. **Half-page turn math:** display = `[currentPage bottom half]` + `[nextPage top half]` composited from two crop rects. Split position configurable (default 50%; staff-aware split is P2). Pre-render both halves.
2. **Crop:** store normalized rects in `page_map`; rendering always asks the native module for the crop rect, so ink coordinates stay relative to the uncropped source page.
3. **Links:** store hotspots in display coordinates; when the page map changes, remap or warn.
4. **Memory:** watch `onTrimMemory`; drop the cache aggressively on low memory; never hold more than 5 full-res bitmaps.
5. **Fast-close crash class:** cancel pending renders and wait for the render thread before closing the `PdfRenderer`/`ParcelFileDescriptor` (the SIGSEGV issue seen in react-native-pdf).
6. **Malformed PDFs:** try PdfRenderer; on exception, fall back to PDFium; if both fail, show a friendly error with "Send file to developer".
7. **SAF quirks:** Drive/OneDrive virtual files need `openTypedAssetFileDescriptor` with `application/pdf`; the ~128 persisted URI grant limit per app **(verify current limit)**; always copy locally.
8. **Pedal focus bug:** DPAD keys trigger RN focus navigation. Consume them in `dispatchKeyEvent` before the view hierarchy, only while the reader is active.
9. **16 KB page size:** every native `.so` (PDFium, Skia, op-sqlite, MMKV, Nitro) must be 16 KB aligned for Play (required from 1 Feb 2027). Check with `zipalign -c -P 16 -v 4` in CI.
10. **Play policies:** target API 36 (since 31 Aug 2026); Play Billing Library 8+; acknowledge purchases within 3 days.
11. **Data Safety:** no network permission needed except IAP (Play Billing runs through the Play Store app). Declare "No data collected" if no analytics SDK is included. Strong marketing point.

---

## 9. Play Store listing (ASO draft)

- **Title:** `<Brand>: Sheet Music Reader` (the category's ranking pattern)
- **Short description:** `Offline PDF sheet music, setlists & pedal page turns. No subscription.`
- **Keywords to use:** sheet music reader, PDF sheet music, music stand, digital music stand, setlist, page turner, bluetooth pedal, foot pedal, half page turn, annotate music, score reader, fake book, real book, piano sheet music, orchestra parts, choir music, lead sheets, metronome, offline, no subscription, one-time purchase, stylus, S Pen, forScore alternative, MobileSheets alternative (use competitor names in the long description only, carefully, per Play policy **(verify)**).
- **Localize** (big classical markets): German (Noten), Spanish/Italian (partitura), French (partition), Japanese (楽譜) (P1).
- **Screenshots:** tablet landscape two-up, half-page turn demo, pedal learn screen, annotation with stamps, setlist mode, library with 1,000 scores, "No account · Offline · Buy once" card.
- **Video:** 30 s showing a pedal turning pages instantly.
- **Partnerships:** get listed on AirTurn's compatible-apps page; pitch to "best Android sheet music app" articles (getmusictools.com, tablets-for-musicians, practis.com); post in the Zubersoft-adjacent communities, r/piano, r/classicalmusic, r/WorshipLeaders (as a helpful dev, not spam).

---

## 10. Pricing implementation

- Free: up to 15 scores (imports beyond 15 open the paywall; existing scores always stay readable), 1 setlist, pen/highlighter/eraser, pedals, half-page, performance mode, manual zip backup.
- **Pro `pro_lifetime` $12.99** (launch $9.99): unlimited scores and setlists, layers, stamps, lasso, pressure ink, crop, links, page manager, metronome, pitch pipe/tuner (P1), auto-backup to folder, flattened export, themes.
- Covers all the user's Android devices through Play ("Restore purchase").
- Promise on the listing: *"Buy once. No subscription, ever, for features you bought."*

---

## 11. Build plan for Claude Code (milestones)

**M0: Setup (2 days)**
- Bare React Native project (`npx @react-native-community/cli init`), New Architecture, TS strict, ESLint, Jest, Maestro, CI with `./gradlew assembleRelease` + a 16 KB alignment check; codegen specs and Kotlin scaffolds for `ScoreRenderer`/`ScorePageView`, `KeyEvents`, `SafImport`.

**M1: Rendering spike (critical, 8–10 days)**
- Kotlin renderer: open/close, render page/crop to bitmap, render thread, LRU cache, prefetch ±2, cancelation; `ScorePageView` native view; a test screen that turns pages via volume keys.
- Benchmark harness: 300-page 100 MB scan, 50-page vector PDF, 1-page huge poster PDF.
- Accept: p95 turn under 50 ms for cached pages on a mid-range tablet (e.g. Galaxy Tab A9+ or Lenovo Tab M-series); no OOM after 500 rapid turns; no crash on rapid open/close ×100. **If this fails, fix it before anything else.**

**M2: Reader v1 (6–8 days)**
- Single/two-up/half-page modes, tap zones, swipe, zoom/pan, performance mode, keep-awake, per-score last page; key-events module with default mapping, debounce, learn screen.
- Accept: works with 2 real pedals; half-page correct on 16:10 and 3:2 screens.

**M3: Import & library (6–7 days)**
- SAF module (files, folder, share intent, stream copy, hashing, dedupe), thumbnails, library grid/list, metadata editor, batch edit, FTS5 search, sort/filter, trash.
- Accept: 200-file folder import with progress, no ANR; 5,000-item library at 60 fps; search under 50 ms.

**M4: Annotation (8–10 days)**
- Skia ink layer over `ScorePageView`, stylus detection and palm rejection, pen/highlighter/eraser/text, undo/redo, persistence as normalized strokes, layers, stamps, lasso (Pro), pen-button eraser where available.
- Accept: ink aligned after crop/zoom; 2,000 strokes on a page stay smooth; latency acceptable on S Pen (subjective test + frame timing).

**M5: Setlists, links, crop, page manager (5–6 days)**
- Setlists with performance flow; link hotspots with an editor; crop (auto + manual); bookmarks; page manager (reorder/delete/duplicate/rotate) via `page_map`.

**M6: Backup, IAP, metronome (5–6 days)**
- Zip export/import, auto-backup to folder (Pro), restore preview; `pro_lifetime` IAP with paywall at the 16th import; native metronome.
- Accept: 1,000-score backup round-trip identical; purchase restore after reinstall; metronome drift under 1 ms/min.

**M7: Polish & launch (5–7 days)**
- Onboarding (import first score + pedal setup), empty states, accessibility, tablet two-pane layouts, dark theme, crash-free closed test (Play closed testing requirement for new personal accounts **(verify)**), store assets, privacy policy.

**Post-launch (P1):** camera scan → pitch pipe/tuner → sticky notes → played-vs-opened history → incremental backup → vertical scroll mode → MobileSheets/Orpheus import helper. **P2:** face gestures, audio-synced turns, BLE-MIDI pedals, ChordPro charts + transpose (worship wedge), IMSLP open-in.

---

## 12. Test plan

- **Renderer instrumentation tests:** render correctness (pixel diff against reference PNGs), latency percentiles, memory ceiling, fast open/close, malformed-PDF fallback.
- **Unit:** page-map/crop/half-page math, link resolution, setlist navigation, pedal debounce.
- **E2E (Maestro):** import → search → open → half-page → pedal turns (simulated key events) → annotate → setlist mode → backup/restore → purchase/restore.
- **Hardware matrix:** Galaxy Tab S-series (S Pen), Galaxy Tab A-series (budget), Lenovo Tab (pen), TCL NXTPAPER (3:2 screen), a phone, and 2 pedals (arrow mode + PgUp/PgDn mode).

---

## 13. Risks & open questions

| Risk | Mitigation |
|---|---|
| Rendering/ink performance in RN isn't good enough | Native render module + native page view from day 1; prototype Jetpack Ink if needed |
| Niche market size | Low build cost (no backend); strong ASO; community presence; later worship/ChordPro wedge |
| MobileSheets ships its Material 3 redesign | Compete on speed, simplicity, ink quality and stability; its depth is also its complexity |
| enScore grows quickly | Differentiate on Android-native polish, tablet UX, half-page quality, pedal learn screen |
| Stylus hardware fragmentation | Test on S Pen + one generic pen; finger drawing toggle |
| No sync (requested by some) | Folder auto-backup to a cloud-synced folder; explicit "local-first" messaging |

Open questions:
1. Free limit 15 scores vs time-limited full trial? (Recommend 15 scores: matches the market norm of 8–30.)
2. Price $12.99 vs $14.99? (Start $9.99 launch → $12.99.)
3. Is PDFium fallback worth the APK size (~5 MB)? Decide after testing 200 real-world PDFs from musicians.

---

## 14. Key sources

- Play/AppBrain: MobileSheets (pro + trial), MuseScore, Musicnotes, SongBook, SongbookPro, PCO Music Stand, WorshipTools Charts, OpenSongApp, nkoda, Henle, ScorePDF, GoScore, Orpheus (classic + 2.0), Lectern, enScore, MusicReader, IMSLP.
- App Store: forScore (id363738376), MobileSheets iOS, Newzik, Piascore, OnSong 2026, nkoda.
- Zubersoft forum threads: 4897 (random library resets), 11603 (dated UI), 15364 (sync + accents), 8953 (large PDF lag), 4144 (pitch pipe), 9576 (sticky notes), 13208 (audio-synced turns), 15645 (lasso), 15230/15325 (lock mode), 15707 (pen button).
- OnSong Android FAQ; Newzik support (no Android app); Orpheus 2.0 knowledge base; AirTurn and PageFlip manuals; Musicnotes hands-free page turn help article.
- StatCounter tablet OS share (Aug 2026); IDC tablet shipments 2025.
- Tech: react-native-pdf GitHub issues; react-native-pdf-renderer issue #26; Android `PdfRenderer` docs; androidx.pdf docs; react-native-skia; react-native-gesture-handler stylusData docs; op-sqlite; react-native-mmkv; @react-native-documents/picker docs; react-native-iap / openiap.
- Full raw research with ~130 URLs: `research_sheetmusic.md` (available on request).
