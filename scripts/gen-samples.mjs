#!/usr/bin/env node
/**
 * Engraves the four bundled sample scores (npm run samples).
 *
 *   design/samples/*.krn | *.mjs  ──verovio (WASM)──▶  SVG systems  ──pdfkit + svg-to-pdfkit──▶  A4 PDF
 *
 * - Sources are Humdrum **kern, written by hand (.krn) or generated from a small table (.mjs).
 *   Provenance and licences: design/samples/SOURCES.md.
 * - Verovio lays out one tall page; we cut it into systems (union of the per-element bounding boxes
 *   verovio emits with svgBoundingBoxes) and paginate ourselves, so page 1 can carry a title block
 *   and later pages a running header, with page numbers in the footer.
 * - Music glyphs come out as Bravura <path>s (vector, no font needed). Lyrics and chord-symbol text
 *   use the PDF base-14 Times (the metrics verovio lays out with; no embedding); SMuFL glyphs inside
 *   text (the ♭ in "B♭maj7") use the bundled Bravura.otf; our own headings use the app's bundled
 *   Source Serif 4 / Inter (subset-embedded). All fonts are OFL.
 * - Output is deterministic (fixed dates and document ID) so the sample hashes stay stable.
 *
 * Output: android/app/src/main/assets/samples/*.pdf + samples.json, and the same manifest at
 * src/features/onboarding/sampleManifest.json, which the app imports to seed the library.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import crypto from 'node:crypto';
import createVerovioModule from 'verovio/wasm-hum';
import { VerovioToolkit } from 'verovio/esm';
import PDFDocument from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'design/samples');
const OUT = path.join(ROOT, 'android/app/src/main/assets/samples');
const FONTS = path.join(ROOT, 'android/app/src/main/assets/fonts');
const APP_MANIFEST = path.join(ROOT, 'src/features/onboarding/sampleManifest.json');

/** The app's (placeholder) name, printed in credits and footers. Rerun `npm run samples` if it changes. */
const APP_NAME = 'Score Reader';

// --- Page geometry (PDF points; verovio units are 0.1 mm at scale 100) -------------------------------
const MM = 72 / 25.4;
const PAGE_W = 210 * MM;
const PAGE_H = 297 * MM;
const MARGIN_X_MM = 18;
const TOP_FIRST = 52 * MM; // below the title block
const TOP_REST = 22 * MM; // below the running header
const BOTTOM = 22 * MM;
const INK = '#1C1B19';
const MUTED = '#5F5B54';

// --- Samples ------------------------------------------------------------------------------------------
/**
 * `licence` is what the app shows in the score's details: 'pd' (public domain work, our engraving
 * CC0), 'pd-arr' (public-domain work, our arrangement/harmonisation CC0), 'cc0' (original, CC0).
 */
const SAMPLES = [
  {
    file: 'bach-prelude-in-c.pdf',
    source: 'bach-prelude-c.mjs',
    title: 'Prelude in C major',
    subtitle: 'The Well-Tempered Clavier, Book I · BWV 846',
    left: '',
    right: 'Johann Sebastian Bach (1685–1750)',
    composer: 'J. S. Bach',
    genre: 'Classical',
    key: 'C major',
    tags: ['Piano', 'Baroque'],
    licence: 'pd',
    footnote: `Public domain. Engraved for ${APP_NAME}; this edition is dedicated to the public domain (CC0).`,
    staffMm: 1.8,
  },
  {
    file: 'quiet-pages-lead-sheet.pdf',
    source: 'quiet-pages.krn',
    title: 'Quiet Pages',
    subtitle: 'Lead sheet · medium swing · AABA, 32 bars',
    left: '',
    right: APP_NAME,
    composer: APP_NAME,
    genre: 'Jazz',
    key: 'F major',
    tags: ['Lead sheet'],
    licence: 'cc0',
    footnote: `An original tune written for ${APP_NAME}. Dedicated to the public domain (CC0) — copy, play and arrange freely.`,
    staffMm: 2.0,
    breaks: 'encoded',
  },
  {
    file: 'old-hundredth-hymn.pdf',
    source: 'old-hundredth.krn',
    title: 'Old Hundredth',
    subtitle: 'All people that on earth do dwell · L.M.',
    left: 'Words: William Kethe, 1561',
    right: `Genevan Psalter, 1551 (attr. Louis Bourgeois)\nHarmonisation: ${APP_NAME}`,
    composer: 'Louis Bourgeois',
    genre: 'Choral',
    key: 'G major',
    tags: ['Hymn', 'SATB'],
    licence: 'pd-arr',
    footnote: `Melody and words public domain. Rhythm and harmonisation: ${APP_NAME} edition, dedicated to the public domain (CC0).`,
    staffMm: 1.9,
    afterText: [
      '3  O enter then his gates with praise,\n    Approach with joy his courts unto;\n    Praise, laud, and bless his name always,\n    For it is seemly so to do.',
      '4  For why? the Lord our God is good,\n    His mercy is for ever sure;\n    His truth at all times firmly stood,\n    And shall from age to age endure.',
    ],
  },
  {
    file: 'scales-and-arpeggios.pdf',
    source: 'scales.mjs',
    kind: 'book',
    title: 'Scales & Arpeggios',
    subtitle: 'All 24 keys · two octaves, hands together',
    left: '',
    right: APP_NAME,
    composer: APP_NAME,
    genre: 'Studies',
    key: '',
    tags: ['Piano', 'Technique'],
    licence: 'cc0',
    footnote: `Written for ${APP_NAME}. Dedicated to the public domain (CC0).`,
    staffMm: 1.8,
  },
];

