import { composerKey, knownComposers, lookupComposer } from '../composers';
import { parseFileName } from '../parseTitle';

type Case = [fileName: string, title: string, composer: string | null];

/** A corpus of real-world-looking filenames, grouped by the rule they exercise. */
const corpus: Record<string, Case[]> = {
  'extension, separators and whitespace': [
    ['Nocturne.pdf', 'Nocturne', null],
    ['Nocturne.PDF', 'Nocturne', null],
    ['Nocturne.pdf.pdf', 'Nocturne', null],
    ['  Moon  River   .pdf', 'Moon River', null],
    ['Clair.de.Lune.pdf', 'Clair de Lune', null],
    ['Autumn_Leaves.pdf', 'Autumn Leaves', null],
    ['__Autumn___Leaves__.pdf', 'Autumn Leaves', null],
    ['-- Autumn Leaves --.pdf', 'Autumn Leaves', null],
    ['/storage/emulated/0/Download/Autumn Leaves.pdf', 'Autumn Leaves', null],
    ['Rusalka Dvořák.pdf', 'Rusalka', 'Dvořák'],
    ['Sérénade.pdf', 'Sérénade', null],
  ],
  'Title - Composer / Composer - Title': [
    ['Nocturne - Chopin.pdf', 'Nocturne', 'Chopin'],
    ['Chopin - Nocturne.pdf', 'Nocturne', 'Chopin'],
    ['Clair de Lune - Debussy.pdf', 'Clair de Lune', 'Debussy'],
    ['Debussy – Clair de Lune.pdf', 'Clair de Lune', 'Debussy'],
    ['Gymnopédie No 1 — Satie.pdf', 'Gymnopédie No. 1', 'Satie'],
    ['Dvorak - Humoresque.pdf', 'Humoresque', 'Dvořák'],
    ['Humoresque - Dvořák.pdf', 'Humoresque', 'Dvořák'],
    ['J.S. Bach - Prelude in C.pdf', 'Prelude in C', 'J.S. Bach'],
    ['Bach, J.S. - Prelude in C.pdf', 'Prelude in C', 'Bach, J.S.'],
    ['Frédéric Chopin - Nocturne.pdf', 'Nocturne', 'Frédéric Chopin'],
    ['Autumn Leaves - Joseph Kosma.pdf', 'Autumn Leaves', 'Joseph Kosma'],
    ['Stevie Wonder - Isn’t She Lovely.pdf', 'Isn’t She Lovely', 'Stevie Wonder'],
    ['The Lark Ascending - Vaughan Williams.pdf', 'The Lark Ascending', 'Vaughan Williams'],
    ['Saint-Saëns - Le Cygne.pdf', 'Le Cygne', 'Saint-Saëns'],
    ['Handel - Hallelujah.pdf', 'Hallelujah', 'Handel'],
    ['Händel - Largo.pdf', 'Largo', 'Händel'],
    ['Blue Monk - Monk.pdf', 'Blue Monk', 'Monk'],
    ['Night and Day - Cole Porter.pdf', 'Night and Day', 'Cole Porter'],
    ['Tennessee Waltz - Stewart.pdf', 'Tennessee Waltz', 'Stewart'],
    ['Chopin - Nocturne - Op 9 No 2.pdf', 'Nocturne Op. 9 No. 2', 'Chopin'],
    ['Nocturne-Chopin.pdf', 'Nocturne', 'Chopin'],
  ],
  'Composer_Title, colon, parentheses and "by"': [
    ['Chopin_Nocturne_Op9.pdf', 'Nocturne Op. 9', 'Chopin'],
    ['Vaughan_Williams_The_Lark_Ascending.pdf', 'The Lark Ascending', 'Vaughan Williams'],
    ['Porter_Night_and_Day.pdf', 'Night and Day', 'Porter'],
    ['Chopin Nocturne Op 9 No 2.pdf', 'Nocturne Op. 9 No. 2', 'Chopin'],
    ['Clair de Lune Debussy.pdf', 'Clair de Lune', 'Debussy'],
    ['Ave Maria (Schubert).pdf', 'Ave Maria', 'Schubert'],
    ['Moon River (Henry Mancini).pdf', 'Moon River', 'Henry Mancini'],
    ['Summertime (Easy Version).pdf', 'Summertime (Easy Version)', null],
    ['Hey Jude by Lennon.pdf', 'Hey Jude', 'Lennon'],
    ['Yesterday by Paul McCartney.pdf', 'Yesterday', 'Paul McCartney'],
    ['Chopin: Ballade No. 1.pdf', 'Ballade No. 1', 'Chopin'],
    ['Hans Zimmer: Time.pdf', 'Time', 'Hans Zimmer'],
  ],
  'catalogue numbers stay in the title': [
    ['Nocturne Op.9 No.2 - Chopin.pdf', 'Nocturne Op. 9 No. 2', 'Chopin'],
    ['nocturne op9 no2.pdf', 'Nocturne Op. 9 No. 2', null],
    ['Nocturne op 9-2.pdf', 'Nocturne Op. 9-2', null],
    ['Prelude and Fugue BWV846 - Bach.pdf', 'Prelude and Fugue BWV 846', 'Bach'],
    ['Sonata K331 - Mozart.pdf', 'Sonata K. 331', 'Mozart'],
    ['Mozart - Sonata K. 331.pdf', 'Sonata K. 331', 'Mozart'],
    ['Haydn - Sonata Hob. XVI:52.pdf', 'Sonata Hob. XVI:52', 'Haydn'],
    ['haydn sonata hob xvi 52.pdf', 'Sonata Hob. XVI 52', 'Haydn'],
    ['Nocturne in D-flat - Chopin.pdf', 'Nocturne in D-flat', 'Chopin'],
    ['Prelude in F#-minor - Rachmaninoff.pdf', 'Prelude in F#-minor', 'Rachmaninoff'],
    ['Water Music HWV 349.pdf', 'Water Music HWV 349', null],
  ],
  'IMSLP names': [
    ['IMSLP01234-PMLP01234-Chopin_Nocturnes_Op9.pdf', 'Nocturnes Op. 9', 'Chopin'],
    ['IMSLP54321-PMLP02345-Beethoven_Sonata_No.14_Op.27_No.2.pdf', 'Sonata No. 14 Op. 27 No. 2', 'Beethoven'],
    ['IMSLP99999-Satie_Gymnopedies.pdf', 'Gymnopedies', 'Satie'],
    ['Gymnopedie 1 [IMSLP 12345].pdf', 'Gymnopedie 1', null],
  ],
  'noise tokens': [
    ['Nocturne scan.pdf', 'Nocturne', null],
    ['scan_Nocturne_final_v2.pdf', 'Nocturne', null],
    ['Nocturne (final).pdf', 'Nocturne', null],
    ['Nocturne - Copy.pdf', 'Nocturne', null],
    ['Copy of Nocturne.pdf', 'Nocturne', null],
    ['Nocturne (1).pdf', 'Nocturne', null],
    ['Nocturne final final2.pdf', 'Nocturne', null],
    ['Nocturne v2.1.pdf', 'Nocturne', null],
    ['Nocturne 2019-05-01.pdf', 'Nocturne', null],
    ['Nocturne_2019_05_01.pdf', 'Nocturne', null],
    ['2019-05-01 Nocturne - Chopin.pdf', 'Nocturne', 'Chopin'],
    ['Nocturne 20190501.pdf', 'Nocturne', null],
  ],
  'track numbers': [
    ['01 Clair de Lune.pdf', 'Clair de Lune', null],
    ['01. Clair de Lune.pdf', 'Clair de Lune', null],
    ['01 - Clair de Lune - Debussy.pdf', 'Clair de Lune', 'Debussy'],
    ['3. Allegro.pdf', 'Allegro', null],
    ['07_Autumn_Leaves.pdf', 'Autumn Leaves', null],
    ['01 1812 Overture.pdf', '1812 Overture', null],
  ],
  'casing': [
    ['moonlight sonata - beethoven.pdf', 'Moonlight Sonata', 'Beethoven'],
    ['MOONLIGHT SONATA - BEETHOVEN.pdf', 'Moonlight Sonata', 'Beethoven'],
    ['prelude in a minor.pdf', 'Prelude in A minor', null],
    ['the lord of the rings.pdf', 'The Lord of the Rings', null],
    ['ludwig van beethoven - fur elise.pdf', 'Fur Elise', 'Ludwig van Beethoven'],
    ['DVOŘÁK - RUSALKA.pdf', 'Rusalka', 'Dvořák'],
    ['sonata no 2 movement ii.pdf', 'Sonata No. 2 Movement II', null],
    ['iPhone Suite.pdf', 'iPhone Suite', null],
    ['Sonata in c minor.pdf', 'Sonata in c minor', null],
  ],
  'tricky negatives': [
    ['1812 Overture.pdf', '1812 Overture', null],
    ['3 Gymnopédies.pdf', '3 Gymnopédies', null],
    ['12 Etudes Op 10.pdf', '12 Etudes Op. 10', null],
    ['The Final Countdown.pdf', 'The Final Countdown', null],
    ['Stand by Me.pdf', 'Stand by Me', null],
    ['Stand By Your Man.pdf', 'Stand By Your Man', null],
    ['Variations on a Theme by Haydn.pdf', 'Variations on a Theme by Haydn', null],
    ['Berlin Blues.pdf', 'Berlin Blues', null],
    ['Carmen: Habanera.pdf', 'Carmen: Habanera', null],
    ['Autumn Leaves - Jazz Trio.pdf', 'Autumn Leaves - Jazz Trio', null],
    ['Hommage à Rameau.pdf', 'Hommage à Rameau', null],
    ['Chopin.pdf', 'Chopin', null],
    ['1-2-3 Waltz.pdf', '1-2-3 Waltz', null],
    ['Bach and Handel Arias.pdf', 'Bach and Handel Arias', null],
    ['Williams Mix.pdf', 'Williams Mix', null],
  ],
  'never empty': [
    ['.pdf', '.pdf', null],
    ['final.pdf', 'final', null],
    ['01.pdf', '01', null],
    ['(1).pdf', '(1)', null],
    ['', 'Untitled', null],
  ],
};

