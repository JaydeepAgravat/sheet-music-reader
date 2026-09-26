export type Summary = { n: number; p50: number; p95: number; p99: number; max: number; mean: number };

export function summarize(values: number[]): Summary {
  if (values.length === 0) return { n: 0, p50: 0, p95: 0, p99: 0, max: 0, mean: 0 };
  const s = [...values].sort((a, b) => a - b);
  const pick = (q: number) => s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))]!;
  const round = (v: number) => Math.round(v * 10) / 10;
  return {
    n: s.length,
    p50: round(pick(0.5)),
    p95: round(pick(0.95)),
    p99: round(pick(0.99)),
    max: round(s[s.length - 1]!),
    mean: round(s.reduce((a, b) => a + b, 0) / s.length),
  };
}
