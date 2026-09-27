import { LimitGate } from '../limitGate';

describe('LimitGate', () => {
  it('hands out slots up to the limit, then refuses', async () => {
    const g = new LimitGate(2);
    expect(await g.acquire()).toBe(true);
    g.commit();
    expect(await g.acquire()).toBe(true);
    g.commit();
    expect(await g.acquire()).toBe(false);
  });

  it('gives a released slot back (duplicate / failed copy)', async () => {
    const g = new LimitGate(1);
    expect(await g.acquire()).toBe(true);
    g.release();
    expect(await g.acquire()).toBe(true);
    g.commit();
    expect(await g.acquire()).toBe(false);
  });

  it('waits for in-flight slots instead of refusing early', async () => {
    const g = new LimitGate(1);
    expect(await g.acquire()).toBe(true);
    const waiting = g.acquire();
    let settled: boolean | null = null;
    waiting.then(v => (settled = v));
    await Promise.resolve();
    expect(settled).toBeNull(); // still waiting on the in-flight file
    g.release(); // it was a duplicate
    expect(await waiting).toBe(true);
  });

  it('refuses a waiter once the in-flight slot is spent', async () => {
    const g = new LimitGate(1);
    await g.acquire();
    const waiting = g.acquire();
    g.commit();
    expect(await waiting).toBe(false);
  });

  it('is unlimited for Infinity and closed for 0', async () => {
    const pro = new LimitGate(Infinity);
    for (let i = 0; i < 100; i++) expect(await pro.acquire()).toBe(true);
    expect(await new LimitGate(0).acquire()).toBe(false);
  });
});