describe('parseFileName', () => {
  for (const [group, cases] of Object.entries(corpus)) {
    describe(group, () => {
      it.each(cases)('%s → %s / %s', (fileName, title, composer) => {
        expect(parseFileName(fileName)).toEqual({ title, composer });
      });
    });
  }

  it('corpus is large enough to trust', () => {
    expect(Object.values(corpus).flat().length).toBeGreaterThanOrEqual(60);
  });

  describe('folder hint', () => {
    it.each([
      ['Nocturne Op 9 No 2.pdf', 'Chopin', 'Nocturne Op. 9 No. 2', 'Chopin'],
      ['Nocturne.pdf', 'Scores/Piano/Chopin', 'Nocturne', 'Chopin'],
      ['Nocturne.pdf', 'Scores\\Chopin\\', 'Nocturne', 'Chopin'],
      ['Prelude in C.pdf', 'J.S. Bach', 'Prelude in C', 'J.S. Bach'],
      ['Humoresque.pdf', 'dvorak', 'Humoresque', 'Dvořák'],
      ['Night and Day.pdf', 'Cole_Porter', 'Night and Day', 'Cole Porter'],
    ])('%s in %s', (fileName, folder, title, composer) => {
      expect(parseFileName(fileName, folder)).toEqual({ title, composer });
    });

    it('the file’s own composer wins over the folder', () => {
      expect(parseFileName('Clair de Lune - Debussy.pdf', 'Chopin')).toEqual({ title: 'Clair de Lune', composer: 'Debussy' });
    });

    it.each([['Imports'], ['Piano'], ['2024 Recital'], ['Berlin'], ['']])('ignores a folder that is not a composer: %j', folder => {
      expect(parseFileName('Nocturne.pdf', folder).composer).toBeNull();
    });
  });

  it('never returns an empty title', () => {
    for (const name of ['', ' ', '.pdf', '-.pdf', '_ _.pdf', 'scan.pdf', 'copy (1).pdf', '2019-05-01.pdf', '[IMSLP123].pdf']) {
      expect(parseFileName(name).title.trim()).not.toBe('');
    }
  });

  it('keeps precomposed diacritics even when the file system gives decomposed ones', () => {
    const decomposed = 'Humoresque - Dvořák.pdf';
    expect(parseFileName(decomposed)).toEqual({ title: 'Humoresque', composer: 'Dvořák' });
  });
});

