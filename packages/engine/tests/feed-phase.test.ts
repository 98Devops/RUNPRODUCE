import { describe, expect, it } from 'vitest';
import { SEED_BREED_CURVE, feedPhaseForDay } from '../src/breed-curve.js';
import type { BreedCurvePoint, DayNumber, Grams, Phase } from '../src/types.js';

/**
 * U7 chunk 4, D22. The phase a day's feed is filed under, read from the curve's
 * point for the day (D5, AD-99), never from the phase ranges a WORKER cannot
 * read (chunk 3 finding 4).
 */

const SEED = SEED_BREED_CURVE.points;

function point(day: number, phase: Phase, feed_g = 10): BreedCurvePoint {
  return {
    day_number: day as DayNumber,
    weight_g: (40 + day * 10) as Grams,
    feed_g: feed_g as Grams,
    phase
  };
}

describe('feedPhaseForDay on the curve (T-E3)', () => {
  it.each([
    [1, 'STARTER'],
    [13, 'STARTER'],
    [14, 'GROWER'],
    [27, 'GROWER'],
    [28, 'FINISHER'],
    [41, 'FINISHER']
  ] as const)('day %i is %s, from the curve', (day, phase) => {
    expect(feedPhaseForDay(SEED, day)).toEqual({ phase, source: 'FROM_CURVE' });
  });

  it("reads the point's own phase, not a day range", () => {
    // Day 5 would be STARTER by the seed's ranges. The point says GROWER.
    const points = [1, 2, 3, 4, 5, 6].map((d) => point(d, d === 5 ? 'GROWER' : 'STARTER'));
    expect(feedPhaseForDay(points, 5)).toEqual({ phase: 'GROWER', source: 'FROM_CURVE' });
  });
});

describe("feedPhaseForDay past the curve's last day (T-E4)", () => {
  it.each([42, 60])('day %i carries finisher on, and says so', (day) => {
    expect(feedPhaseForDay(SEED, day)).toEqual({ phase: 'FINISHER', source: 'EXTRAPOLATED_BEYOND_CURVE' });
  });

  it('carries the last phase on, whatever it is, never an assumed FINISHER', () => {
    const points = [point(1, 'STARTER'), point(2, 'STARTER'), point(3, 'GROWER')];
    expect(feedPhaseForDay(points, 4)).toEqual({ phase: 'GROWER', source: 'EXTRAPOLATED_BEYOND_CURVE' });
  });

  it('gives the same answers when the points arrive out of order', () => {
    const reversed = [...SEED].reverse();
    for (const day of [1, 14, 28, 41, 42]) {
      expect(feedPhaseForDay(reversed, day)).toEqual(feedPhaseForDay(SEED, day));
    }
  });
});

describe('feedPhaseForDay refuses a day that cannot exist (T-E5, D23)', () => {
  it.each([
    [0, /day 0 /i],
    [-1, /day -1 /i],
    [1.5, /day 1\.5 /i],
    [Number.NaN, /day NaN /i]
  ])('throws for day %s, naming it', (day, message) => {
    expect(() => feedPhaseForDay(SEED, day)).toThrow(message);
  });

  it('throws for a curve with no points', () => {
    expect(() => feedPhaseForDay([], 1)).toThrow(/no points/i);
  });

  it('throws for a hole in the curve rather than guessing across it', () => {
    const points = [point(1, 'STARTER'), point(2, 'STARTER'), point(4, 'STARTER')];
    expect(() => feedPhaseForDay(points, 3)).toThrow(/day 3/i);
  });
});
