import { dateBucket, daysUntil, formatEventDate } from '../dates';

describe('setlist dates', () => {
  it('counts whole calendar days, across month and DST boundaries', () => {
    expect(daysUntil('2026-10-01', '2026-09-30')).toBe(1);
    expect(daysUntil('2026-03-30', '2026-03-28')).toBe(2);
    expect(daysUntil('2026-09-20', '2026-09-27')).toBe(-7);
    expect(daysUntil(null, '2026-09-27')).toBeNull();
    expect(daysUntil('soon', '2026-09-27')).toBeNull();
  });

  it('buckets dates', () => {
    const today = '2026-09-27';
    expect(dateBucket('2026-09-27', today)).toBe('today');
    expect(dateBucket('2026-09-28', today)).toBe('tomorrow');
    expect(dateBucket('2026-10-04', today)).toBe('upcoming');
    expect(dateBucket('2026-09-01', today)).toBe('past');
    expect(dateBucket(null, today)).toBe('none');
  });

  it('formats with the year only when it differs', () => {
    expect(formatEventDate('2026-10-04', '2026-09-27', 'en-GB')).toMatch(/4 Oct/);
    expect(formatEventDate('2027-01-02', '2026-09-27', 'en-GB')).toMatch(/2027/);
    expect(formatEventDate('bad', '2026-09-27', 'en')).toBe('bad');
  });
});
