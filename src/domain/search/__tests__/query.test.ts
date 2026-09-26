/**
 * Search text rules, including a real FTS5 table (Node's built-in SQLite) so every query we build
 * is proven to parse and to match the way the library search will.
 */
import { DatabaseSync } from 'node:sqlite';
import { buildFtsQuery, highlightRanges, mergeRanges, normalizeForSearch, searchTokens } from '../query';

/** The highlighted substrings, which read far better in failures than index pairs. */
const marked = (text: string, query: string) => highlightRanges(text, query).map(([s, e]) => text.slice(s, e));

describe('normalizeForSearch', () => {
  it.each([
    ['Dvořák', 'dvorak'],
    ['Fauré', 'faure'],
    ['  Saint-Saëns\t\n Op.9 ', 'saint-saens op.9'],
    ['Straße', 'strasse'],
    ['Æolian Harp', 'aeolian harp'],
    ['Søren', 'soren'],
    ['Œuvre', 'oeuvre'],
    ['Lutosławski', 'lutoslawski'],
    ['GÓRECKI', 'gorecki'],
    ['Dvořák', 'dvorak'],
    ['İstanbul', 'istanbul'],
    ['', ''],
  ])('%j → %j', (input, expected) => {
    expect(normalizeForSearch(input)).toBe(expected);
  });

  it('keeps scripts without case or accents', () => {
    expect(normalizeForSearch('久石譲 Summer')).toBe('久石譲 summer');
  });
});

describe('searchTokens', () => {
  it('splits on anything that is not a letter or digit and removes duplicates', () => {
    expect(searchTokens("Op.9 no-2, D'Indy d’indy 🎹 op")).toEqual(['op', '9', 'no', '2', 'd', 'indy']);
  });
});

describe('buildFtsQuery', () => {
  it.each([
    ['', null],
    ['   ', null],
    ['"', null],
    ['*', null],
    ['-', null],
    ['(', null],
    ['")*(-:^', null],
    ['🎹🎻', null],
  ])('%j has nothing to search for', (input, expected) => {
    expect(buildFtsQuery(input)).toBe(expected);
  });

  it.each([
    ['chopin', '"chopin"*'],
    ['Chopin Nocturne', '"chopin"* AND "nocturne"*'],
    ['Dvořák', '"dvorak"*'],
    ['op.9', '"op"* AND "9"*'],
    ['c#', '"c"*'],
    ['AND', '"and"*'],
    ['OR NOT', '"or"* AND "not"*'],
    ['title:x', '"title"* AND "x"*'],
    ['NEAR(a b)', '"near"* AND "a"* AND "b"*'],
    ['bach bach', '"bach"*'],
    ['straße', '("strasse"* OR "straße"*)'],
    ['søren', '("soren"* OR "søren"*)'],
  ])('%j → %s', (input, expected) => {
    expect(buildFtsQuery(input)).toBe(expected);
  });

  describe('against a real FTS5 table', () => {
    let db: DatabaseSync;
    const titles = (input: string) => {
      const q = buildFtsQuery(input);
      if (q === null) return [];
      return db
        .prepare('SELECT title FROM t WHERE t MATCH ? ORDER BY rowid')
        .all(q)
        .map(r => r.title as string);
    };

    beforeAll(() => {
      db = new DatabaseSync(':memory:');
      db.exec(
        "CREATE VIRTUAL TABLE t USING fts5(title, composer, tokenize = 'unicode61 remove_diacritics 2', prefix = '1 2 3')",
      );
      const insert = db.prepare('INSERT INTO t (title, composer) VALUES (?, ?)');
      for (const [title, composer] of [
        ['Humoresque Op. 101', 'Antonín Dvořák'],
        ['Nocturne Op. 9 No. 2', 'Frédéric Chopin'],
        ['Pavane', 'Gabriel Fauré'],
        ['Sicilienne', 'Fauré'],
        ['Straße der Lieder', 'Søren Olsen'],
        ['Strasse Song', 'Anon'],
        ['AND OR NOT', 'Operators'],
        ['C# minor Prelude', 'Rachmaninoff'],
      ]) {
        insert.run(title, composer);
      }
    });
    afterAll(() => db.close());

    it.each([
      ['dvorak', ['Humoresque Op. 101']],
      ['Dvořák', ['Humoresque Op. 101']],
      ['DVO', ['Humoresque Op. 101']],
      ['faure', ['Pavane', 'Sicilienne']],
      ['fauré pav', ['Pavane']],
      ['chopin nocturne', ['Nocturne Op. 9 No. 2']],
      ['noct chop', ['Nocturne Op. 9 No. 2']],
      ['op.9', ['Nocturne Op. 9 No. 2']],
      ['op', ['Humoresque Op. 101', 'Nocturne Op. 9 No. 2', 'AND OR NOT']],
      ['straße', ['Straße der Lieder', 'Strasse Song']],
      ['strasse', ['Strasse Song']],
      ['søren', ['Straße der Lieder']],
      ['AND', ['AND OR NOT']],
      ['c#', ['Nocturne Op. 9 No. 2', 'C# minor Prelude']], // "c" is a prefix of Chopin too
      ['chopin xyz', []],
    ])('%j matches %j', (input, expected) => {
      expect(titles(input)).toEqual(expected);
    });

    it('never throws on hostile input', () => {
      const hostile = [
        '"', '""', '"""', '*', '**', '-', '--', '+', '^', ':', '(', ')', '()', '{', '}', '[', ']',
        'AND', 'OR', 'NOT', 'OR NOT', 'AND AND', 'NEAR', 'NEAR(', 'NEAR/2', 'title:', 'title:chopin',
        '-chopin', 'chopin*', '*chopin', '"chopin', 'chopin"', 'a"b', "o'neil", "d'", '\\', '\\"',
        '\u0000', '​', 'op.9', 'c#', 'Dvořák', '🎹', '🎹 chopin', '😀😀', 'x'.repeat(500),
        'a b c d e f g h i j k l m n o p q r s t u v w x y z', '$', '%', ';DROP TABLE t;--',
        'ß', 'ﬁne', 'İ', '٣', '一二三',
      ];
      for (const input of hostile) {
        expect(() => titles(input)).not.toThrow();
      }
    });
  });
});

