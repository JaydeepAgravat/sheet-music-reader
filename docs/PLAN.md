# Build Plan: Offline Sheet Music Reader for Android

**Status:** Approved decisions as of 26 Sep 2026. Companion to [`PRODUCT_SPEC.md`](PRODUCT_SPEC.md).
**Rule:** Where this plan and the spec disagree, **this plan wins** (it reflects the decisions made after the spec was written).

---

## 0. Guiding principles

1. **The score is the hero.** UI appears only when asked for and leaves quickly.
2. **Instant beats pretty.** A pedal turn shows the new page in under 50 ms. No animation ever delays a performance action.
3. **Nothing is lost by accident.** Every destructive action can be undone or restored.
4. **Offline, private, honest.** No network calls except Play Billing. No analytics. No nag pop-ups. No dark patterns.
5. **Polish per feature over number of features.** v1 is a polished core. Anything we can't make excellent waits for an update.
6. **Every detail counts.** Every screen gets considered empty, loading, error, long-text (German), large-font (200%) and RTL-safe states, plus a TalkBack pass, before it is "done".

---

## 1. Locked decisions

### 1.1 Product and scope

| Area | Decision |
|---|---|
| Platform | Android only. Tablet-first; phones fully polished. minSdk **29** (Android 10); targetSdk **36** |
| v1 scope | Reader (single, two-up, half-page), pedals + learn, import, library + search + collections, setlists, basic ink (pen, highlighter, eraser, undo/redo), backup/restore, IAP, onboarding |
| After v1 (P1 updates) | Links/jumps, crop, stamps (Bravura), layers, lasso, page manager, metronome, pitch pipe/tuner, camera scan, pressure ink, flattened export |
| Pricing | Free: 15 scores (bundled samples don't count), 1 setlist, all core reading, pedals, basic ink, manual backup. **Pro `pro_lifetime` $12.99** one-time (launch $9.99) |
| Telemetry | None. Crash → next launch offers "Send report?" via email/share sheet (user sees contents). Play label: *No data collected* |
| Languages | EN, DE, ES, FR, IT, JA at launch (Claude translates). i18n from day one |
| Name / applicationId | Placeholder until release. Brand name in one `app.config.ts` + string resources; applicationId in one Gradle property |
| Play account | Organization (AlphaStack). No closed-test requirement. **Start D-U-N-S now** |

### 1.2 Tech stack

| Concern | Choice |
|---|---|
| App | **Bare React Native** (Community CLI, latest stable at setup, verify version), New Architecture, Hermes, TypeScript strict. **No Expo, no expo-\* packages, no EAS** |
| Native | Kotlin Turbo Modules + Fabric components in `android/`, codegen specs in `src/specs/` |
| PDF rendering | Custom Kotlin module on `android.graphics.pdf.PdfRenderer`, dedicated render thread, LRU bitmap cache, prefetch ±2; PDFium fallback evaluated in Phase 2 |
| Page display | Native `ScorePageView` (Fabric) drawing cached bitmaps; overlay slot for ink |
| Ink | `@shopify/react-native-skia` + Reanimated; fallback plan: native ink view (androidx.ink / front-buffered rendering) if latency fails |
| Gestures | react-native-gesture-handler (`pointerType`, `stylusData`) |
| Data | op-sqlite (FTS5, reactive queries) = source of truth |
| State | Zustand (UI state only) + MMKV (preferences, entitlement cache) |
| Lists | FlashList v2 |
| Navigation | React Navigation 7 (native stack + adaptive rail/bottom bar) |
| Billing | react-native-iap (Play Billing 8+) |
| i18n | i18next + react-i18next, ICU plurals; Android `locales_config.xml` for per-app language |
| Testing | Jest + RNTL (unit), component snapshot tests, Kotlin instrumentation benchmarks, Maestro E2E |
| CI | GitHub Actions: typecheck, lint, tests, `assembleRelease`, 16 KB alignment check |
| Repo | https://github.com/JaydeepAgravat/sheet-music-reader, repo-local git identity `Jaydeep Agravat <jaydeepagravat94583@gmail.com>` |

### 1.3 Design direction

| Area | Decision |
|---|---|
| Look | **Calm editorial**: a premium physical music folio. Warm paper neutrals, one restrained accent, generous space. Material 3 components, custom skin |
| Theme | Follow system (light/dark). Performance mode has its own dark stage chrome |
| Colour | Fixed brand palette (no dynamic colour). Accent: **deep ink blue / indigo** |
| Type | Serif for titles and headings (Fraunces or Source Serif 4, chosen in Phase 1) + **Inter** for UI. Bundled, OFL |
| Icons | **Phosphor** (Regular for idle, Fill for active). Music glyphs: **SMuFL Bravura**. Custom SVGs on the same 24 px grid |
| Artwork | Claude designs the app icon (abstract stave forming a turning page corner, adaptive + themed monochrome), illustrations, store graphics in SVG; user reviews |
| Motion | Quiet, physical, fast: springs, 150–250 ms, shared-element transition from cover to reader, predictive back, respects "Remove animations" |
| Haptics | Subtle and meaningful only (scrubber detents, long-press, drag reorder, pedal learned, first/last page). Never on a normal turn. Toggle in settings |
| Voice | Warm, brief, musician-to-musician. No exclamation spam, no jokes in errors |
| Review process | Build directly; review on device/emulator. The design system is reviewed on a showcase screen before real screens |

### 1.4 UX decisions

**Launch and onboarding**
- System splash (icon on paper), no artificial delay, 200 ms fade to the library. Target: under 800 ms cold start to an interactive library.
- First run: 4 bundled public-domain samples (classical piano, jazz lead sheet, 20+ page long score, choral hymn) + a skippable 3-step intro (Import · Pedal · Annotate).

**Library**
- Cover grid by default, list toggle (remembered). Tablet: navigation rail (Library, Setlists, Collections, Settings) + large search + Import FAB. Phone: bottom navigation bar.
- Card: page-1 cover cropped to the top-staff area, serif title, composer, and small badges only when relevant (favourite, annotated, in a setlist).
- Search: instant (under 50 ms), prefix + accent-insensitive ("Dvorak" finds "Dvořák"), highlighted, grouped by Scores / Composers / Setlists / Tags, with local recent searches.
- Import: background with a progress pill → review card ("Imported 12 · 3 duplicates skipped · Review titles") with inline title/composer fixes. Folder import offers "Turn subfolders into collections" (on by default).
- Delete: a single score is removed instantly with an **Undo** snackbar; 2+ scores get a confirm dialog. Everything goes to a **30-day Trash**. Setlists show a "missing score · Restore" row.
- Backup nudge: "Last backup" status in Settings; one dismissible library banner at 25+ scores with no backup. Never shown again once dismissed.

**Reader**
- Default mode by orientation: portrait = single page (fit); landscape tablet = two-up; landscape phone = fit width + vertical pan. Remembered per score after the user changes it.
- Chrome hidden. A centre tap reveals the top bar + bottom thumbnail scrubber, which auto-hide after 3 s or on a turn.
- Tap zones: left/right outer 30% turn pages, centre 40% toggles chrome. A faint zone hint shows on the first 3 opens. Configurable (including "tap anywhere = next").
- Turns: pedal/tap = instant. Swipe follows the finger with physics. Optional 120 ms slide in settings.
- Half-page: top = next page's top, bottom = current page's bottom, soft divider + small page tags, draggable split (default 50%, per score).
- End of score: soft stop + light haptic + "End of score · Back to start · Next in library" card. Never auto-jumps.
- Resume: opens on the last page with a 2 s pill "Resumed at p. 7 · Start from beginning". Setlists always use the entry's start page.
- Page filters: Original (default), Paper, Sepia, Night (inverted, softened), High-contrast. Per score + global default.
- Performance mode: entered from the overlay or a pedal; hides everything, keeps the screen awake, immersive. Exit = **1 s long-press in the centre with a filling ring**.
- Rotation-lock toggle in the overlay.

**Pedals**
- The default key map works immediately. When a pedal first connects: "Pedal detected, press it to test" sheet with a live key visualisation, a "Customise" button, and a soft-keyboard explainer.
- Debounce + repeat filter; keys consumed only while the reader is active.

**Setlists**
- Pedalling past a song's last page loads the next song's start page instantly (pre-rendered). The last page shows a "Next: \<title\>" pill.

**Ink**
- Fingers: explicit annotate mode (pencil button → floating toolbar → Done). Two fingers pan/zoom while in annotate mode.
- Stylus: draws instantly at any time while fingers keep turning pages (palm rejection by `pointerType`).
- Presets: pencil graphite grey, ink blue, teacher red, yellow highlighter. Each is editable and remembered.
- Tools: pen, highlighter, stroke eraser (+ pen side button = eraser where supported), undo/redo. "Clear page" has undo.

**Paywall**
- One honest screen, shown only on a Pro action (16th import or a Pro tool tap). 4–5 benefits with icons, clear price, "One-time · All your Android devices · No subscription", Restore purchase, easy close. No countdowns, no fake discounts.

---

## 2. Design system spec (starting values, tuned in Phase 1)

> Colours below are **starting proposals**. Phase 1 validates each text/background pair (WCAG AA 4.5:1 for body, 3:1 for large text/icons) in both themes and adjusts them.

**Colour tokens (light / dark)**

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg.canvas` | `#F7F4EE` warm paper | `#141518` | App background |
| `bg.surface` | `#FFFDF9` | `#1C1D21` | Cards, sheets |
| `bg.surfaceRaised` | `#FFFFFF` | `#24262B` | Menus, dialogs |
| `text.primary` | `#1C1B19` | `#EDEAE4` | Titles, body |
| `text.secondary` | `#5F5B54` | `#A9A59E` | Composer, meta |
| `text.tertiary` | `#8C877F` | `#76726C` | Hints, disabled |
| `border.subtle` | `#E6E0D6` | `#2E3036` | Dividers, card outlines |
| `accent` | `#2F3F8F` ink indigo | `#9BA9F0` | Primary actions, active tool |
| `accent.container` | `#E3E6F6` | `#2A3163` | Selected chips, active nav |
| `danger` | `#A3362B` | `#F0A197` | Delete, errors |
| `stage.bg` | `#000000` | `#000000` | Performance mode |

Ink preset colours: graphite `#4A4A4A` (opacity .9), ink blue `#1F3FA8`, teacher red `#C62828`, highlighter `#FFE14D` (opacity .35, multiply).

**Typography** (sp; scales with system font size up to 200%)

| Role | Font | Size / line | Weight |
|---|---|---|---|
| Display (onboarding, paywall) | Serif | 34 / 40 | 500 |
| Title L (screen titles) | Serif | 28 / 34 | 500 |
| Title M (score titles, sheets) | Serif | 20 / 26 | 500 |
| Title S (card title) | Serif | 16 / 21 | 500 |
| Body | Inter | 15 / 22 | 400 |
| Label | Inter | 14 / 20 | 500 |
| Caption / meta | Inter | 12.5 / 17 | 400, tabular numerals for page counts |

**Spacing and shape:** 4 dp base grid (4, 8, 12, 16, 24, 32, 48). Radius: cards 12, sheets 20, chips 999, buttons 12. Minimum touch target 48 dp. Elevation: hairline borders + very soft shadows, no heavy M2 shadows.

**Motion tokens:** `fast` 150 ms, `base` 200 ms, `slow` 250 ms; springs (damping 26, stiffness 300) for sheets and drags; standard easing for fades. All switch to instant cross-fades when reduce-motion is on.

**Iconography rules:** Phosphor Regular 24 px on a 1.5 px stroke feel; active state = Fill variant + accent colour. Custom icons (half-page, two-up, performance, pedal) are drawn on the same grid and stroke. Bravura glyphs are only used for notation content, never as UI chrome.

---

## 3. Architecture

```
android/app/src/main/java/<pkg>/
  MainActivity.kt        dispatchKeyEvent → KeyEvents; immersive/keep-awake helpers; share-intent handoff
  renderer/              ScoreRendererModule.kt  (open/close, render queue, LRU, prefetch, cancel, onTrimMemory)
                         ScorePageView*.kt       (Fabric view: draws bitmaps, half-page composite, filters via ColorMatrix)
  keys/                  KeyEventsModule.kt      (debounce, repeat filter, device name, learn mode)
  saf/                   SafImportModule.kt      (pickers, tree walk, stream copy, hash, virtual files, thumbnails)
  system/                KeepAwake, Haptics, RotationLock, CrashCapture
src/
  specs/                 codegen specs (NativeScoreRenderer, ScorePageViewNativeComponent, NativeKeyEvents, NativeSafImport, …)
  app/                   navigation, providers, adaptive layout (rail vs bottom bar)
  ui/                    design system: tokens, theme, typography, Icon, Button, Chip, Sheet, Snackbar, Dialog, EmptyState, …
  domain/                pure TS: page maps, half-page rects, setlist navigation, pedal mapping, title parsing, search normalisation
  data/                  op-sqlite db, migrations, repositories, FTS indexing, reactive hooks
  features/
    library/  reader/  ink/  import/  setlists/  collections/  settings/  backup/  billing/  onboarding/
  i18n/                  en, de, es, fr, it, ja resource files
  assets/                fonts, sample scores, illustrations
```

Data flow: SQLite → reactive query hooks → components. Zustand only for transient UI state (selection, overlay visibility, active tool). MMKV for preferences.

---

## 4. The 8 phases

Estimates assume one developer working full time with Claude Code. Each phase ends with a **review gate**: a build you run on your phone/emulator plus a short checklist. We don't start the next phase until the gate passes.

| # | Phase | Est. | Gate |
|---|---|---|---|
| 1 | Foundation & design system | 1.5 wk | Showcase screen approved |
| 2 | Rendering engine | 1.5–2 wk | Benchmarks pass |
| 3 | Reader & pedals | 1.5 wk | Reader feels instant; all modes correct |
| 4 | Import & library | 1.5 wk | 200-file import, 5,000-score scroll/search pass |
| 5 | Annotation | 1.5–2 wk | Ink tight on real S Pen |
| 6 | Setlists, collections & backup | 1 wk | Setlist gig flow + backup round-trip pass |
| 7 | Monetization, onboarding, i18n & accessibility | 1.5 wk | Paywall/restore work; 6 languages; a11y audit pass |
| 8 | Hardening, hardware QA & launch | 1.5 wk | Release candidate on Play production |
| | **Total** | **~11–12 weeks** | |

---

### Phase 1: Foundation & design system (~1.5 weeks)

**Goal:** A clean, fast project skeleton and a complete design system, so every later screen is assembled from polished parts.

**Project setup**
- Init bare RN (Community CLI), New Architecture, Hermes, TS strict, ESLint + Prettier, path aliases.
- Git init with a repo-local identity; connect the remote; `.gitignore`; conventional commits.
- GitHub Actions: typecheck, lint, Jest, `assembleRelease`, 16 KB alignment check (`zipalign -c -P 16`).
- Codegen scaffolds for `ScoreRenderer`, `ScorePageView`, `KeyEvents`, `SafImport` (empty implementations).
- op-sqlite with a migration runner + schema v1 (spec §6, adjusted for this plan); MMKV; Zustand.
- i18next with 6 locale files (EN strings only for now); a lint rule that bans hard-coded UI strings; Android per-app language config.
- React Navigation with an adaptive shell: nav rail at ≥ 600 dp width, bottom bar below; edge-to-edge; predictive back enabled.
- Tablet emulator profiles: 11" 16:10, 12.4" 16:10, 14.6", 3:2 (NXTPAPER-like), a foldable, and a phone.

**Design system**
- Tokens (colour, type, spacing, radius, elevation, motion) as TS + light/dark themes; contrast-check script in CI.
- Bundle Inter + the chosen serif (subset and verify JA fallback: Noto Sans JP for Japanese UI text).
- Icon pipeline: Phosphor SVG → optimised RN components; custom icon template on the same grid; Bravura font bundled (subset later).
- Components: Button (primary/secondary/ghost/danger), IconButton, Chip/FilterChip, TextField, SearchBar, Card (score), ListRow, Sheet (bottom/side), Dialog, Snackbar (with Undo), Toast pill, ProgressPill, EmptyState, Banner, Switch, Slider, SegmentedControl, Menu, Skeleton loaders, Badge.
- Every component: pressed/focused/disabled states, ripple tuned to the palette, 48 dp targets, TalkBack labels, 200% font scale, reduce-motion.
- Haptics helper with named patterns (tick, confirm, boundary) + global toggle.
- **App icon v1** (adaptive + monochrome) and the splash.

**Deliverable for review:** a hidden in-app **Design Showcase** screen with all tokens and components in light/dark, phone/tablet, 100%/200% font.

**Exit criteria**
- CI green; release APK builds; app cold-starts to an empty shell in under 800 ms on your phone.
- All tokens pass contrast checks. You approve the showcase + app icon.

---

### Phase 2: Rendering engine (~1.5–2 weeks) ⚠️ critical

**Goal:** A page appears as fast as a printed page turns. If this phase fails, we fix it before anything else.

- `ScoreRendererModule`: `open(path) → {docId, pageCount, pageSizes}`, `renderPage(docId, page, cropRect, w, h, quality)`, `prefetch`, `cancel`, `close`.
- One render thread per document (PdfRenderer isn't thread-safe); a request queue with priority (visible > next > prev > thumbnails) and cancellation.
- LRU bitmap cache (current ±2 at display resolution, capped by memory class; RGB_565 where safe); a low-res preview shown instantly, then swapped for the sharp render without flicker.
- Disk WebP cache for thumbnails/covers (top-staff crop for library covers).
- `onTrimMemory` handling; safe close (cancel → join render thread → close PdfRenderer/ParcelFileDescriptor) to prevent the fast-close SIGSEGV class.
- `ScorePageView` Fabric view: draws bitmaps, supports a half-page composite (two crop rects) and colour filters via `ColorMatrix` (Paper, Sepia, Night, High-contrast) at no extra render cost.
- Malformed-PDF strategy: try PdfRenderer → on failure evaluate a PDFium fallback (decide on APK size vs coverage using a corpus of ~200 real musician PDFs) → friendly error with "Send file to developer".
- Benchmark harness (instrumentation): 300-page 100 MB scan, 50-page vector PDF, 1-page huge poster, corrupted file.

**Exit criteria**
- p95 turn latency under 50 ms for cached pages (emulator + your phone; re-verified on a real tablet in Phase 8).
- Open to first page in under 1 s for the 300-page scan.
- No OOM after 500 rapid turns; no crash after 100 rapid open/close cycles.
- A benchmark report committed to `docs/benchmarks/`.

---

### Phase 3: Reader & pedals (~1.5 weeks)

**Goal:** The best reading experience on Android.

- Reader screen: single, two-up, half-page (draggable split, soft divider, page tags), landscape-phone fit-width + pan.
- Default mode by orientation; per-score memory of mode, split, filter and last page.
- Tap zones (30/40/30) with a first-3-opens hint; swipe with finger-following physics; optional 120 ms slide.
- Pinch zoom + pan with double-tap to fit; turns disabled while zoomed except via pedal/edges.
- Overlay: top bar (back, title, mode, filter, rotation lock, performance, annotate placeholder, more) + bottom thumbnail scrubber with page detents + haptic ticks; 3 s auto-hide.
- Resume pill; end-of-score card; boundary haptics.
- Performance mode: immersive, keep-awake, 1 s long-press ring exit, dark stage chrome.
- Shared-element transition from library cover → reader; predictive back returns to the same card.
- **Pedals:** `dispatchKeyEvent` in MainActivity → KeyEvents module; default map (spec §4.4); debounce (default 200 ms, configurable) + repeat filter; consumption only while the reader is active; device-connect detection → "Pedal detected" test sheet; Settings → Pedals learn screen (capture key → assign action, show device name); soft-keyboard explainer.
- Volume-key turning (opt-in).

**Exit criteria**
- All modes correct on 16:10, 3:2 and phone emulators, portrait and landscape.
- Simulated pedal (adb keyevents) 500 presses → zero double turns.
- Every overlay control has a TalkBack label; reduce-motion respected.

---

### Phase 4: Import & library (~1.5 weeks)

**Goal:** Bringing a whole binder in is painless, and finding any score takes 2 seconds.

- SAF module: multi-file picker (`application/pdf` + `*/*` with extension check), folder tree import (recursive), share sheet / "Open with" (`ACTION_SEND`, `SEND_MULTIPLE`, `VIEW`), virtual-file handling, stream copy into app storage, hashing + dedupe with "Import anyway".
- Title/composer parsing (underscores, numbers, "Title - Composer" patterns) with unit tests across a messy filename corpus.
- Background import queue with a progress pill; never an ANR; cancellable. Review card with inline edit.
- Folder → collections option.
- Library: FlashList cover grid + list view (sortable columns on tablet), sort (title, composer, recent, added), filter chips (composer, genre, key, tag, collection, favourite), multi-select (long-press) with a batch action bar (edit metadata, add to setlist/collection, favourite, delete).
- Score detail/edit sheet: title, composer, arranger, genre, key, tempo, time signature, tags, collections, notes.
- FTS5 search with accent folding + prefix; grouped results; highlighting; recent searches.
- Delete: single → undo snackbar; bulk → confirm; Trash screen with restore / delete forever; 30-day purge job.
- Empty states + illustrations (library, search no-results, trash, collection).
- Free-limit counter in place (enforced in Phase 7).

**Exit criteria**
- 200 PDFs (~2 GB) folder import completes with progress, no ANR.
- A seeded 5,000-score library scrolls at 60 fps on your phone; search p95 under 50 ms.
- Share-sheet import from Drive (a cloud-only file) works.

---

### Phase 5: Annotation (~1.5–2 weeks)

**Goal:** Marking a score feels like pencil on paper.

- Skia ink layer over `ScorePageView`, aligned in normalized source-page coordinates (survives zoom, mode changes and future crop).
- Input: stylus draws anytime (palm rejection by `pointerType`); fingers draw only in annotate mode; two-finger pan/zoom in annotate mode.
- Smoothing + a perfect-freehand-style outline (constant width in v1; pressure path prepared for Pro in P1).
- Tools: 4 presets (editable colour/width), stroke eraser, pen side button = eraser where reported, undo/redo per session, "Clear page" with undo.
- Floating, draggable toolbar (remembers position; docks on phone); an active-tool indicator using the accent + Fill icon.
- Persistence: strokes in SQLite (packed Float32 blobs), batched writes, lazy load per page, rendering cached as a bitmap layer when idle for performance with 2,000+ strokes.
- Ink rendered in the thumbnail scrubber and a library "annotated" badge.
- **Latency fallback:** if Skia latency is unacceptable on a real S Pen, switch the drawing surface to a native front-buffered ink view, keeping the same storage format.

**Exit criteria**
- 2,000 strokes on one page stay smooth; ink stays aligned across all page modes and rotations.
- **Hardware needed before this phase ends:** Galaxy Tab (S Pen) for a subjective + frame-timing latency test.

---

### Phase 6: Setlists, collections & backup (~1 week)

**Goal:** Gig-ready flow and a library the user never fears losing.

- Setlists: create, rename, duplicate, delete (undo), drag-reorder (haptic), add from search, per-entry start page + notes, event date.
- Setlist performance mode: pedal past the last page → next song instantly (next song pre-rendered), "Next: …" pill, jump list sheet, previous-song mapping.
- Collections: create/rename/delete, add/remove scores, a collection view with the same grid.
- Backup: one-file `.zip` (DB dump + PDFs + ink + settings) via SAF "Create document", with progress; restore with a preview (counts, date) and Merge / Replace; integrity check (hashes).
- "Last backup" status + the one-time library banner at 25+ scores.
- Explain in-app that Android Auto Backup doesn't include PDFs.

**Exit criteria**
- 1,000-score, ~3 GB backup → restore round-trip is hash-identical.
- A full gig simulation: 15-song setlist via simulated pedal, zero wrong turns.

---

### Phase 7: Monetization, onboarding, i18n & accessibility (~1.5 weeks)

**Goal:** A complete, sellable product that works in 6 languages and for every user.

- Billing: `pro_lifetime` non-consumable via react-native-iap; acknowledge; entitlement cached in MMKV + re-verified on launch; Restore purchase; pending/cancelled/error states.
- Paywall screen (honest, single screen) triggered on the 16th import and on Pro-gated actions (a 2nd setlist, and later the P1 Pro tools). Existing scores always stay readable.
- Onboarding: the 4 bundled samples (sourced/engraved public-domain PDFs, compressed, licence notes in-app), a 3-step skippable intro, and first-open reader hints.
- Settings: Reading, Pedals, Stylus & ink, Display (theme, filters), Backup, Language, Pro, Help & feedback, Privacy policy, Licences (OSS + fonts + Bravura OFL).
- Crash capture: persist the crash on the device → next launch "Something went wrong last time. Send a report?" → email/share with a readable log.
- **Translations:** DE, ES, FR, IT, JA for all strings + plurals, using musician terminology; layout check with German (+30%) and Japanese line breaking.
- Accessibility audit: TalkBack pass on every screen, focus order, 200% font, colour contrast, reduce-motion, keyboard/D-pad navigation outside the reader.

**Exit criteria**
- Purchase → uninstall → reinstall → restore works (Play test track, license testers).
- Every screen reviewed in all 6 languages with no truncation.
- Zero blocking accessibility issues.

---

### Phase 8: Hardening, hardware QA & launch (~1.5 weeks)

**Goal:** Rock-solid at the first public review.

- **Hardware matrix:** Galaxy Tab S-series + S Pen, one budget tablet, your phone, 2 pedals (arrow mode + PgUp/PgDn mode). Re-run Phase 2/3/5 benchmarks on real devices.
- Performance pass: cold start, memory ceiling, jank (Perfetto / systrace), APK/AAB size, R8 + resource shrinking, Hermes bytecode, baseline profile.
- Stability pass: fuzz with the 200-PDF corpus, rapid-action monkey test, low-storage, low-memory, airplane mode, process death/restore on every screen.
- Maestro E2E suite green: import → search → read → half-page → pedal → annotate → setlist → backup/restore → purchase/restore.
- Final brand name + applicationId → set in the Gradle property and the config; final app icon polish.
- Store assets: feature graphic, tablet + phone screenshots (two-up, half-page, pedal learn, ink, setlist, library, "No account · Offline · Buy once"), 30 s pedal video, listing copy in 6 languages, Data Safety = no data collected, privacy policy page.
- Release: signed AAB via Gradle + Fastlane `supply`, internal track → (optional) small open test → production with staged rollout (20% → 100%).
- Launch plan: AirTurn compatible-apps submission, community posts, a review-reply routine.

**Exit criteria**
- Crash-free across the hardware matrix; all acceptance criteria from the spec (as scoped here) met.
- Production release live.

---

## 5. Definition of done (every feature)

- [ ] Works on phone + tablet, portrait + landscape, light + dark
- [ ] Empty, loading, error and long-content states designed
- [ ] 200% font scale and German-length strings don't break the layout
- [ ] TalkBack labels, logical focus order, 48 dp targets
- [ ] Reduce-motion respected; haptics follow the rules
- [ ] Destructive actions reversible (undo or trash)
- [ ] No hard-coded strings; all 6 locales present
- [ ] Unit tests for logic; no new jank (60 fps) or memory regression
- [ ] Zero network calls (except Play Billing)

---

## 6. Risks & mitigations

| Risk | Mitigation |
|---|---|
| RN can't hit the reader latency | Native renderer + native page view from day one; benchmarks gate Phase 2 |
| Skia ink latency not good enough with S Pen | Same storage format; swap to a native front-buffered ink view |
| No tablet/stylus/pedal until late | Emulators for layout; **buy the tablet + pedal before Phase 5 ends**; the real hardware matrix in Phase 8 |
| Unreviewed translations cause awkward store copy | Careful musician terminology; consider a native check of the DE/JA store listings before launch |
| D-U-N-S / org verification delays release | Start now, in parallel with Phase 1 |
| Scope creep toward MobileSheets breadth | P1 list is fixed; new ideas go to the backlog, not into v1 |
| Brand/applicationId unresolved at release | Single-source config; a decision is due at the start of Phase 8 |

---

## 7. After launch (P1 roadmap, in order)

1. Links / jumps (repeats, D.S., coda)
2. Crop (auto whitespace + manual)
3. Stamps (Bravura dynamics, fingerings, bowings, accidentals) + layers + lasso
4. Page manager (reorder, delete, duplicate, rotate, insert blank)
5. Native metronome (tempo from metadata, tap tempo, accents)
6. Pressure-sensitive ink, flattened PDF export/share
7. Pitch pipe / tuner, camera scan, auto-backup to folder, sticky notes, vertical scroll mode
