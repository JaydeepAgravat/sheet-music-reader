import { loadLicenses } from '../licenseData';

describe('licenses.json (npm run licenses)', () => {
  const data = loadLicenses();
  const all = data.groups.flatMap(g => g.items);

  it('has the three groups in order, none empty', () => {
    expect(data.version).toBe(1);
    expect(data.groups.map(g => g.id)).toEqual(['fonts', 'icons', 'libraries']);
    for (const g of data.groups) expect(g.items.length).toBeGreaterThan(0);
  });

  it('every item is well-formed and its text exists', () => {
    for (const item of all) {
      expect(typeof item.id).toBe('string');
      expect(item.name.length).toBeGreaterThan(0);
      expect(typeof item.version).toBe('string');
      expect(item.license.length).toBeGreaterThan(0);
      expect(item.license).not.toBe('UNKNOWN');
      expect(typeof item.copyright).toBe('string');
      expect(typeof item.url).toBe('string');
      expect((data.texts[item.textId] ?? '').length).toBeGreaterThan(40);
    }
  });

  it('ids are unique and texts are all referenced', () => {
    const allIds = ids(all);
    expect(new Set(allIds).size).toBe(allIds.length);
    const used = new Set(all.map(i => i.textId));
    expect(Object.keys(data.texts).filter(k => !used.has(k))).toEqual([]);
  });

  it('credits the bundled fonts under the OFL with their copyright lines', () => {
    const fonts = data.groups.find(g => g.id === 'fonts')?.items ?? [];
    expect(fonts.map(f => f.name)).toEqual(expect.arrayContaining(['Inter', 'Source Serif 4', expect.stringContaining('Bravura')]));
    for (const f of fonts) {
      expect(f.license).toBe('OFL-1.1');
      expect(f.copyright).toMatch(/copyright/i);
      expect(data.texts[f.textId]).toContain('SIL OPEN FONT LICENSE Version 1.1');
    }
    expect(fonts.find(f => f.name.includes('Bravura'))?.copyright).toContain('Steinberg');
  });

  it('includes Phosphor, the runtime npm dependencies and the core Android libraries', () => {
    expect(all.find(i => i.id === 'icons:phosphor')?.license).toBe('MIT');
    const pkg = require('../../../../package.json') as { dependencies: Record<string, string> };
    for (const dep of Object.keys(pkg.dependencies)) expect(ids(all)).toContain(`npm:${dep}`);
    for (const id of ['android:react-native', 'android:hermes', 'android:androidx', 'android:play-billing']) expect(ids(all)).toContain(id);
  });

  it('libraries are sorted by name', () => {
    const names = (data.groups.find(g => g.id === 'libraries')?.items ?? []).map(i => i.name.toLowerCase());
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});

function ids(items: { id: string }[]): string[] {
  return items.map(i => i.id);
}