// --- Verovio ------------------------------------------------------------------------------------------
const tk = new VerovioToolkit(await createVerovioModule());

/**
 * Verovio's `scale` only scales its output, not the layout, so the printed staff size is set by the
 * layout width instead: a narrower layout mapped onto the same 210 mm page means a larger staff.
 * `staffMm` is the staff space (distance between two staff lines); verovio's default is 1.8 mm.
 */
function baseOptions(sample) {
  const k = 1.8 / sample.staffMm;
  return {
    pageWidth: Math.round(2100 * k),
    pageHeight: 60000,
    adjustPageHeight: true,
    pageMarginLeft: Math.round(MARGIN_X_MM * 10 * k),
    pageMarginRight: Math.round(MARGIN_X_MM * 10 * k),
    pageMarginTop: 0,
    pageMarginBottom: 0,
    scale: 100,
    header: 'none',
    footer: 'none',
    font: 'Bravura',
    breaks: sample.breaks ?? 'auto',
    svgViewBox: true,
    svgRemoveXlink: true,
    svgBoundingBoxes: true,
    spacingSystem: 10,
    spacingStaff: 10,
    lyricSize: 4,
    lyricTopMinMargin: 3,
    mnumInterval: 0,
    minLastJustification: 0.5,
  };
}

/** Index of the matching </g> for the <g …> starting at `start`. */
function groupEnd(svg, start) {
  const re = /<g\b[^>]*?(\/?)>|<\/g>/g;
  re.lastIndex = start;
  let depth = 0;
  for (let m = re.exec(svg); m; m = re.exec(svg)) {
    if (m[0] === '</g>') depth--;
    else if (m[1] !== '/') depth++;
    if (depth === 0) return re.lastIndex;
  }
  throw new Error('Unbalanced <g>');
}

/**
 * Renders kern to one tall SVG and returns its systems as standalone SVG strings with their height
 * in verovio page units (0.1 mm).
 */
