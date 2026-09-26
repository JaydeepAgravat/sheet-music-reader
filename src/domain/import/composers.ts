/**
 * Well-known composer and songwriter surnames, used by the filename parser to decide which side of
 * "Chopin - Nocturne" is the composer. Lookup ignores case, accents and hyphens, so "Dvorak",
 * "DVOŘÁK" and "dvořák" are the same name, as are "Saint-Saëns" and "saint saens".
 */
import { normalizeForSearch } from '../search/query';

/**
 * Surnames that are also everyday words or places ("Berlin", "Porter", "Wonder"). They still count
 * next to an explicit separator ("Night and Day - Porter") but never on their own inside a
 * space-separated name, where "Berlin Blues" is far more likely a title.
 */
const AMBIGUOUS = [
  'Adams', 'Barber', 'Berg', 'Berlin', 'Bliss', 'Davis', 'Evans', 'Field', 'Gibbons', 'Glass', 'Hart',
  'Ireland', 'King', 'Mercer', 'Monk', 'Nazareth', 'Parker', 'Parry', 'Porter', 'Reich', 'Shore', 'Silver',
  'Sor', 'Stanford', 'Victoria', 'Watts', 'Williams', 'Wolf', 'Wonder', 'Young',
];

const COMPOSERS = [
  // Medieval, Renaissance, Baroque
  'Hildegard', 'Machaut', 'Josquin', 'Lassus', 'Palestrina', 'Victoria', 'Byrd', 'Tallis', 'Gibbons',
  'Dowland', 'Morley', 'Weelkes', 'Allegri', 'Gabrieli', 'Monteverdi', 'Schütz', 'Purcell', 'Lully',
  'Charpentier', 'Couperin', 'Rameau', 'Corelli', 'Albinoni', 'Vivaldi', 'Pachelbel', 'Buxtehude',
  'Telemann', 'Bach', 'Handel', 'Haendel', 'Scarlatti', 'Pergolesi', 'Tartini',
  // Classical
  'Gluck', 'Haydn', 'Mozart', 'Boccherini', 'Clementi', 'Salieri', 'Beethoven', 'Hummel', 'Czerny',
  'Diabelli', 'Kuhlau', 'Burgmüller', 'Field',
  // Romantic
  'Schubert', 'Weber', 'Rossini', 'Donizetti', 'Bellini', 'Paganini', 'Berlioz', 'Mendelssohn',
  'Chopin', 'Schumann', 'Liszt', 'Wagner', 'Verdi', 'Gounod', 'Offenbach', 'Franck', 'Smetana',
  'Brahms', 'Bruch', 'Borodin', 'Saint-Saëns', 'Delibes', 'Bizet', 'Mussorgsky', 'Moussorgsky',
  'Tchaikovsky', 'Tschaikowsky', 'Tchaikowsky', 'Dvořák', 'Grieg', 'Massenet', 'Sarasate',
  'Rimsky-Korsakov', 'Fauré', 'Humperdinck', 'Janáček', 'Elgar', 'Puccini', 'Leoncavallo', 'Mahler',
  'Wolf', 'Albéniz', 'Granados', 'Moszkowski', 'Paderewski', 'Chaminade', 'Wieniawski', 'Ysaÿe',
  'Popper', 'Widor', 'Vierne', 'Guilmant', 'Gigout', 'Boëllmann', 'Bruckner', 'Stanford', 'Parry',
  'Sullivan', 'Chabrier', 'Duparc', 'Chausson', "d'Indy", 'Glinka', 'Balakirev', 'Glazunov',
  'Lyadov', 'Arensky', 'Tárrega', 'Giuliani', 'Carcassi', 'Sor',
  // 20th century and later
  'Debussy', 'Satie', 'Ravel', 'Dukas', 'Roussel', 'Ibert', 'Milhaud', 'Honegger', 'Poulenc',
  'Messiaen', 'Duruflé', 'Boulanger', 'Sibelius', 'Nielsen', 'Rachmaninoff', 'Rachmaninov',
  'Rakhmaninov', 'Scriabin', 'Skryabin', 'Medtner', 'Prokofiev', 'Prokofieff', 'Shostakovich',
  'Schostakowitsch', 'Stravinsky', 'Strawinsky', 'Khachaturian', 'Kabalevsky', 'Schnittke',
  'Gubaidulina', 'Pärt', 'Górecki', 'Penderecki', 'Lutosławski', 'Szymanowski', 'Bartók', 'Kodály',
  'Ligeti', 'Enescu', 'Martinů', 'Strauss', 'Reger', 'Hindemith', 'Weill', 'Orff', 'Schoenberg',
  'Schönberg', 'Berg', 'Webern', 'Korngold', 'Holst', 'Vaughan Williams', 'Delius', 'Britten',
  'Tippett', 'Walton', 'Finzi', 'Howells', 'Ireland', 'Bliss', 'Tavener', 'Rutter', 'Chilcott',
  'Lauridsen', 'Whitacre', 'Gjeilo', 'Ešenvalds', 'Chesnokov', 'Bortniansky', 'Falla', 'Rodrigo',
  'Villa-Lobos', 'Ginastera', 'Piazzolla', 'Barrios', 'Ives', 'Copland', 'Barber', 'Bernstein',
  'Glass', 'Reich', 'Adams', 'Einaudi', 'Tiersen', 'Yiruma', 'Hisaishi', 'Sakamoto', 'Richter',
  'Arnalds', 'Frahm', 'Nyman',
  // Film and games
  'Williams', 'Zimmer', 'Morricone', 'Shore', 'Horner', 'Elfman', 'Giacchino', 'Desplat', 'Badelt',
  'Djawadi', 'Uematsu',
  // Ragtime, jazz, song and musical theatre
  'Joplin', 'Gershwin', 'Ellington', 'Strayhorn', 'Monk', 'Kosma', 'Jobim', 'Porter', 'Kern',
  'Berlin', 'Rodgers', 'Hammerstein', 'Hart', 'Arlen', 'Carmichael', 'Mercer', 'Waller', 'Gillespie',
  'Parker', 'Coltrane', 'Mingus', 'Brubeck', 'Corea', 'Hancock', 'Evans', 'Davis', 'Shorter',
  'Silver', 'Jarrett', 'Metheny', 'Gardel', 'Nazareth', 'Legrand', 'Bacharach', 'Sondheim',
  'Lloyd Webber', 'Menken', 'Mancini', 'Lennon', 'McCartney', 'Wonder', 'Young', 'King',
  // Hymn writers
  'Wesley', 'Watts', 'Crüger', 'Vulpius', 'Praetorius',
];

