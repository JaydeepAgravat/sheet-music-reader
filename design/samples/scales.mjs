/**
 * "Scales & Arpeggios — all 24 keys": an original study book written for the app's samples (CC0).
 * It exists to give the library a long (25-page) score for trying navigation, bookmarks and
 * setlists, and it's genuinely useful to practise from.
 *
 * Everything is derived from the key signature, so spelling is mechanical and checkable:
 *   major keys  — scale in similar motion, scale in contrary motion, tonic arpeggio
 *   minor keys  — harmonic minor, melodic minor (raised 6 and 7 up, natural down), tonic arpeggio
 * Two octaves, hands together, left hand two octaves below the right (contrary motion starts both
 * hands on the same note). Eighth notes in 4/4, ending on a half note. No fingering on purpose.
 */

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

/** Circle-of-fifths order; `fifths` is the key signature (+ sharps / − flats). */
export const KEYS = [
  { tonic: 'C', mode: 'major', fifths: 0 },
  { tonic: 'A', mode: 'minor', fifths: 0 },
  { tonic: 'G', mode: 'major', fifths: 1 },
  { tonic: 'E', mode: 'minor', fifths: 1 },
  { tonic: 'D', mode: 'major', fifths: 2 },
  { tonic: 'B', mode: 'minor', fifths: 2 },
  { tonic: 'A', mode: 'major', fifths: 3 },
  { tonic: 'F#', mode: 'minor', fifths: 3 },
  { tonic: 'E', mode: 'major', fifths: 4 },
  { tonic: 'C#', mode: 'minor', fifths: 4 },
  { tonic: 'B', mode: 'major', fifths: 5 },
  { tonic: 'G#', mode: 'minor', fifths: 5 },
  { tonic: 'F#', mode: 'major', fifths: 6 },
  { tonic: 'Eb', mode: 'minor', fifths: -6 },
  { tonic: 'Db', mode: 'major', fifths: -5 },
  { tonic: 'Bb', mode: 'minor', fifths: -5 },
  { tonic: 'Ab', mode: 'major', fifths: -4 },
  { tonic: 'F', mode: 'minor', fifths: -4 },
  { tonic: 'Eb', mode: 'major', fifths: -3 },
  { tonic: 'C', mode: 'minor', fifths: -3 },
  { tonic: 'Bb', mode: 'major', fifths: -2 },
  { tonic: 'G', mode: 'minor', fifths: -2 },
  { tonic: 'F', mode: 'major', fifths: -1 },
  { tonic: 'D', mode: 'minor', fifths: -1 },
];

/** Alteration (+1 sharp, −1 flat) of each letter in a key signature. */
function signature(fifths) {
  const alt = Object.fromEntries(LETTERS.map(l => [l, 0]));
  if (fifths > 0) SHARP_ORDER.slice(0, fifths).forEach(l => (alt[l] = 1));
  if (fifths < 0) FLAT_ORDER.slice(0, -fifths).forEach(l => (alt[l] = -1));
  return alt;
}

/** A spelled pitch: letter, alteration, octave (scientific: C4 = middle C). */
const note = (letter, alt, octave) => ({ letter, alt, octave });

/** Diatonic step `n` above (or below, n < 0) a pitch, taking the alteration from the signature. */
function step(from, n, sig) {
  const idx = LETTERS.indexOf(from.letter) + n;
  const letter = LETTERS[((idx % 7) + 7) % 7];
  const octave = from.octave + Math.floor(idx / 7);
  return note(letter, sig[letter], octave);
}

function kern(p) {
  const base = p.octave >= 4 ? p.letter.toLowerCase().repeat(p.octave - 3) : p.letter.toUpperCase().repeat(4 - p.octave);
  return base + (p.alt > 0 ? '#'.repeat(p.alt) : '-'.repeat(-p.alt));
}

/** Right hand starts between G3 and F#4 so two octaves stay readable; left hand two octaves lower. */
function startOctave(letter) {
  return ['G', 'A', 'B'].includes(letter) ? 3 : 4;
}

function tonicOf(key) {
  const letter = key.tonic[0];
  const alt = key.tonic.includes('#') ? 1 : key.tonic.includes('b') ? -1 : 0;
  return note(letter, alt, startOctave(letter));
}

