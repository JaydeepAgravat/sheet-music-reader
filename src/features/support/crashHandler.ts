import NativeSupport from '@/specs/NativeSupport';
import { captureConsole, logError, recentLog } from '@/platform/log';
import { formatJsCrashBody } from './crashReport';

let installed = false;

/**
 * Wraps RN's global JS error handler: a fatal error is written to disk synchronously (native
 * recordJsCrash) before the previous handler runs and the app goes down. Non-fatal errors only go
 * to the in-memory log. Nothing is ever sent; the next launch asks the user (CrashPromptHost).
 *
 * Uncaught render errors skip ErrorUtils (React reports them straight to ExceptionsManager); in
 * release they surface natively as a JavascriptException whose message includes the component
 * stack, and android/.../support/CrashCapture records that one.
 */
export function installCrashHandler(): void {
  if (installed) return;
  installed = true;
  captureConsole();
  const previous = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
    try {
      logError(isFatal ? 'Fatal:' : 'Uncaught:', error);
      if (isFatal) NativeSupport?.recordJsCrash(formatJsCrashBody(error, true, recentLog()));
    } catch {
      // Recording must never mask the original error.
    }
    previous(error, isFatal);
  });
}
