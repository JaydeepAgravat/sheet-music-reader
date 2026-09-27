# Bundled sample scores — sources and licences

The four first-run samples are engraved from the files in this folder by `npm run samples`
(`scripts/gen-samples.mjs`). Nothing was downloaded: every note was written here, from memory of
public-domain works or as original material.

| PDF (android/app/src/main/assets/samples) | Source | Pages | Work | Licence of the PDF |
|---|---|---|---|---|
| `bach-prelude-in-c.pdf` | `bach-prelude-c.mjs` | 3 | J. S. Bach, Prelude in C major, BWV 846 (WTC I, 1722) | Work public domain; engraving CC0 |
| `quiet-pages-lead-sheet.pdf` | `quiet-pages.krn` | 1 | *Quiet Pages*, original 32-bar AABA lead sheet written for the app | CC0 |
| `old-hundredth-hymn.pdf` | `old-hundredth.krn` | 1 | *Old Hundredth* (Genevan Psalter 1551, attr. Louis Bourgeois), words William Kethe 1561, SATB harmonisation by us | Melody + words public domain; rhythm/harmonisation CC0 |
| `scales-and-arpeggios.pdf` | `scales.mjs` | 25 | *Scales & Arpeggios — all 24 keys*, original study book (the 20+ page "long score") | CC0 |

The app shows a licence line for each sample in its score details (`onboarding.licence.*`), and each
PDF prints its own licence note in the page-1 footer.

## Pipeline

1. **Source** — Humdrum `**kern`, hand-written (`.krn`) or generated from a small, readable table
   (`.mjs`: the prelude's bar-by-bar harmony; the scales from key signatures, so spelling is
   mechanical).
2. **Engraving** — [verovio](https://www.verovio.org) 6 (WASM, npm devDependency, build time only;
   LGPL-3.0 — the tool isn't shipped, and its output isn't covered by its licence). Verovio lays out
   one tall page with the Bravura font; glyphs come out as SVG `<path>`s.
3. **Pagination** — the script cuts the SVG into systems (union of the bounding boxes verovio emits)
   and flows them onto A4 pages itself: a title block on page 1, a running header after that, page
   numbers, 18 mm side margins, balanced pages (no lone system at the end).
4. **PDF** — `pdfkit` + `svg-to-pdfkit` (MIT). Music is pure vector paths, so no music font is
   needed in the PDF. Lyrics and chord symbols use the PDF base-14 Times (not embedded); the flat in
   chord symbols uses Bravura; titles and credits use the app's Source Serif 4 and Inter (subset
   embedded). All fonts are OFL (see `assets/licenses`).
5. **Output** — PDFs + `samples.json` into the APK assets, and the same manifest at
   `src/features/onboarding/sampleManifest.json` for the app. Output is deterministic (fixed dates
   and document IDs), so the SHA-256 in the manifest only changes when the music or layout does.

Staff size is set per sample (`staffMm`, the distance between staff lines: 1.8–2.0 mm, i.e. a
7.2–8 mm staff).

## Please double-check (musician review)

**Bach — Prelude in C major** (highest priority: it's a real work, people know it by heart)
- Bars 1–32 follow the familiar five-note pattern; the table in `bach-prelude-c.mjs` lists each
  bar's pitches. Worth a read-through against an urtext, especially the octaves in bars 10–18 and
  the chromatic bars 12, 14, 20–23 and 28.
- Bar count is the 35-bar urtext (no "Schwencke bar" between bars 22 and 23).
- **Bars 33–35 (the ending) are the ones I'm least sure of**: bar 33 run
  `F3 A3 C4 F4 C4 A3 C4 A3 F3 A3 F3 D3 F3 D3` over C2/C3, bar 34 run
  `G4 B4 D5 F5 D5 B4 D5 B4 G4 B4 D4 F4 E4 D4` over C2/B2, bar 35 C-major chord with fermatas.
- Editorial choices: lower staff in treble clef for bars 1–9, bass clef from bar 10; right hand
  stays in treble throughout (bar 33 has several ledger lines). No dynamics or fingering, as in
  the urtext.

**Old Hundredth**
- Melody (G major): `G G F♯ E D G A B | B B B A G C B A | G A B A G E F♯ G | D B G A C B A G`.
- Rhythm is our edition: 3/2, long first and last note of each line (not the Genevan original's
  rhythm). Harmonisation is ours; a script checked it for parallel 5ths/8ves, crossings, spacing
  and ranges, but please sing/play through it.
- Words: Kethe stanzas 1–2 under the music, 3–4 printed below. Line 3 of stanza 1 is Kethe's
  "Him serve with fear"; some hymnals print "Him serve with mirth" (Scottish Psalter). Spelling
  modernised.

**Quiet Pages** (original) — melody and changes are ours; check that the tune and voicing of the
changes read naturally (Bb m6 in bar 18, the Cm7–F7 turnaround into the bridge in bar 16).

**Scales & Arpeggios** (original, generated)
- Key choices: F-sharp major (not G-flat), E-flat minor (not D-sharp), G-sharp minor (raised 7th
  printed as F double-sharp), D-flat major (not C-sharp).
- Hands two octaves apart (so both hands read comfortably on their own staff); contrary motion
  starts both hands on the same note. Left hand goes low (down to G1) in G, A and B keys.
- Melodic minor: raised 6th and 7th ascending, natural minor descending. No fingering printed.

If anything changes, edit the source here and run `npm run samples`. The app seeds samples once per
install, so existing installs keep the version they got.