function renderSystems(kern, sample) {
  tk.setOptions(baseOptions(sample));
  if (!tk.loadData(kern)) throw new Error(`verovio could not load ${sample.source}\n${tk.getLog()}`);
  if (tk.getPageCount() !== 1) throw new Error(`${sample.source}: expected one tall page`);
  const svg = tk.renderToSVG(1);
  const outer = /<svg viewBox="0 0 (\d+) (\d+)"/.exec(svg);
  const inner = /<svg class="definition-scale"[^>]*viewBox="0 0 (\d+) (\d+)"/.exec(svg);
  const margin = /<g class="page-margin" transform="translate\((-?\d+), (-?\d+)\)">/.exec(svg);
  if (!outer || !inner || !margin) throw new Error('Unexpected verovio SVG structure');
  const f = Number(inner[1]) / Number(outer[1]); // inner units per page unit
  const defs = svg.slice(svg.indexOf('<defs>'), svg.indexOf('</defs>') + 7);
  const innerOpen = /<svg class="definition-scale"[^>]*>/.exec(svg)[0].replace(/viewBox="[^"]*"/, '');
  const mx = Number(margin[1]);

  const systems = [];
  const sysRe = /<g id="[^"]+" class="system">/g;
  for (let m = sysRe.exec(svg); m; m = sysRe.exec(svg)) {
    const end = groupEnd(svg, m.index);
    let body = svg.slice(m.index, end);
    let top = Infinity;
    let bottom = -Infinity;
    for (const r of body.matchAll(/<rect x="-?\d+" y="(-?\d+)" height="(\d+)"/g)) {
      top = Math.min(top, Number(r[1]));
      bottom = Math.max(bottom, Number(r[1]) + Number(r[2]));
    }
    body = body.replace(/<g id="bbox-[^"]*" class="[^"]*bounding-box"\s*(?:\/>|>\s*<rect[^>]*\/>\s*<\/g>)/g, '');
    const pad = 40 * f; // 4 mm around each system so nothing touches the cut
    top -= pad;
    bottom += pad;
    const hInner = bottom - top;
    const h = hInner / f;
    const system = [
      `<svg viewBox="0 0 ${outer[1]} ${h.toFixed(1)}" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">`,
      defs,
      innerOpen.replace('<svg ', `<svg viewBox="0 0 ${inner[1]} ${hInner.toFixed(0)}" `),
      `<g transform="translate(${mx}, ${(-top).toFixed(0)})">`,
      body,
      '</g></svg></svg>',
    ].join('');
    // Rows are drawn full page width, so their height in points follows from the aspect ratio.
    systems.push({ svg: prepareSvg(system), height: (h / Number(outer[1])) * PAGE_W });
    sysRe.lastIndex = end;
  }
  return systems;
}

