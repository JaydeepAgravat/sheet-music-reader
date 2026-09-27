import {
  CRASH_LOG_LINES,
  MAX_REPORT_CHARS,
  deviceSummary,
  describeError,
  formatAppLog,
  formatJsCrashBody,
  formatSharedReport,
  mailtoUri,
  truncateReport,
  versionLine,
} from '../crashReport';

const info = { appName: 'Score Reader', version: '1.0.0', build: 12, android: '15', sdk: 35, device: 'Samsung SM-X710' };

describe('truncateReport', () => {
  it('leaves short text alone', () => {
    expect(truncateReport('abc', 10)).toBe('abc');
  });

  it('keeps head and tail, exactly within budget, with a marker', () => {
    const text = 'H'.repeat(5000) + 'M'.repeat(100_000) + 'T'.repeat(5000);
    const out = truncateReport(text, 2000);
    expect(out).toHaveLength(2000);
    expect(out.startsWith('HHHH')).toBe(true);
    expect(out.endsWith('TTTT')).toBe(true);
    expect(out).toMatch(/\[\d+ characters cut\]/);
  });

  it('defaults to the 64 KB cap', () => {
    expect(truncateReport('x'.repeat(MAX_REPORT_CHARS * 2))).toHaveLength(MAX_REPORT_CHARS);
  });

  it('never splits a surrogate pair', () => {
    const out = truncateReport('😀'.repeat(1000), 301);
    for (let i = 0; i < out.length; i++) {
      const c = out.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff) {
        const n = out.charCodeAt(i + 1);
        expect(n >= 0xdc00 && n <= 0xdfff).toBe(true);
      }
      if (c >= 0xdc00 && c <= 0xdfff) {
        const p = out.charCodeAt(i - 1);
        expect(p >= 0xd800 && p <= 0xdbff).toBe(true);
      }
    }
  });
});

describe('describeError', () => {
  it('reads Errors, including a React component stack', () => {
    const e = Object.assign(new TypeError('x is undefined'), { componentStack: '\n    in Reader\n    in App' });
    const d = describeError(e);
    expect(d.name).toBe('TypeError');
    expect(d.message).toBe('x is undefined');
    expect(d.componentStack).toContain('in Reader');
  });

  it('handles thrown strings, objects and cycles', () => {
    expect(describeError('boom').message).toBe('boom');
    expect(describeError({ code: 3 }).message).toBe('{"code":3}');
    const cyc: Record<string, unknown> = {};
    cyc.self = cyc;
    expect(describeError(cyc).message).toBe('[object Object]');
    expect(describeError(undefined).message).toBe('undefined');
  });
});

describe('formatJsCrashBody', () => {
  it('has message, frames (without repeating the title), component stack and the recent log', () => {
    const e = Object.assign(new Error('bad page'), {
      stack: 'Error: bad page\n    at render (app.js:1:2)\n    at commit (app.js:3:4)',
      componentStack: '\n    in PageView\n    in Reader',
    });
    const body = formatJsCrashBody(e, true, ['10:00:00.000 I opened reader', '10:00:01.000 E oops']);
    expect(body).toBe(
      [
        'JavaScript error (fatal)',
        'Error: bad page',
        'Stack:\n    at render (app.js:1:2)\n    at commit (app.js:3:4)',
        'Component stack:\n    in PageView\n    in Reader',
        'Recent log (2 lines):\n10:00:00.000 I opened reader\n10:00:01.000 E oops',
      ].join('\n\n'),
    );
  });

  it('keeps only the last 50 log lines and omits empty sections', () => {
    const lines = Array.from({ length: 80 }, (_, i) => `line ${i}`);
    const body = formatJsCrashBody('plain', false, lines);
    expect(body.startsWith('JavaScript error\n\nThrown value: plain\n\nRecent log (50 lines):\nline 30\n')).toBe(true);
    expect(body).not.toContain('Stack:');
    expect(body).not.toContain('line 29\n');
    expect(CRASH_LOG_LINES).toBe(50);
  });

  it('stays under the cap for huge stacks', () => {
    const e = Object.assign(new Error('deep'), { stack: 'Error: deep\n' + '    at f (x.js:1:1)\n'.repeat(20_000) });
    expect(formatJsCrashBody(e, true, []).length).toBeLessThanOrEqual(MAX_REPORT_CHARS);
  });
});

describe('sharing text', () => {
  it('formats version and device lines', () => {
    expect(versionLine(info)).toBe('Score Reader 1.0.0 (build 12)');
    expect(deviceSummary(info)).toBe('Score Reader 1.0.0 (build 12)\nAndroid 15 (API 35) · Samsung SM-X710');
  });

  it('formats the app log, also when empty', () => {
    expect(formatAppLog(info, ['a', 'b'])).toContain('Recent log (2 lines):\na\nb\n');
    expect(formatAppLog(info, [])).toContain('(no log lines yet)');
  });

  it('puts the human note above the report', () => {
    expect(formatSharedReport(' Hi. ', 'REPORT\n\n')).toBe('Hi.\n\nREPORT\n');
  });

  it('percent-encodes mailto components', () => {
    expect(mailtoUri('support@example.com', 'Help & more', 'Line 1\nLine 2 ?=')).toBe(
      'mailto:support@example.com?subject=Help%20%26%20more&body=Line%201%0ALine%202%20%3F%3D',
    );
  });
});
