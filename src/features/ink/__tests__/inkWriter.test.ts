import { flushInk, INK_FLUSH_DELAY_MS, pendingInkChanges, queueDelete, queueInsert, resetInkWriterForTests } from '../inkWriter';
import * as inkRepo from '@/data/repos/ink';
import { inkCount, insertStrokes, listInk, type InkStrokeRow } from '@/data/repos/ink';
import { insertScore } from '@/data/repos/scores';
import { floatsToBytes } from '@/domain/ink/base64';
import { createTestDb } from '@/data/testing/testDb';

let scoreId = '';
const row = (id: string, seq = 1, sid = scoreId): InkStrokeRow => ({
  id,
  scoreId: sid,
  page: 0,
  layer: 0,
  kind: 'PEN',
  color: 0xff4a4a4a,
  width: 1.1,
  points: floatsToBytes([0.1, 0.1, 1, 0.2, 0.2, 1]),
  seq,
  createdAt: seq,
});

describe('ink writer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    createTestDb();
    resetInkWriterForTests();
    scoreId = insertScore({ title: 'T', filePath: '/t.pdf', fileHash: 't', fileSize: 1, pageCount: 1 });
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('flushes once after 400 ms of quiet, in one transaction', () => {
    const spy = jest.spyOn(inkRepo, 'applyInkChanges');
    queueInsert([row('a', 1)]);
    jest.advanceTimersByTime(300);
    queueInsert([row('b', 2)]); // restarts the idle timer
    jest.advanceTimersByTime(INK_FLUSH_DELAY_MS - 1);
    expect(inkCount(scoreId)).toBe(0);
    jest.advanceTimersByTime(1);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(listInk(scoreId).map(s => s.id)).toEqual(['a', 'b']);
    expect(pendingInkChanges()).toBe(0);
  });

  it('flushInk writes immediately and cancels the timer', () => {
    const spy = jest.spyOn(inkRepo, 'applyInkChanges');
    queueInsert([row('a')]);
    flushInk();
    expect(inkCount(scoreId)).toBe(1);
    jest.advanceTimersByTime(1000);
    expect(spy).toHaveBeenCalledTimes(1);
    flushInk(); // nothing queued: no write
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('an insert then delete of the same id before a flush cancels out', () => {
    const spy = jest.spyOn(inkRepo, 'applyInkChanges');
    queueInsert([row('a'), row('b')]);
    queueDelete(['a']);
    flushInk();
    expect(spy).toHaveBeenCalledWith([expect.objectContaining({ id: 'b' })], ['a']);
    expect(listInk(scoreId).map(s => s.id)).toEqual(['b']);
  });

  it('delete then re-insert (undo of an erase) keeps the stroke', () => {
    insertStrokes([row('a')]);
    queueDelete(['a']);
    queueInsert([row('a')]);
    flushInk();
    expect(listInk(scoreId).map(s => s.id)).toEqual(['a']);
    queueDelete(['a']);
    jest.advanceTimersByTime(INK_FLUSH_DELAY_MS);
    expect(inkCount(scoreId)).toBe(0);
  });

  it('survives a failing flush: good rows are still saved, bad ones logged and dropped', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    queueInsert([row('good', 1), row('orphan', 2, 'no-such-score')]);
    expect(() => flushInk()).not.toThrow();
    expect(listInk(scoreId).map(s => s.id)).toEqual(['good']);
    expect(warn).toHaveBeenCalled();
    expect(pendingInkChanges()).toBe(0);
    // Keeps working afterwards.
    queueInsert([row('next', 3)]);
    jest.advanceTimersByTime(INK_FLUSH_DELAY_MS);
    expect(inkCount(scoreId)).toBe(2);
  });

  it('survives the timer-driven flush throwing everywhere', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(inkRepo, 'applyInkChanges').mockImplementation(() => {
      throw new Error('disk full');
    });
    queueInsert([row('a')]);
    queueDelete(['x']);
    expect(() => jest.advanceTimersByTime(INK_FLUSH_DELAY_MS)).not.toThrow();
    expect(warn).toHaveBeenCalled();
    expect(pendingInkChanges()).toBe(0);
  });
});
