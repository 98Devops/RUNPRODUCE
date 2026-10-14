import { describe, expect, it } from 'vitest';
import { SEED_BREED_CURVE } from '../src/breed-curve.js';
import { dayNumberFor } from '../src/day-number.js';
import { standardFeedForDay } from '../src/production.js';
import type { IsoDate } from '../src/types.js';

/**
 * U8 T-SB1 and T-SB2 · Regression pins on the shape Start batch stores
 * (u8-start-batch.md D3, D10). Start batch needs no engine change, so these
 * are written knowing they pass, and mutation-checked rather than watched red.
 *
 * Not pinned on purpose: the chick cost. TD-17 (ordered + extras, or ordered
 * only) is Daniel's answer, and a pin would freeze it before he gives it.
 */

const SEED = SEED_BREED_CURVE.points;

describe('T-SB1 · Daniel’s placement: 6,000 ordered + 60 extras', () => {
  it('feeds the whole flock of 6,060 on day 1, extras included', () => {
    const day1 = SEED.find((p) => p.day_number === 1)!;
    expect(
      standardFeedForDay({ points: SEED, day: 1, chick_count: 6000, extra_chick_count: 60, records: [] })
    ).toMatchObject({ kind: 'standard', birds: 6060, per_bird_g: day1.feed_g, feed_g: day1.feed_g * 6060 });
  });
});

describe('T-SB2 · the day count Today shows after Start batch', () => {
  it('is day 1 on the placement date and day 3 two days later', () => {
    expect(dayNumberFor('2026-10-12' as IsoDate, '2026-10-12' as IsoDate)).toBe(1);
    expect(dayNumberFor('2026-10-12' as IsoDate, '2026-10-14' as IsoDate)).toBe(3);
  });

  it('throws for a date before placement, which is why the database refuses a future placement (D7)', () => {
    expect(() => dayNumberFor('2026-10-12' as IsoDate, '2026-10-11' as IsoDate)).toThrow(/before placement/);
  });
});