describe('composer list', () => {
  it('has the expected size and the names the parser relies on', () => {
    expect(knownComposers().length).toBeGreaterThanOrEqual(150);
    for (const name of ['Bach', 'Chopin', 'Kosma', 'Jobim', 'Yiruma', 'Hisaishi', 'Whitacre', 'Pärt', 'Kodály', 'Bartók']) {
      expect(lookupComposer(name)).toBeDefined();
    }
  });

  it('looks names up ignoring case, accents, hyphens and apostrophes', () => {
    expect(lookupComposer('dvorak')?.name).toBe('Dvořák');
    expect(lookupComposer('DVOŘÁK')?.name).toBe('Dvořák');
    expect(lookupComposer('faure')?.name).toBe('Fauré');
    expect(lookupComposer('Saint Saens')?.name).toBe('Saint-Saëns');
    expect(lookupComposer('saint-saëns')?.name).toBe('Saint-Saëns');
    expect(lookupComposer('Händel')?.name).toBe('Handel');
    expect(lookupComposer('dIndy')?.name).toBe("d'Indy");
    expect(lookupComposer('vaughan williams')?.words).toBe(2);
    expect(lookupComposer('Nocturne')).toBeUndefined();
  });

  it('flags surnames that are everyday words', () => {
    expect(lookupComposer('Berlin')?.ambiguous).toBe(true);
    expect(lookupComposer('Chopin')?.ambiguous).toBe(false);
  });

  it('keys are stable', () => {
    expect(composerKey('Lutosławski')).toBe('lutoslawski');
    expect(composerKey("d'Indy")).toBe('dindy');
  });
});

describe('tight hyphens and canonical spelling', () => {
  it.each([
    ['Autumn_Leaves-Kosma.pdf', 'Autumn Leaves', 'Kosma'],
    ['Chopin-Nocturne Op9 No2.pdf', 'Nocturne Op. 9 No. 2', 'Chopin'],
    ['Danse Macabre-Saint-Saens.pdf', 'Danse Macabre', 'Saint-Saëns'],
    ['Prelude in D-flat.pdf', 'Prelude in D-flat', null],
    ['Dvorak - Humoresque.pdf', 'Humoresque', 'Dvořák'],
  ])('%s', (file, title, composer) => {
    expect(parseFileName(file)).toEqual({ title, composer });
  });
});
