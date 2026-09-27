/**
 * Pure text formatting for crash reports, the app log and support emails. Everything is plain,
 * readable text: the user sees exactly what they send. Mirrors android/.../support/CrashReport.kt.
 */
import type { AppInfo } from '@/specs/NativeSupport';

/** Same cap as the native side (~64 KB). */
export const MAX_REPORT_CHARS = 64 * 1024;
/** How many recent log lines go into a crash report. */
export const CRASH_LOG_LINES = 50;

type ErrorParts = { name: string; message: string; stack: string; componentStack: string };

export function describeError(e: unknown): ErrorParts {
  if (e instanceof Error) {
    const extra = e as Error & { componentStack?: unknown };
    return {
      name: e.name || 'Error',
      message: e.message,
      stack: typeof e.stack === 'string' ? e.stack : '',
      componentStack: typeof extra.componentStack === 'string' ? extra.componentStack : '',
    };
  }
  let message: string;
  try {
    message = typeof e === 'string' ? e : JSON.stringify(e) ?? String(e);
  } catch {
    message = String(e);
  }
  return { name: 'Thrown value', message, stack: '', componentStack: '' };
}

/**
 * Keeps `max` characters: the head (message + top frames) and a shorter tail, with a marker saying
 * how much was cut. Never splits a surrogate pair.
 */
export function truncateReport(text: string, max = MAX_REPORT_CHARS): string {
  if (text.length <= max) return text;
  const marker = `\n… [${text.length - max} characters cut] …\n`;
  const budget = Math.max(0, max - marker.length);
  let headEnd = Math.floor((budget * 3) / 4);
  let tailStart = text.length - (budget - headEnd);
  const isHigh = (i: number) => {
    const c = text.charCodeAt(i);
    return c >= 0xd800 && c <= 0xdbff;
  };
  const isLow = (i: number) => {
    const c = text.charCodeAt(i);
    return c >= 0xdc00 && c <= 0xdfff;
  };
  if (headEnd > 0 && isHigh(headEnd - 1)) headEnd--;
  if (tailStart < text.length && isLow(tailStart)) tailStart++;
  return text.slice(0, headEnd) + marker + text.slice(tailStart);
}

/** Body of a fatal JS error report (native adds the app/device header). */
export function formatJsCrashBody(
  error: unknown,
  isFatal: boolean,
  logLines: readonly string[],
): string {
  const { name, message, stack, componentStack } = describeError(error);
  const title = `${name}: ${message}`;
  const parts = [`JavaScript error${isFatal ? ' (fatal)' : ''}`, title];
  // Hermes stacks start with "Name: message" already.
  const frames = stack.startsWith(title) ? stack.slice(title.length).replace(/^\n+/, '') : stack;
  if (frames.trim()) parts.push(`Stack:\n${frames.trimEnd()}`);
  if (componentStack.trim())
    parts.push(`Component stack:\n${componentStack.replace(/^\n+/, '').trimEnd()}`);
  const recent = logLines.slice(-CRASH_LOG_LINES);
  if (recent.length) parts.push(`Recent log (${recent.length} lines):\n${recent.join('\n')}`);
  return truncateReport(parts.join('\n\n'));
}

/** "Score Reader 1.0.0 (build 12)". */
export function versionLine(info: AppInfo): string {
  return `${info.appName} ${info.version} (build ${info.build})`;
}

/** Two short lines of app/device facts for emails and logs. */
export function deviceSummary(info: AppInfo): string {
  return `${versionLine(info)}\nAndroid ${info.android} (API ${info.sdk}) · ${info.device}`;
}

/** "Send app log": what the app did recently, with app/device facts on top. */
export function formatAppLog(info: AppInfo, logLines: readonly string[]): string {
  const body = logLines.length ? logLines.join('\n') : '(no log lines yet)';
  return truncateReport(
    `${deviceSummary(info)}\n\nRecent log (${logLines.length} lines):\n${body}\n`,
  );
}

/** A crash report as shared: a short human note on top, then the report itself. */
export function formatSharedReport(intro: string, report: string): string {
  return truncateReport(`${intro.trim()}\n\n${report.trimEnd()}\n`);
}

/** mailto: URI with subject and body (RFC 6068: every component percent-encoded). */
export function mailtoUri(to: string, subject: string, body: string): string {
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