/** Verovio styles strokes via CSS (currentColor); svg-to-pdfkit wants explicit attributes. */
function prepareSvg(svg) {
  return svg.replace(/<style[\s\S]*?<\/style>/, '').replace(/stroke-width="/g, `stroke="${INK}" stroke-width="`).replace(/color="black"/g, `color="${INK}" fill="${INK}"`);
}

// --- PDF ----------------------------------------------------------------------------------------------
const FIXED_DATE = new Date(Date.UTC(2026, 0, 1));

function newDoc(sample) {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 0,
    compress: true,
    autoFirstPage: false,
    info: {
      Title: sample.title,
      Author: sample.composer,
      Subject: sample.subtitle,
      Keywords: [sample.genre, ...sample.tags].join(', '),
      Creator: `${APP_NAME} sample engraver (verovio + pdfkit)`,
      Producer: APP_NAME,
      CreationDate: FIXED_DATE,
      ModDate: FIXED_DATE,
    },
  });
  // Deterministic document ID (pdfkit otherwise hashes the current time).
  const id = crypto.createHash('md5').update(sample.file).digest();
  doc._id = id;
  doc.registerFont('display', path.join(FONTS, 'SourceSerif4Display-Regular.ttf'));
  doc.registerFont('serif', path.join(FONTS, 'SourceSerif4SmText-Regular.ttf'));
  doc.registerFont('serif-semibold', path.join(FONTS, 'SourceSerif4SmText-Semibold.ttf'));
  doc.registerFont('ui', path.join(FONTS, 'Inter-Regular.ttf'));
  doc.registerFont('bravura', path.join(FONTS, 'Bravura.otf'));
  return doc;
}

const fontCallback = family => (/bravura|leipzig/i.test(family) ? 'bravura' : 'Times-Roman');



function titleBlock(doc, sample) {
  const x = MARGIN_X_MM * MM;
  const w = PAGE_W - 2 * x;
  doc.fillColor(INK).font('display').fontSize(26).text(sample.title, x, 20 * MM, { width: w, align: 'center' });
  doc.fillColor(MUTED).font('serif').fontSize(11).text(sample.subtitle, x, doc.y + 2, { width: w, align: 'center' });
  const y = 38 * MM;
  doc.font('serif').fontSize(9.5).fillColor(INK);
  if (sample.left) doc.text(sample.left, x, y, { width: w / 2, align: 'left', lineGap: 1 });
  if (sample.right) doc.text(sample.right, x + w / 2, y, { width: w / 2, align: 'right', lineGap: 1 });
}

function runningHeader(doc, sample, extra) {
  const x = MARGIN_X_MM * MM;
  const w = PAGE_W - 2 * x;
  doc.font('ui').fontSize(8).fillColor(MUTED).text(sample.title, x, 11 * MM, { width: w / 2, align: 'left' });
  if (extra) doc.text(extra, x + w / 2, 11 * MM, { width: w / 2, align: 'right' });
  doc.moveTo(x, 15 * MM).lineTo(x + w, 15 * MM).lineWidth(0.4).strokeColor('#E6E0D6').stroke();
}

function footer(doc, sample, pageNo) {
  const x = MARGIN_X_MM * MM;
  const w = PAGE_W - 2 * x;
  if (pageNo === 1) {
    doc.font('ui').fontSize(7.5).fillColor(MUTED).text(sample.footnote, x, PAGE_H - 13 * MM, { width: w, align: 'center' });
  } else {
    doc.font('ui').fontSize(9).fillColor(MUTED).text(String(pageNo), x, PAGE_H - 13 * MM, { width: w, align: 'center' });
  }
}

/**
 * Flows rows (systems, labels, text) onto pages. Systems on a full page get their leftover space
 * shared out (capped), like a hand-set page; the last page stays top-aligned.
 */
/** Greedy pagination; `maxRows` caps rows per page (used to balance pages). */
function paginate(rows, maxRows = Infinity) {
  const pages = [];
  let page = null;
  let heading; // running-header extra (the current key in the scales book)
  const startPage = () => {
    page = { rows: [], top: pages.length === 0 ? TOP_FIRST : TOP_REST, used: 0, extra: heading };
    pages.push(page);
  };
  startPage();
  for (const row of rows) {
    if (row.type === 'break') {
      if (page.rows.length) startPage();
      continue;
    }
    const avail = PAGE_H - BOTTOM - page.top;
    // A label stays with the system that follows it.
    const need = row.height + (row.keepWithNext ?? 0);
    if ((page.used + need > avail || page.rows.length >= maxRows) && page.rows.length) startPage();
    if (row.extra) {
      heading = row.extra;
      if (!page.rows.length) page.extra = heading;
    }
    page.rows.push(row);
    page.used += row.height;
  }
  return pages;
}

function flow(doc, sample, rows, { justify = true } = {}) {
  let pages = paginate(rows);
  if (justify && pages.length > 1) {
    // Balance a multi-page piece (no lone system on the last page) if it doesn't cost a page.
    const balanced = paginate(rows, Math.ceil(rows.length / pages.length));
    if (balanced.length === pages.length) pages = balanced;
  }

  pages.forEach((p, i) => {
    doc.addPage({ size: 'A4', margin: 0 });
    const pageNo = i + 1;
    if (pageNo === 1) titleBlock(doc, sample);
    else runningHeader(doc, sample, p.extra);
    footer(doc, sample, pageNo);
    const avail = PAGE_H - BOTTOM - p.top;
    const isLast = i === pages.length - 1;
    const gaps = p.rows.length - 1;
    const spare = avail - p.used;
    const add = justify && !isLast && gaps > 0 ? Math.min(spare / gaps, 12 * MM) : 0;
    let y = p.top;
    for (const row of p.rows) {
      row.draw(doc, y);
      y += row.height + add;
    }
  });
  return pages.length;
}

const systemRow = sys => ({
  height: sys.height,
  draw: (doc, y) => SVGtoPDF(doc, sys.svg, 0, y, { width: PAGE_W, height: sys.height, fontCallback }),
});

function textRow(text, { font = 'serif', size = 10.5, color = INK, before = 0, after = 0, align = 'left', indent = 0, extra, keepWithNext } = {}) {
  const x = MARGIN_X_MM * MM + indent;
  const w = PAGE_W - 2 * MARGIN_X_MM * MM - indent;
  return {
    extra,
    keepWithNext,
    measure(doc) {
      doc.font(font).fontSize(size);
      this.height = before + doc.heightOfString(text, { width: w, align, lineGap: 2 }) + after;
      return this;
    },
    draw(doc, y) {
      doc.font(font).fontSize(size).fillColor(color).text(text, x, y + before, { width: w, align, lineGap: 2 });
    },
  };
}

async function loadKern(source) {
  const p = path.join(SRC, source);
  if (source.endsWith('.krn')) return fs.readFileSync(p, 'utf8');
  const mod = await import(pathToFileURL(p).href);
  return mod.default();
}

async function buildPiece(sample) {
  const doc = newDoc(sample);
  const kern = await loadKern(sample.source);
  const rows = renderSystems(kern, sample).map(systemRow);
  if (sample.afterText) {
    const verses = sample.afterText.map((t, i) => textRow(t, { before: i === 0 ? 8 * MM : 4 * MM, indent: 30 * MM }).measure(doc));
    rows.push(...verses);
  }
  const count = flow(doc, sample, rows);
  return { doc, pages: count };
}

async function buildBook(sample) {
  const doc = newDoc(sample);
  const mod = await import(pathToFileURL(path.join(SRC, sample.source)).href);
  const book = mod.default();
  const rows = [];
  // Page 1: contents (the book's own table of contents doubles as a navigation test).
  rows.push(
    textRow(
      'One key per page, in circle-of-fifths order, each major key followed by its relative minor. ' +
        'Major keys: scale in similar and contrary motion, and the tonic arpeggio. Minor keys: harmonic and melodic minor, and the tonic arpeggio. ' +
        'Hands play two octaves apart; no fingering is printed, so use the fingering your teacher prefers.',
      { size: 10.5, after: 8 * MM },
    ).measure(doc),
  );
  const contents = book.map((pg, i) => `${pg.heading}\t${i + 2}`);
  const half = Math.ceil(contents.length / 2);
  const col = (list, x) => ({
    height: list.length * 17,
    draw(d, y) {
      list.forEach((line, j) => {
        const [name, pageNo] = line.split('\t');
        d.font('serif').fontSize(11).fillColor(INK).text(name, x, y + j * 17, { lineBreak: false });
        d.font('ui').fontSize(9.5).fillColor(MUTED).text(pageNo, x + 58 * MM, y + j * 17 + 1.5, { width: 12 * MM, align: 'right', lineBreak: false });
      });
    },
  });
  const left = MARGIN_X_MM * MM + 10 * MM;
  const c1 = col(contents.slice(0, half), left);
  const c2 = col(contents.slice(half), left + 85 * MM);
  rows.push({ height: c1.height, draw: (d, y) => (c1.draw(d, y), c2.draw(d, y)) });

  for (const pg of book) {
    rows.push({ type: 'break' });
    rows.push(textRow(pg.heading, { font: 'display', size: 20, after: 3 * MM, extra: pg.heading }).measure(doc));
    for (const item of pg.items) {
      const label = textRow(item.label, { font: 'serif-semibold', size: 10.5, before: 3 * MM, after: 0, color: MUTED }).measure(doc);
      const systems = renderSystems(item.kern, sample).map(systemRow);
      label.keepWithNext = systems[0]?.height ?? 0;
      rows.push(label, ...systems);
    }
  }
  const pages = flow(doc, sample, rows, { justify: false });
  return { doc, pages };
}

function finish(doc, file) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => {
      const buf = Buffer.concat(chunks);
      fs.writeFileSync(file, buf);
      resolve(buf);
    });
    doc.on('error', reject);
    doc.end();
  });
}

fs.mkdirSync(OUT, { recursive: true });
const manifest = [];
for (const sample of SAMPLES) {
  const { doc, pages } = sample.kind === 'book' ? await buildBook(sample) : await buildPiece(sample);
  const buf = await finish(doc, path.join(OUT, sample.file));
  manifest.push({
    file: sample.file,
    title: sample.title,
    composer: sample.composer,
    genre: sample.genre,
    key: sample.key || null,
    tags: sample.tags,
    licence: sample.licence,
    licenceNote: sample.footnote,
    pages,
    bytes: buf.length,
    sha256: crypto.createHash('sha256').update(buf).digest('hex'),
  });
  console.log(`${sample.file.padEnd(32)} ${String(pages).padStart(3)} pages  ${(buf.length / 1024).toFixed(1).padStart(7)} KB`);
}
const json = JSON.stringify({ version: 1, samples: manifest }, null, 2) + '\n';
fs.writeFileSync(path.join(OUT, 'samples.json'), json);
// The app reads the same manifest at build time (no native JSON-asset reader needed).
fs.writeFileSync(APP_MANIFEST, json);
