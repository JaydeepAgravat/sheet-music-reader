/**
 * J. S. Bach — Prelude in C major, BWV 846 (The Well-Tempered Clavier, Book I, 1722). Public domain.
 *
 * Source of truth for the engraving: the harmony of every bar as five pitches (bass, tenor, then the
 * three notes of the right-hand figure), expanded into the familiar figuration:
 *   lower staff  voice 1: bass as a half note (stems down)
 *                voice 2: 16th rest, tenor as a dotted 8th tied to a quarter (stems up)
 *   upper staff  8th rest, then the three upper notes twice as 16ths
 * …twice per bar. Bars 33–35 have Bach's own closing figuration and are written out below.
 * Urtext bar count (35 bars, without the "Schwencke bar" some 19th-century editions add after bar 22).
 *
 * Pitch names use scientific notation (C4 = middle C). Owner: see design/samples/SOURCES.md for the
 * bars worth double-checking against an urtext.
 */

const BARS = [
  /*  1 */ 'C4 E4 G4 C5 E5',
  /*  2 */ 'C4 D4 A4 D5 F5',
  /*  3 */ 'B3 D4 G4 D5 F5',
  /*  4 */ 'C4 E4 G4 C5 E5',
  /*  5 */ 'C4 E4 A4 E5 A5',
  /*  6 */ 'C4 D4 F#4 A4 D5',
  /*  7 */ 'B3 D4 G4 D5 G5',
  /*  8 */ 'B3 C4 E4 G4 C5',
  /*  9 */ 'A3 C4 E4 G4 C5',
  /* 10 */ 'D3 A3 D4 F#4 C5',
  /* 11 */ 'G3 B3 D4 G4 B4',
  /* 12 */ 'G3 Bb3 E4 G4 C#5',
  /* 13 */ 'F3 A3 D4 A4 D5',
  /* 14 */ 'F3 Ab3 D4 F4 B4',
  /* 15 */ 'E3 G3 C4 G4 C5',
  /* 16 */ 'E3 F3 A3 C4 F4',
  /* 17 */ 'D3 F3 A3 C4 F4',
  /* 18 */ 'G2 D3 G3 B3 F4',
  /* 19 */ 'C3 E3 G3 C4 E4',
  /* 20 */ 'C3 G3 Bb3 C4 E4',
  /* 21 */ 'F2 F3 A3 C4 E4',
  /* 22 */ 'F#2 C3 A3 C4 Eb4',
  /* 23 */ 'Ab2 F3 B3 C4 D4',
  /* 24 */ 'G2 F3 G3 B3 D4',
  /* 25 */ 'G2 E3 G3 C4 E4',
  /* 26 */ 'G2 D3 G3 C4 F4',
  /* 27 */ 'G2 D3 G3 B3 F4',
  /* 28 */ 'G2 Eb3 A3 C4 F#4',
  /* 29 */ 'G2 E3 G3 C4 G4',
  /* 30 */ 'G2 D3 G3 C4 F4',
  /* 31 */ 'G2 D3 G3 B3 F4',
  /* 32 */ 'C2 C3 G3 Bb3 E4',
];

/** Bars 33–34: bass + tenor as in the pattern, then 14 sixteenths after the 8th rest. */
const CODA = [
  { bass: 'C2', tenor: 'C3', run: 'F3 A3 C4 F4 C4 A3 C4 A3 F3 A3 F3 D3 F3 D3' },
  { bass: 'C2', tenor: 'B2', run: 'G4 B4 D5 F5 D5 B4 D5 B4 G4 B4 D4 F4 E4 D4' },
];
/** Bar 35: final chord, whole notes with fermatas. */
const FINAL = { lower: ['C2', 'C3'], upper: ['E4', 'G4', 'C5'] };

/** The lower staff reads treble clef for bars 1–9 (as the tessitura sits around middle C), then bass. */
const BASS_CLEF_FROM = 10;

function kernPitch(name) {
  const m = /^([A-G])(#|b)?(\d)$/.exec(name);
  if (!m) throw new Error(`Bad pitch ${name}`);
  const [, letter, acc, oct] = m;
  const o = Number(oct);
  const base = o >= 4 ? letter.toLowerCase().repeat(o - 3) : letter.toUpperCase().repeat(4 - o);
  return base + (acc === '#' ? '#' : acc === 'b' ? '-' : '');
}

/** Columns: lower-staff voice 2 (tenor, stems up) | lower-staff voice 1 (bass) | upper staff. */
function row(v2, v1, up) {
  return [v2, v1, up].join('\t');
}

export default function kern() {
  const out = [
    '!!!COM: Bach, Johann Sebastian',
    '!!!OTL: Prelude in C major',
    '!!!OPT: Das wohltemperierte Klavier I',
    '!!!SCT: BWV 846',
    '!!!ODT: 1722',
    '**kern\t**kern',
    '*staff2\t*staff1',
    '*clefG2\t*clefG2',
    '*k[]\t*k[]',
    '*C:\t*C:',
    '*M4/4\t*M4/4',
    '*met(c)\t*met(c)',
    '*^\t*',
  ];
  const half = (bass, tenor, a, b, c) => {
    const [ka, kb, kc] = [a, b, c].map(kernPitch);
    const kt = kernPitch(tenor);
    out.push(row('16r', `2${kernPitch(bass)}`, '8r'));
    out.push(row(`[8.${kt}`, '.', '.'));
    out.push(row('.', '.', `16${ka}L`));
    out.push(row('.', '.', `16${kb}J`));
    out.push(row(`4${kt}]`, '.', `16${kc}L`));
    out.push(row('.', '.', `16${ka}`));
    out.push(row('.', '.', `16${kb}`));
    out.push(row('.', '.', `16${kc}J`));
  };
  BARS.forEach((bar, i) => {
    const n = i + 1;
    out.push(row(`=${n}`, `=${n}`, `=${n}`));
    if (n === BASS_CLEF_FROM) out.push(row('*clefF4', '*clefF4', '*'));
    const [bass, tenor, a, b, c] = bar.split(' ');
    half(bass, tenor, a, b, c);
    half(bass, tenor, a, b, c);
  });
  CODA.forEach((bar, i) => {
    const n = BARS.length + i + 1;
    out.push(row(`=${n}`, `=${n}`, `=${n}`));
    const run = bar.run.split(' ').map(kernPitch);
    const kt = kernPitch(bar.tenor);
    // Lower staff: bass whole note; tenor 16th rest + dotted half tied over the rest of the bar.
    out.push(row('16r', `1${kernPitch(bar.bass)}`, '8r'));
    out.push(row(`[8.${kt}`, '.', '.'));
    run.forEach((p, j) => {
      // Beamed by beat: the 8th rest + 2 notes, then groups of four.
      const beam = j === 0 || j % 4 === 2 ? 'L' : j % 4 === 1 ? 'J' : '';
      out.push(row(j === 2 ? `2.${kt}]` : '.', '.', `16${p}${beam}`));
    });
  });
  const n = BARS.length + CODA.length + 1;
  out.push(row(`=${n}`, `=${n}`, `=${n}`));
  // Fermatas above the upper staff and on the tenor (stem-up) voice of the lower staff.
  const whole = (ps, fermata = true) => ps.map(p => `1${kernPitch(p)}${fermata ? ';' : ''}`).join(' ');
  out.push(row(whole([FINAL.lower[1]]), whole([FINAL.lower[0]], false), whole(FINAL.upper)));
  out.push(row('==', '==', '=='), row('*-', '*-', '*-'));
  return out.join('\n') + '\n';
}
