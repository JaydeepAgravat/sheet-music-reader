/**
 * Dev-only: POST a JSON report to a listener on the development machine
 * (emulator → host is 10.0.2.2). Silently no-ops when nothing is listening. Never used in release.
 */
export function reportToHost(label: string, data: unknown): void {
  if (!__DEV__) return;
  fetch('http://10.0.2.2:9999', { method: 'POST', body: JSON.stringify({ label, at: new Date().toISOString(), data }) }).catch(() => {});
}
