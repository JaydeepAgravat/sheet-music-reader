import NativeSupport, { type AppInfo } from '@/specs/NativeSupport';

let cached: AppInfo | null = null;

/** App/device facts from the native side (cached; they don't change while running). */
export function getAppInfo(): AppInfo {
  if (cached) return cached;
  try {
    const info = NativeSupport?.appInfo();
    if (info) return (cached = info);
  } catch {
    // Fall through to the placeholder (tests, or a broken native module).
  }
  return { appName: 'Score Reader', version: '?', build: 0, android: '?', sdk: 0, device: '?' };
}
