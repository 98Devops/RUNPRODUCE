/**
 * T-T3 · "Today" is the farm's date, in Africa/Harare (U7 D28). Netlify runs on
 * UTC, two hours behind the farm: without this, a death recorded at 1am would
 * be filed under yesterday.
 */
import { FARM_TIME_ZONE, farmToday } from '../../lib/today/farm-date.js';

describe('T-T3 · farmToday', () => {
  it('is set to the farm, as one constant', () => {
    expect(FARM_TIME_ZONE).toBe('Africa/Harare');
  });

  it('turns over at 22:00 UTC, which is midnight on the farm', () => {
    expect(farmToday(new Date('2026-10-13T21:59:59Z'))).toBe('2026-10-13');
    expect(farmToday(new Date('2026-10-13T22:00:00Z'))).toBe('2026-10-14');
  });

  it('files a 1am capture on the farm under the farm date, not the server date', () => {
    expect(farmToday(new Date('2026-10-13T23:00:00Z'))).toBe('2026-10-14');
  });

  it('is the same date as UTC through the farm afternoon', () => {
    expect(farmToday(new Date('2026-10-14T00:00:00Z'))).toBe('2026-10-14');
    expect(farmToday(new Date('2026-10-14T12:00:00Z'))).toBe('2026-10-14');
  });

  it.each([
    ['a month end', '2026-10-31T22:30:00Z', '2026-11-01'],
    ['a year end', '2026-12-31T22:00:00Z', '2027-01-01'],
    ['February in a common year', '2026-02-28T22:00:00Z', '2026-03-01'],
    ['February in a leap year', '2028-02-28T22:00:00Z', '2028-02-29']
  ])('crosses %s', (_label, instant, expected) => {
    expect(farmToday(new Date(instant))).toBe(expected);
  });
});
