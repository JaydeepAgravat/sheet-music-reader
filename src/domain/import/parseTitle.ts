/**
 * Turns a messy PDF filename into a title and composer for the import review card
 * (docs/PLAN.md §1.4). Musicians' files look like "01 - chopin_nocturne_op9no2 (1).pdf" or
 * "IMSLP01234-PMLP01234-Chopin_Nocturnes_Op9.pdf"; the user fixes the rare miss inline, so the
 * rules below prefer leaving a composer empty over guessing a wrong one.
 */
import { lookupComposer, MAX_COMPOSER_WORDS, type KnownComposer } from './composers';

export type ParsedTitle = { title: string; composer: string | null };

// ---------------------------------------------------------------------------------------------
// Cleaning

/** IMSLP downloads: "IMSLP01234-PMLP01234-Rest_Of_Name". */
const IMSLP_PREFIX = /^IMSLP\d+[-_](?:PMLP\d+[-_])?/i;
const IMSLP_BRACKET = /[[(]\s*IMSLP[^\])]*[\])]/gi;
const DATE =
  /(?<![\p{L}\p{N}])(?:19|20)\d{2}([-_.])(?:0?[1-9]|1[0-2])\1(?:0?[1-9]|[12]\d|3[01])(?![\p{N}])|(?<!\p{N})(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])(?!\p{N})/gu;
/** Words that are noise wherever they appear. */
const SCAN = /(?<![\p{L}\p{N}])scan(?:ned)?(?![\p{L}\p{N}])/giu;
const NOISE = String.raw`(?:scan(?:ned)?|final(?:[ -]?\d+)?|copy|draft|v\d+(?:\.\d+)?|rev\d*)`;
/** Noise at the end: "final", "v2", "- Copy", "(final)". A title word like "The Final Countdown" survives. */
const TRAILING_NOISE = new RegExp(String.raw`[\s,–—-]*[([]?\s*(?<![\p{L}\p{N}])${NOISE}\s*[)\]]?$`, 'iu');
const BRACKETED_NOISE = new RegExp(String.raw`[([]\s*${NOISE}\s*[)\]]`, 'giu');
/** Download duplicates: "Nocturne (1)". */
const TRAILING_COPY_NUMBER = /\s*\(\d{1,2}\)$/;
const COPY_OF = /^copy of\s+/i;
/**
 * Leading track numbers: "01 ", "01. ", "1. ", "3 - ". A bare number without a leading zero stays,
 * so "3 Gymnopédies", "12 Etudes" and "1812 Overture" keep their numbers.
 */
const TRACK = /^(?:0\d{1,2}(?:\s*[.)–-]\s*|\s+)(?=\S)|[1-9]\d{0,2}\s*(?:[.)]\s*|[–-]\s+)(?=\p{L}))/u;

/** Abbreviations whose dot is part of the word: "Op.9" stays for the catalogue rules, never "Op 9". */
const DOT_ABBREVIATIONS = new Set([
  'op', 'no', 'nr', 'nos', 'hob', 'kv', 'arr', 'vol', 'st', 'ste', 'mr', 'mrs', 'dr', 'jr', 'sr',
  'mvt', 'mov', 'ed', 'feat', 'ft', 'pt',
]);

/**
 * Dots used as word separators ("Clair.de.Lune") become spaces; dots that belong to initials
 * ("J.S."), abbreviations ("Op.9", "St.") or numbers ("1.2") stay.
 */
function spaceDots(s: string): string {
  return s.replace(/([\p{L}\p{N}]+)\.(?=([\p{L}\p{N}]))/gu, (m, word: string, next: string) => {
    if (/^\p{L}$/u.test(word)) return m;
    if (DOT_ABBREVIATIONS.has(word.toLowerCase())) return /\p{L}/u.test(next) ? `${word}. ` : m;
    if (/\d$/.test(word) && /\d/.test(next)) return m;
    return `${word} `;
  });
}

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Separators and brackets left dangling at either end after noise removal. */
function trimJunk(s: string): string {
  let out = collapse(s.replace(/\(\s*\)|\[\s*\]/g, ' '));
  out = out.replace(/^[\s.,;:~+*_–—-]+/u, '').replace(/[\s,;:~+*_–—-]+$/u, '');
  return out.trim();
}

