/**
 * A tiny in-memory ring buffer of recent app log lines. It never leaves the device on its own: it is
 * only attached to a crash report or "Send app log" that the user chooses to share.
 * Keep messages free of personal data where practical (IDs over titles).
 */
export type LogLevel = 'I' | 'W' | 'E';

const CAPACITY = 100;
const MAX_LINE = 400;
const lines: string[] = [];

function stamp(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(
    d.getMilliseconds(),
    3,
  )}`;
}

function stringify(part: unknown): string {
  if (typeof part === 'string') return part;
  if (part instanceof Error) return `${part.name}: ${part.message}`;
  try {
    return JSON.stringify(part) ?? String(part);
  } catch {
    return String(part);
  }
}

export function log(level: LogLevel, ...parts: unknown[]): void {
  let text = parts
    .map(stringify)
    .join(' ')
    .replace(/\s*\n\s*/g, ' ⏎ ');
  if (text.length > MAX_LINE) text = `${text.slice(0, MAX_LINE)}…`;
  lines.push(`${stamp(new Date())} ${level} ${text}`);
  if (lines.length > CAPACITY) lines.splice(0, lines.length - CAPACITY);
}

export const logInfo = (...parts: unknown[]) => log('I', ...parts);
export const logWarn = (...parts: unknown[]) => log('W', ...parts);
export const logError = (...parts: unknown[]) => log('E', ...parts);

/** The newest `count` lines, oldest first. */
export function recentLog(count = 50): string[] {
  return lines.slice(-count);
}

/** Tests only. */
export function clearLog(): void {
  lines.length = 0;
}

let consoleCaptured = false;

/** Mirrors console.warn / console.error into the ring buffer (behaviour otherwise unchanged). */
export function captureConsole(): void {
  if (consoleCaptured) return;
  consoleCaptured = true;
  const { warn, error } = console;
  console.warn = (...args: unknown[]) => {
    log('W', ...args);
    warn.apply(console, args);
  };
  console.error = (...args: unknown[]) => {
    log('E', ...args);
    error.apply(console, args);
  };
}
