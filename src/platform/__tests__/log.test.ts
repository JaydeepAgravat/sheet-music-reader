import { clearLog, log, logError, logInfo, recentLog } from '../log';

describe('log ring buffer', () => {
  beforeEach(clearLog);

  it('stamps lines with time and level, joining parts', () => {
    logInfo('opened', { id: 3 }, 7);
    expect(recentLog()).toEqual([expect.stringMatching(/^\d\d:\d\d:\d\d\.\d{3} I opened \{"id":3\} 7$/)]);
  });

  it('keeps the newest 100 lines and returns the last n oldest-first', () => {
    for (let i = 0; i < 150; i++) log('I', `n${i}`);
    expect(recentLog(200)).toHaveLength(100);
    expect(recentLog(2).map(l => l.split(' ').pop())).toEqual(['n148', 'n149']);
  });

  it('flattens newlines and caps long lines', () => {
    logError(new Error('a\nb'), 'x'.repeat(1000));
    const line = recentLog()[0] ?? '';
    expect(line).toContain('E Error: a ⏎ b');
    expect(line.length).toBeLessThan(430);
  });
});