function removeNoise(s: string): string {
  let out = s.replace(SCAN, ' ').replace(BRACKETED_NOISE, ' ').replace(COPY_OF, '');
  for (;;) {
    const next = trimJunk(out.replace(TRAILING_COPY_NUMBER, '').replace(TRAILING_NOISE, ''));
    if (next === out) return out;
    out = next;
  }
}

// ---------------------------------------------------------------------------------------------
// Casing

const SMALL_WORDS = new Set([
  'of', 'the', 'in', 'and', 'for', 'a', 'an', 'de', 'la', 'le', 'von', 'van', 'der', 'du', 'des',
  'di', 'da', 'to', 'on', 'at', 'by', 'or', 'und', 'et', 'major', 'minor', 'flat', 'sharp',
]);
const ROMAN = /^(?:ii|iii|iv|vi|vii|viii|ix|xi|xii|xiii|xiv|xv|xvi|xvii|xviii|xix|xx)$/;

/** True when every cased letter has the same case: only then do we know the user didn't choose it. */
function isSingleCase(s: string): boolean {
  const letters = s.replace(/[^\p{L}]/gu, '');
  if (letters.length < 2) return false;
  return letters === letters.toLowerCase() || letters === letters.toUpperCase();
}

function capitalise(word: string): string {
  return word.replace(/\p{L}/u, c => c.toUpperCase()).replace(/\.(\p{L})/gu, (_, c: string) => `.${c.toUpperCase()}`);
}