/** Two-octave run: degrees 0..14 of the scale built by `alterFor(degree, ascending)`. */
function scaleRun(key, tonic, alterFor) {
  const sig = signature(key.fifths);
  const up = [];
  for (let d = 0; d <= 14; d++) {
    const p = step(tonic, d, sig);
    up.push({ ...p, alt: p.alt + alterFor(d % 7, true) });
  }
  const down = [];
  for (let d = 13; d >= 0; d--) {
    const p = step(tonic, d, sig);
    down.push({ ...p, alt: p.alt + alterFor(d % 7, false) });
  }
  // 14 up (0..13), 14 down (14..1), then the tonic as a half note: exactly 4 bars of 4/4.
  return [...up.slice(0, 14), up[14], ...down.slice(0, 13), down[13]];
}

function arpeggioRun(key, tonic) {
  const sig = signature(key.fifths);
  const tones = [];
  for (let i = 0; i <= 6; i++) tones.push(step(tonic, [0, 2, 4][i % 3] + 7 * Math.floor(i / 3), sig));
  // Up 0..5, down 6..1, tonic half note: 2 bars.
  return [...tones.slice(0, 6), tones[6], tones[5], tones[4], tones[3], tones[2], tones[1], tones[0]];
}

const octaveShift = (p, n) => ({ ...p, octave: p.octave + n });

/** Kern for a grand-staff exercise; rh/lh are equal-length pitch lists, last note a half note. */
function exercise(key, rh, lh, firstBar) {
  const sigToken = (() => {
    const f = key.fifths;
    if (f > 0) return `*k[${SHARP_ORDER.slice(0, f).map(l => l.toLowerCase() + '#').join('')}]`;
    if (f < 0) return `*k[${FLAT_ORDER.slice(0, -f).map(l => l.toLowerCase() + '-').join('')}]`;
    return '*k[]';
  })();
  const out = ['**kern\t**kern', '*staff2\t*staff1', '*clefF4\t*clefG2', `${sigToken}\t${sigToken}`, '*M4/4\t*M4/4', '*met(c)\t*met(c)'];
  let bar = firstBar;
  rh.forEach((r, i) => {
    if (i % 8 === 0) out.push(`=${bar}\t=${bar++}`);
    const last = i === rh.length - 1;
    const beam = last ? '' : i % 4 === 0 ? 'L' : i % 4 === 3 ? 'J' : '';
    const dur = last ? '2' : '8';
    out.push(`${dur}${kern(lh[i])}${beam}\t${dur}${kern(r)}${beam}`);
  });
  out.push('==\t==', '*-\t*-');
  return out.join('\n') + '\n';
}

const NONE = () => 0;
/** Harmonic minor: raised 7th (degree 6) both ways. */
const HARMONIC = d => (d === 6 ? 1 : 0);
/** Melodic minor: raised 6th and 7th going up, natural minor coming down. */
const MELODIC = (d, up) => (up && (d === 5 || d === 6) ? 1 : 0);

/** "E-flat minor" (spelled out: the bundled text fonts have no ♭/♯ glyphs). */
export function keyName(key) {
  const t = key.tonic[0] + (key.tonic.includes('#') ? '-sharp' : key.tonic.includes('b') ? '-flat' : '');
  return `${t} ${key.mode}`;
}

/** One page per key: a heading and three exercises. */
export default function pages() {
  return KEYS.map(key => {
    const tonic = tonicOf(key);
    const items = [];
    if (key.mode === 'major') {
      const rh = scaleRun(key, tonic, NONE);
      items.push({ label: 'Scale · similar motion', kern: exercise(key, rh, rh.map(p => octaveShift(p, -2)), 1) });
      // Contrary motion: both hands start on the right hand's tonic; the left hand mirrors downwards.
      const sig = signature(key.fifths);
      const lhDown = [];
      for (let d = 0; d <= 14; d++) lhDown.push(step(tonic, -d, sig));
      const lh = [...lhDown.slice(0, 14), lhDown[14], ...lhDown.slice(1, 14).reverse(), lhDown[0]];
      items.push({ label: 'Scale · contrary motion', kern: exercise(key, rh, lh, 5) });
    } else {
      const h = scaleRun(key, tonic, HARMONIC);
      items.push({ label: 'Harmonic minor', kern: exercise(key, h, h.map(p => octaveShift(p, -2)), 1) });
      const m = scaleRun(key, tonic, MELODIC);
      items.push({ label: 'Melodic minor', kern: exercise(key, m, m.map(p => octaveShift(p, -2)), 5) });
    }
    const a = arpeggioRun(key, tonic);
    items.push({ label: 'Arpeggio', kern: exercise(key, a, a.map(p => octaveShift(p, -2)), 9) });
    return { heading: keyName(key), items };
  });
}
