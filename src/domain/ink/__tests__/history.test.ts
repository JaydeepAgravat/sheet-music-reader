import { createInkHistory, inverseOp, type InkOp } from '../history';

type S = { id: string };
const add = (...ids: string[]): InkOp<S> => ({ type: 'add', strokes: ids.map(id => ({ id })) });
const remove = (...ids: string[]): InkOp<S> => ({ type: 'remove', strokes: ids.map(id => ({ id })) });

describe('ink history', () => {
  it('undoes and redoes in LIFO order', () => {
    const h = createInkHistory<S>();
    expect(h.canUndo()).toBe(false);
    expect(h.undo()).toBeNull();
    h.push(add('a'));
    h.push(add('b'));
    h.push(remove('a', 'b')); // clear page
    expect(h.undo()).toEqual(remove('a', 'b'));
    expect(h.undo()).toEqual(add('b'));
    expect(h.canRedo()).toBe(true);
    expect(h.redo()).toEqual(add('b'));
    expect(h.redo()).toEqual(remove('a', 'b'));
    expect(h.redo()).toBeNull();
    expect(h.canRedo()).toBe(false);
  });

  it('a new edit clears redo', () => {
    const h = createInkHistory<S>();
    h.push(add('a'));
    h.undo();
    expect(h.canRedo()).toBe(true);
    h.push(add('b'));
    expect(h.canRedo()).toBe(false);
    expect(h.undo()).toEqual(add('b'));
    expect(h.undo()).toBeNull();
  });

  it('ignores empty ops, respects the limit, and clears', () => {
    const h = createInkHistory<S>(3);
    h.push(add());
    expect(h.canUndo()).toBe(false);
    ['a', 'b', 'c', 'd', 'e'].forEach(id => h.push(add(id)));
    const undone: string[] = [];
    let op: InkOp<S> | null;
    while ((op = h.undo())) undone.push(op.strokes[0]!.id);
    expect(undone).toEqual(['e', 'd', 'c']);
    h.clear();
    expect(h.canUndo() || h.canRedo()).toBe(false);
  });

  it('inverts ops', () => {
    expect(inverseOp(add('a'))).toEqual(remove('a'));
    expect(inverseOp(remove('a'))).toEqual(add('a'));
  });
});
