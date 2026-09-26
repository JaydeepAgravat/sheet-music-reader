import deDict from '../locales/de.json';
import enDict from '../locales/en.json';
import esDict from '../locales/es.json';
import frDict from '../locales/fr.json';
import itDict from '../locales/it.json';
import jaDict from '../locales/ja.json';

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

const reference = keys(enDict).sort();

describe.each([
  ['de', deDict],
  ['es', esDict],
  ['fr', frDict],
  ['it', itDict],
  ['ja', jaDict],
])('%s locale', (_lang, dict) => {
  it('has exactly the same keys as English', () => {
    expect(keys(dict).sort()).toEqual(reference);
  });

  it('keeps every {{placeholder}} from English', () => {
    const get = (o: any, path: string) => path.split('.').reduce((a, k) => a?.[k], o);
    for (const key of reference) {
      const want = String(get(enDict, key)).match(/\{\{\w+\}\}/g) ?? [];
      const got = String(get(dict, key)).match(/\{\{\w+\}\}/g) ?? [];
      expect({ key, placeholders: got.sort() }).toEqual({ key, placeholders: want.sort() });
    }
  });
});
