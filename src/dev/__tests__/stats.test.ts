import { summarize } from '../stats';

test('percentiles', () => {
  const values = Array.from({ length: 100 }, (_, i) => i + 1);
  expect(summarize(values)).toEqual({ n: 100, p50: 50, p95: 95, p99: 99, max: 100, mean: 50.5 });
  expect(summarize([]).n).toBe(0);
});