describe('highlightRanges', () => {
  it('matches word prefixes ignoring case', () => {
    expect(marked('Nocturne in E-flat', 'noc')).toEqual(['Noc']);
    expect(marked('Nocturne in E-flat', 'flat')).toEqual(['flat']);
    expect(marked('Nocturne in E-flat', 'turne')).toEqual([]);
  });

  it('is accent-insensitive in both directions', () => {
    expect(marked('Antonín Dvořák', 'dvorak')).toEqual(['Dvořák']);
    expect(marked('Antonin Dvorak', 'Dvořák')).toEqual(['Dvorak']);
    expect(marked('Gabriel Fauré', 'faure')).toEqual(['Fauré']);
    expect(marked('Gabriel Fauré', 'FAU')).toEqual(['Fau']);
  });

  it('maps back through decomposed accents to the original indices', () => {
    const text = 'Dvořák Humoresque';
    expect(highlightRanges(text, 'dvorak')).toEqual([[0, 8]]);
    // A prefix ending on a decomposed letter keeps that letter's mark.
    expect(highlightRanges(text, 'dvor')).toEqual([[0, 5]]);
  });

  it('maps back through letters that fold to two', () => {
    expect(marked('Straße', 'strasse')).toEqual(['Straße']);
    expect(marked('Straße', 'stras')).toEqual(['Straß']);
    expect(marked('Œuvres', 'oe')).toEqual(['Œ']);
  });

  it('highlights every token, sorted and merged', () => {
    expect(highlightRanges('Chopin Nocturne Op. 9', 'noct chop 9')).toEqual([
      [0, 4],
      [7, 11],
      [20, 21],
    ]);
    expect(marked('Bach Bach', 'bach')).toEqual(['Bach', 'Bach']);
  });

  it('the longest matching token wins when tokens overlap', () => {
    expect(highlightRanges('Bach', 'ba bach b')).toEqual([[0, 4]]);
  });

  it('ignores operators and punctuation in the query', () => {
    expect(marked('Op. 9 AND more', '"op" AND*')).toEqual(['Op', 'AND']);
    expect(highlightRanges('Chopin', '*"()')).toEqual([]);
  });

  it('handles astral characters before a match', () => {
    const text = '🎹 Chopin';
    expect(highlightRanges(text, 'chopin')).toEqual([[3, 9]]);
  });

  it('returns nothing for empty text or query', () => {
    expect(highlightRanges('', 'bach')).toEqual([]);
    expect(highlightRanges('Bach', '')).toEqual([]);
  });
});

describe('mergeRanges', () => {
  it('sorts and merges overlapping and touching ranges', () => {
    expect(
      mergeRanges([
        [10, 12],
        [0, 3],
        [2, 5],
        [5, 6],
        [11, 15],
      ]),
    ).toEqual([
      [0, 6],
      [10, 15],
    ]);
  });
});
