import { planImport } from '../dedupe';

const f = (hash: string, name = `${hash}.pdf`) => ({ hash, name });

describe('planImport', () => {
  it('imports everything when nothing is known', () => {
    const files = [f('a'), f('b'), f('c')];
    expect(planImport(files, new Set())).toEqual({ toImport: files, duplicates: [] });
  });

  it('skips files already in the library', () => {
    const plan = planImport([f('a'), f('b'), f('c')], new Set(['b']));
    expect(plan.toImport.map(x => x.hash)).toEqual(['a', 'c']);
    expect(plan.duplicates).toEqual([{ file: f('b'), reason: 'library' }]);
  });

  it('keeps the first of several identical files in one batch', () => {
    const plan = planImport([f('a', 'Nocturne.pdf'), f('b'), f('a', 'Nocturne (1).pdf'), f('a', 'copy.pdf')], new Set());
    expect(plan.toImport).toEqual([f('a', 'Nocturne.pdf'), f('b')]);
    expect(plan.duplicates).toEqual([
      { file: f('a', 'Nocturne (1).pdf'), reason: 'batch' },
      { file: f('a', 'copy.pdf'), reason: 'batch' },
    ]);
  });

  it('a library duplicate repeated in the batch is always a library duplicate', () => {
    const plan = planImport([f('x'), f('x')], new Set(['x']));
    expect(plan.toImport).toEqual([]);
    expect(plan.duplicates.map(d => d.reason)).toEqual(['library', 'library']);
  });

  it('judges by content hash, not name', () => {
    const plan = planImport([f('a', 'Nocturne.pdf'), f('b', 'Nocturne.pdf')], new Set());
    expect(plan.toImport).toHaveLength(2);
  });

  it('keeps order and passes extra fields through', () => {
    const files = [
      { hash: 'c', name: 'c.pdf', uri: 'content://3' },
      { hash: 'a', name: 'a.pdf', uri: 'content://1' },
      { hash: 'c', name: 'c2.pdf', uri: 'content://4' },
      { hash: 'b', name: 'b.pdf', uri: 'content://2' },
    ];
    const plan = planImport(files, new Set(['a']));
    expect(plan.toImport.map(x => x.uri)).toEqual(['content://3', 'content://2']);
    expect(plan.duplicates.map(d => d.file.uri)).toEqual(['content://1', 'content://4']);
  });

  it('handles an empty batch', () => {
    expect(planImport([], new Set(['a']))).toEqual({ toImport: [], duplicates: [] });
  });
});