export type KnownComposer = {
  /** The canonical spelling from the list (the parser keeps the user's own spelling). */
  name: string;
  /** Also an everyday word or place; see AMBIGUOUS. */
  ambiguous: boolean;
  /** Number of words in the name ("Vaughan Williams" = 2). */
  words: number;
};

/** Accent-, case- and punctuation-insensitive key: "Saint-Saëns" → "saint saens", "d'Indy" → "dindy". */
export function composerKey(name: string): string {
  return normalizeForSearch(name.replace(/['’`]/g, '').replace(/[-‐–]/g, ' '));
}

const ambiguousKeys = new Set(AMBIGUOUS.map(composerKey));
const byKey = new Map<string, KnownComposer>();
for (const name of COMPOSERS) {
  const key = composerKey(name);
  byKey.set(key, { name, ambiguous: ambiguousKeys.has(key), words: key.split(' ').length });
}

/** The longest name in the list, in words; callers never need to try longer word runs. */
export const MAX_COMPOSER_WORDS = Math.max(...[...byKey.values()].map(c => c.words));

/** The known composer whose name is exactly `name` (any case/accents), if any. */
export function lookupComposer(name: string): KnownComposer | undefined {
  return byKey.get(composerKey(name));
}

/** Every entry, for tests and for suggestions in the title-review card. */
export function knownComposers(): KnownComposer[] {
  return [...byKey.values()];
}
