/** Event dates are local calendar days ('YYYY-MM-DD'), never instants — a gig on the 4th stays on the 4th. */

export type DateBucket = 'today' | 'tomorrow' | 'upcoming' | 'past' | 'none';

const toUtcDay = (iso: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000 : null;
};

/** Whole days from `today` to `date` (negative = past); null for missing/invalid dates. */
export function daysUntil(date: string | null, today: string): number | null {
  if (!date) return null;
  const a = toUtcDay(date);
  const b = toUtcDay(today);
  return a === null || b === null ? null : a - b;
}

export function dateBucket(date: string | null, today: string): DateBucket {
  const d = daysUntil(date, today);
  if (d === null) return 'none';
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  return d > 1 ? 'upcoming' : 'past';
}

/** "Sat 4 Oct" (this year) or "4 Oct 2027" (other years), in the user's language. */
export function formatEventDate(date: string, today: string, locale: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const sameYear = m[1] === today.slice(0, 4);
  try {
    return d.toLocaleDateString(locale, sameYear ? { weekday: 'short', day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return date;
  }
}
