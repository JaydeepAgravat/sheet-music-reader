jest.mock('@/specs/NativeSupport', () => ({
  __esModule: true,
  default: { recordJsCrash: jest.fn(() => true), takeCrashReport: jest.fn(() => null), shareText: jest.fn(), appInfo: jest.fn() },
}));

import NativeSupport from '@/specs/NativeSupport';
import { clearLog, logInfo, recentLog } from '@/platform/log';
import { installCrashHandler } from '../crashHandler';

describe('installCrashHandler', () => {
  const previous = jest.fn();
  const record = NativeSupport!.recordJsCrash as jest.Mock;

  beforeAll(() => {
    ErrorUtils.setGlobalHandler(previous);
    installCrashHandler();
    installCrashHandler(); // idempotent
  });
  beforeEach(() => {
    previous.mockClear();
    record.mockClear();
    clearLog();
  });

  it('records fatal errors synchronously with the recent log, then chains', () => {
    logInfo('opened reader');
    const error = new Error('boom');
    ErrorUtils.getGlobalHandler()(error, true);
    expect(record).toHaveBeenCalledTimes(1);
    const body = record.mock.calls[0][0] as string;
    expect(body).toContain('JavaScript error (fatal)');
    expect(body).toContain('Error: boom');
    expect(body).toContain('I opened reader');
    expect(previous).toHaveBeenCalledWith(error, true);
    expect(record.mock.invocationCallOrder[0]).toBeLessThan(previous.mock.invocationCallOrder[0]!);
  });

  it('only logs non-fatal errors', () => {
    const error = new Error('soft');
    ErrorUtils.getGlobalHandler()(error, false);
    expect(record).not.toHaveBeenCalled();
    expect(recentLog().join('\n')).toContain('Uncaught: Error: soft');
    expect(previous).toHaveBeenCalledWith(error, false);
  });

  it('still chains when recording throws', () => {
    record.mockImplementationOnce(() => {
      throw new Error('disk full');
    });
    const error = new Error('boom');
    ErrorUtils.getGlobalHandler()(error, true);
    expect(previous).toHaveBeenCalledWith(error, true);
  });
});