function titleCase(s: string): string {
  const words = s.split(' ');
  return words
    .map((w, i) => {
      const lower = w.toLowerCase();
      const prev = words[i - 1]?.toLowerCase();
      const first = prev === undefined || /^[–—-]+$/.test(prev) || /[:(]$/.test(prev);
      if (ROMAN.test(lower)) return lower.toUpperCase();
      // "Prelude in a minor": after "in", a single letter is a key, not the article.
      if (prev === 'in' && /^[a-g]$/.test(lower)) return lower.toUpperCase();
      if (!first && SMALL_WORDS.has(lower)) return lower;
      return capitalise(lower);
    })
    .join(' ');
}

// ---------------------------------------------------------------------------------------------
// Catalogue numbers

const CATALOGUE_CASE: Record<string, string> = { bwv: 'BWV', hwv: 'HWV', rv: 'RV', woo: 'WoO', kv: 'KV', k: 'K.' };

/** "op9" / "Op.9" / "op 9" → "Op. 9"; "no2" → "No. 2"; "BWV846" → "BWV 846"; "hob xvi" → "Hob. XVI". */
function normaliseCatalogue(s: string): string {
  return s
    .replace(/(?<!\p{L})op\.?\s*(?=\d)/giu, 'Op. ')
    .replace(/(?<!\p{L})no\.?\s*(?=\d)/giu, 'No. ')
    .replace(/(?<!\p{L})(bwv|hwv|rv|woo|kv|k)\.?\s*(?=\d)/giu, (_, cat: string) => `${CATALOGUE_CASE[cat.toLowerCase()] ?? cat} `)
    .replace(/(?<!\p{L})hob\.?\s*([ivxlc]+)(?!\p{L})/giu, (_, roman: string) => `Hob. ${roman.toUpperCase()}`);
}

/** A segment that only continues the title's catalogue number ("Op. 9 No. 2"). */
const CATALOGUE_START = /^(?:Op\.|No\.|BWV|HWV|RV|WoO|KV|K\.|Hob\.|D\.?\s*\d)/;

// ---------------------------------------------------------------------------------------------
// Composer detection

/** Words that make a phrase a title, not a person: forms, instruments, versions, pronouns. */
const NOT_A_NAME = new Set(
  (
    'sonata sonatas sonatina nocturne nocturnes prelude preludes fugue fugues etude etudes study ' +
    'waltz waltzes valse mazurka mazurkas polonaise ballade ballades scherzo impromptu rhapsody ' +
    'fantasia fantasy fantaisie suite concerto symphony overture mass requiem magnificat ave maria ' +
    'hymn hymns anthem psalm carol song songs lied lieder march minuet menuet gavotte sarabande ' +
    'gigue allemande courante bourree air aria chorale cantata motet rondo variations variation ' +
    'theme invention inventions toccata partita serenade arabesque gymnopedie gymnopedies reverie ' +
    'lullaby berceuse barcarolle romance elegy elegie blues rag tango dance dances ' +
    'part parts score piano violin cello viola flute oboe clarinet bassoon horn trumpet trombone ' +
    'tuba harp guitar bass drums sax saxophone organ vocal vocals voice choir satb ssa ttbb ' +
    'soprano alto tenor baritone solo duet trio quartet quintet orchestra ensemble band ' +
    'accompaniment conductor lead melody harmony chords tabs lyrics sheet sheets music ' +
    'version arr arrangement arranged easy simplified beginner intermediate advanced edition ' +
    'revised original transposed excerpt excerpts live remix demo acoustic instrumental karaoke ' +
    'cover remastered reprise intro medley full complete act scene movement book vol volume ' +
    'no op major minor flat sharp key ' +
    'me my you your him his her us our them their it its the this that'
  ).split(' '),
);
const PARTICLES = new Set(['von', 'van', 'der', 'den', 'de', 'da', 'di', 'du', 'del', 'della', 'la', 'le', 'y', 'ten', 'ter']);
/** "J.", "J.S.", "C.P.E.", "J.-P." */
const INITIALS = /^(?:\p{Lu}\.)+(?:-\p{Lu}\.)?$/u;
const NAME_WORD = /^\p{Lu}[\p{L}'’-]*\p{L}$/u;

const fold = (w: string) => w.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const nameWords = (s: string) => s.replace(/,/g, ' ').split(/\s+/).filter(Boolean);
const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

function isGivenName(w: string, index: number): boolean {
  if (NOT_A_NAME.has(fold(w))) return false;
  if (INITIALS.test(w)) return true;
  if (index > 0 && PARTICLES.has(w.toLowerCase())) return true;
  return NAME_WORD.test(w);
}

/**
 * How sure we are that a phrase is a person:
 * 4 = exactly a known composer ("Chopin"), 3 = a known surname with given names or initials
 * ("J.S. Bach", "Bach, J.S.", "Frédéric Chopin"), 1 = looks like a name (≤3 capitalised words,
 * no digits or title words), 0 = not a name.
 */
type NameScore = { score: 0 | 1 | 3 | 4; known?: KnownComposer };

function scoreName(phrase: string): NameScore {
  const words = nameWords(phrase);
  if (!words.length || /\d/.test(phrase)) return { score: 0 };
  for (let n = Math.min(MAX_COMPOSER_WORDS, words.length); n >= 1; n--) {
    const suffix = lookupComposer(words.slice(-n).join(' '));
    const prefix = lookupComposer(words.slice(0, n).join(' '));
    if (n === words.length && suffix) return { score: 4, known: suffix };
    if (words.length > 5) continue;
    if (suffix && words.slice(0, -n).every(isGivenName)) return { score: 3, known: suffix };
    if (prefix && words.slice(n).every((w, i) => isGivenName(w, i + 1))) return { score: 3, known: prefix };
  }
  if (words.length <= 3 && words.every(isGivenName)) return { score: 1 };
  return { score: 0 };
}

type Split = { title: string; composer: string };

/** Joins the remaining title segments; a catalogue continuation reads better without a dash. */
function joinTitle(segments: string[]): string {
  return segments.reduce((acc, seg) => (acc ? `${acc}${CATALOGUE_START.test(seg) ? ' ' : ' - '}${seg}` : seg), '');
}

/** Spaced hyphens and any en/em dash separate; "D-flat", "Op. 9-2" and "Saint-Saëns" never do. */
const SEPARATOR = /\s*[–—]+\s*|\s*-{2,}\s*|\s+-\s*|\s*-\s+/u;

/** "Title - Composer" or "Composer - Title" (or more segments, with the composer at either end). */
function splitOnSeparator(s: string): Split | null {
  const segs = s.split(SEPARATOR).map(trimJunk).filter(Boolean);
  if (segs.length < 2) return null;
  const first = segs[0]!;
  const last = segs[segs.length - 1]!;
  const leading = { composer: first, title: joinTitle(segs.slice(1)) };
  const trailing = { composer: last, title: joinTitle(segs.slice(0, -1)) };
  const sf = scoreName(first).score;
  const sl = scoreName(last).score;
  // A known name wins; on a tie the conventional "Title - Composer" order wins.
  if (sf >= 3 || sl >= 3) return sl >= sf ? trailing : leading;
  // Unknown names: only a short name-like side facing a longer title.
  if (sl === 1 && wordCount(last) < wordCount(trailing.title)) return trailing;
  if (sf === 1 && wordCount(first) < wordCount(leading.title)) return leading;
  return null;
}

/**
 * "Autumn_Leaves-Kosma": an unspaced hyphen splits only when one side is exactly a well-known,
 * unambiguous name, so "D-flat", "Op. 9-2" and "Saint-Saëns" itself stay intact.
 */
function splitOnTightHyphen(s: string): Split | null {
  const known = (x: string) => {
    const k = lookupComposer(x.trim());
    return !!k && !k.ambiguous;
  };
  for (let i = s.indexOf('-'); i > 0; i = s.indexOf('-', i + 1)) {
    if (!/\p{L}/u.test(s[i - 1]!) || !/\p{L}/u.test(s[i + 1] ?? '')) continue;
    const left = s.slice(0, i);
    const right = s.slice(i + 1);
    if (known(s)) return null;
    if (known(right) && !known(left)) return { title: left, composer: right };
    if (known(left) && !known(right)) return { composer: left, title: right };
  }
  return null;
}

/** "Composer: Title" — only for a known name, since "Carmen: Habanera" is title and subtitle. */
function splitOnColon(s: string): Split | null {
  const m = /^([^:]+?)\s*:\s+(.+)$/.exec(s);
  if (!m || scoreName(m[1]!).score < 3) return null;
  return { composer: m[1]!, title: m[2]! };
}

/** A person's name inside trailing brackets or after "by": known, or a full name of 2–3 words. */
function isNameForPhrase(phrase: string): boolean {
  const { score } = scoreName(phrase);
  return score >= 3 || (score === 1 && wordCount(phrase) >= 2);
}

/** "Title (Composer)". "(Easy Version)" and "(1st Movement)" stay part of the title. */
function splitOnParenthesis(s: string): Split | null {
  const m = /^(.*?\S)\s*[([]([^()[\]]+)[)\]]$/.exec(s);
  if (!m || !isNameForPhrase(m[2]!.trim())) return null;
  return { title: m[1]!, composer: m[2]!.trim() };
}

/** "Title by Composer". "Variations on a Theme by Haydn" is a title, so "theme by" never splits. */
function splitOnBy(s: string): Split | null {
  const m = /^(.*\S)\s+by\s+(\S.*)$/i.exec(s);
  if (!m || /(?:theme|themes|motif|variations?)$/i.test(m[1]!) || !isNameForPhrase(m[2]!)) return null;
  return { title: m[1]!, composer: m[2]! };
}

/** "Bach and Handel Arias" is no "Bach" + title. */
const JOINS_NEXT = new Set(['and', '&', 'und', 'et', 'of', 'or']);
/** "Hommage à Rameau", "Theme by Haydn": the name is part of the title. */
const CONNECTORS = new Set(['of', 'by', 'after', 'on', 'a', 'à', 'de', 'la', 'le', 'the', 'and', '&', 'for', 'pour', 'nach', 'to', 'sur', 'from', 'di', 'da', 'von', 'van', 'und', 'et']);

/**
 * No separator at all: "Chopin_Nocturnes_Op9" or "Clair de Lune Debussy". Allowed only for a known
 * composer at the very start or end; everyday-word surnames only in underscore/dot names.
 */
function splitAdjacent(s: string, compact: boolean): Split | null {
  const words = s.split(' ');
  const usable = (k: KnownComposer | undefined): k is KnownComposer => !!k && (compact || !k.ambiguous);
  for (let n = Math.min(MAX_COMPOSER_WORDS, words.length - 1); n >= 1; n--) {
    const rest = words.slice(n);
    if (usable(lookupComposer(words.slice(0, n).join(' '))) && !JOINS_NEXT.has(rest[0]!.toLowerCase())) {
      return { composer: words.slice(0, n).join(' '), title: rest.join(' ') };
    }
  }
  for (let n = Math.min(MAX_COMPOSER_WORDS, words.length - 1); n >= 1; n--) {
    const rest = words.slice(0, -n);
    if (usable(lookupComposer(words.slice(-n).join(' '))) && !CONNECTORS.has(rest[rest.length - 1]!.toLowerCase())) {
      return { composer: words.slice(-n).join(' '), title: rest.join(' ') };
    }
  }
  return null;
}

function splitComposer(s: string, compact: boolean): Split | null {
  for (const split of [splitOnSeparator(s), splitOnTightHyphen(s), splitOnColon(s), splitOnParenthesis(s), splitOnBy(s), splitAdjacent(s, compact)]) {
    if (!split) continue;
    const title = trimJunk(split.title);
    const composer = trimJunk(split.composer.replace(/^[([]|[)\]]$/g, ''));
    if (title && composer) return { title, composer };
  }
  return null;
}

/** A folder named after a known composer ("Chopin", "J.S. Bach") fills an empty composer. */
function composerFromFolder(folderHint: string): string | null {
  const name = folderHint.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? '';
  let cleaned = trimJunk(collapse(name.normalize('NFC').replace(/_+/g, ' ')));
  if (isSingleCase(cleaned)) cleaned = titleCase(cleaned);
  const { score, known } = scoreName(cleaned);
  if (score === 3 || (score === 4 && known && !known.ambiguous)) return cleaned;
  return null;
}

// ---------------------------------------------------------------------------------------------

export function parseFileName(fileName: string, folderHint?: string): ParsedTitle {
  const base = (fileName.split(/[\\/]/).pop() ?? fileName).normalize('NFC');
  let s = base.replace(/(?:\.pdf)+\s*$/i, '');
  const fallback = trimJunk(collapse(s.replace(/_+/g, ' '))) || base.trim() || 'Untitled';

  s = s.trim().replace(IMSLP_PREFIX, '').replace(IMSLP_BRACKET, ' ');
  // Words glued with "_" or "." instead of spaces: the user never typed this name by hand.
  const compact = !/\s/.test(s) && /[_.]/.test(s);
  s = s.replace(DATE, ' ').replace(/_+/g, ' ');
  s = spaceDots(s);
  s = s.replace(/(\p{Lu}\.)(?=\p{Lu}\p{Ll})/gu, '$1 '); // "J.S.Bach" → "J.S. Bach"
  s = removeNoise(collapse(s));
  const withoutTrack = s.replace(TRACK, '');
  if (/[\p{L}\p{N}]/u.test(withoutTrack)) s = withoutTrack;
  s = trimJunk(s);
  if (isSingleCase(s)) s = titleCase(s);
  s = collapse(normaliseCatalogue(s));

  const split = s ? splitComposer(s, compact) : null;
  const title = split?.title ?? s;
  const found = split?.composer ?? (folderHint ? composerFromFolder(folderHint) : null);
  // Plain-ASCII known names get their proper spelling ("Dvorak" → "Dvořák"); a name typed with its
  // own accents ("Händel") or unknown stays as typed.
  const composer = found && /^[\x20-\x7e]+$/.test(found) ? (lookupComposer(found)?.name ?? found) : found;
  return { title: title || fallback, composer };
}
