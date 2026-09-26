/**
 * Library search text rules (docs/PLAN.md §1.4: instant, prefix, accent-insensitive, highlighted).
 * Pure functions shared by the FTS query builder, the in-memory filters and the result highlighter,
 * so "Dvorak" finds and highlights "Dvořák" the same way everywhere.
 */

/**
 * Letters that have no Unicode decomposition, so NFD alone would never fold them. SQLite's
 * unicode61 tokenizer does not fold them either (see buildFtsQuery).
 */
const SPECIAL_FOLDS: Record<string, string> = {
  ß: 'ss',
  ẞ: 'ss',
  æ: 'ae',
  Æ: 'ae',
  ø: 'o',
  Ø: 'o',
  œ: 'oe',
  Œ: 'oe',
  ł: 'l',
  Ł: 'l',
  đ: 'd',
  Đ: 'd',
  ı: 'i',
};

const MARKS = /\p{M}/gu;
/** A search token: letters or digits. Everything else (punctuation, apostrophes, emoji) separates. */
const TOKEN = /[\p{L}\p{N}]+/gu;

/** Folds one code point: lower-case, special letters, decompose, drop combining marks. */
function foldChar(ch: string): string {
  const lower = ch.toLowerCase();
  let out = '';
  for (const c of lower) out += SPECIAL_FOLDS[c] ?? c;
  return out.normalize('NFD').replace(MARKS, '');
}

/** Lower-case, accent-free, single-spaced text for comparisons ("Dvořák  Op.9" → "dvorak op.9"). */
export function normalizeForSearch(s: string): string {
  let out = '';
  for (const ch of s) out += foldChar(ch);
  return out.replace(/\s+/g, ' ').trim();
}

/** Normalised search tokens of a query, in order, without duplicates. */
export function searchTokens(input: string): string[] {
  const tokens = normalizeForSearch(input).match(TOKEN) ?? [];
  return [...new Set(tokens)];
}

const quote = (token: string) => `"${token.replace(/"/g, '""')}"*`;

/**
 * FTS5 MATCH expression for what the user typed, or null when there is nothing to search for.
 *
 * Every token becomes a quoted prefix phrase ("tok"*), so FTS operators typed by the user (AND, OR,
 * NOT, NEAR, *, -, quotes, parentheses, column filters) are plain text and can never cause a syntax
 * error. Tokens are implicitly AND-ed. unicode61 with remove_diacritics 2 folds accents itself, but
 * not ß/æ/ø/œ/ł, so a token that our folding changes also matches its unfolded spelling:
 * "straße" → ("strasse"* OR "straße"*), which finds both spellings in the index.
 */
export function buildFtsQuery(input: string): string | null {
  const raw = input.normalize('NFC').toLowerCase().match(TOKEN) ?? [];
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const token of raw) {
    const folded = normalizeForSearch(token);
    // FTS drops diacritics itself; only letters it cannot fold need the second spelling.
    const plain = token.normalize('NFD').replace(MARKS, '');
    const key = `${folded}|${plain}`;
    if (!folded || seen.has(key)) continue;
    seen.add(key);
    parts.push(folded === plain ? quote(folded) : `(${quote(folded)} OR ${quote(plain)})`);
  }
  return parts.length ? parts.join(' AND ') : null;
}

/**
 * Normalised text plus, for every normalised UTF-16 unit, the span of the original string it came
 * from. Combining marks in the original produce no output, so they widen the previous span.
 */
function foldWithMap(text: string): { folded: string; start: number[]; end: number[] } {
  let folded = '';
  const start: number[] = [];
  const end: number[] = [];
  let i = 0;
  for (const ch of text) {
    const out = foldChar(ch);
    const chEnd = i + ch.length;
    if (!out && end.length && /^\p{M}+$/u.test(ch)) {
      // A combining mark that follows a base letter belongs to it (e.g. "o" + U+030C).
      end[end.length - 1] = chEnd;
    }
    for (let k = 0; k < out.length; k++) {
      start.push(i);
      end.push(chEnd);
    }
    folded += out;
    i = chEnd;
  }
  return { folded, start, end };
}

/**
 * Where to highlight a query in a result: [start, end) ranges in the ORIGINAL text, sorted and
 * merged. A query token matches the start of a word, ignoring case and accents ("dvo" highlights
 * "Dvo" in "Dvořák", "faure" highlights all of "Fauré").
 */
export function highlightRanges(text: string, query: string): Array<[number, number]> {
  const tokens = searchTokens(query);
  if (!tokens.length || !text) return [];
  const { folded, start, end } = foldWithMap(text);
  const ranges: Array<[number, number]> = [];
  for (const word of folded.matchAll(TOKEN)) {
    const w = word[0];
    const at = word.index ?? 0;
    // Longest token wins, so "bach" and "ba" together highlight the whole "Bach".
    let best = 0;
    for (const t of tokens) if (t.length > best && w.startsWith(t)) best = t.length;
    if (!best) continue;
    const s = start[at];
    const e = end[at + best - 1];
    if (s !== undefined && e !== undefined) ranges.push([s, e]);
  }
  return mergeRanges(ranges);
}

/** Sorts ranges and merges overlapping or touching ones. */
export function mergeRanges(ranges: ReadonlyArray<readonly [number, number]>): Array<[number, number]> {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: Array<[number, number]> = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}
