import { describe, it, expect } from 'vitest';
import { SEED_BREED_CURVE, pointForDay, cumulativeFeedG, feedGByPhase } from '../src/breed-curve.js';
import { Money } from '../src/money.js';

describe('SEED_BREED_CURVE', () => {
  it('has 41 points, day 1 through day 41', () => {
    expect(SEED_BREED_CURVE.points).toHaveLength(41);
    expect(SEED_BREED_CURVE.points[0]?.day_number).toBe(1);
    expect(SEED_BREED_CURVE.points[40]?.day_number).toBe(41);
  });

  it('carries the client phase prices as cents per kg', () => {
    const byPhase = Object.fromEntries(
      SEED_BREED_CURVE.phases.map((p) => [p.phase, p.price_per_kg_cents])
    );
    expect(byPhase['STARTER']).toBe(Money.fromDollars(0.65));
    expect(byPhase['GROWER']).toBe(Money.fromDollars(0.62));
    expect(byPhase['FINISHER']).toBe(Money.fromDollars(0.6));
  });

  it('assigns phases by day range', () => {
    expect(pointForDay(SEED_BREED_CURVE, 13).phase).toBe('STARTER');
    expect(pointForDay(SEED_BREED_CURVE, 14).phase).toBe('GROWER');
    expect(pointForDay(SEED_BREED_CURVE, 27).phase).toBe('GROWER');
    expect(pointForDay(SEED_BREED_CURVE, 28).phase).toBe('FINISHER');
  });

  it('reproduces the client weights at the decision-window days', () => {
    expect(pointForDay(SEED_BREED_CURVE, 30).weight_g).toBe(1754);
    expect(pointForDay(SEED_BREED_CURVE, 31).weight_g).toBe(1843);
    expect(pointForDay(SEED_BREED_CURVE, 41).weight_g).toBe(2875);
  });

  it('day 30 falls short of the 1770g slaughter target (OQ-7)', () => {
    expect(pointForDay(SEED_BREED_CURVE, 30).weight_g).toBeLessThan(1770);
    expect(pointForDay(SEED_BREED_CURVE, 31).weight_g).toBeGreaterThanOrEqual(1770);
  });

  it('reproduces cumulative feed per bird', () => {
    expect(cumulativeFeedG(SEED_BREED_CURVE, 14)).toBe(444);
    expect(cumulativeFeedG(SEED_BREED_CURVE, 30)).toBe(2337);
    expect(cumulativeFeedG(SEED_BREED_CURVE, 41)).toBe(4408);
  });

  it('splits cumulative feed by phase', () => {
    expect(feedGByPhase(SEED_BREED_CURVE, 41)).toEqual({
      STARTER: 383,
      GROWER: 1466,
      FINISHER: 2559
    });
  });

  it('throws for a day outside the curve rather than guessing', () => {
    expect(() => pointForDay(SEED_BREED_CURVE, 42)).toThrow(/day 42/i);
    expect(() => pointForDay(SEED_BREED_CURVE, 0)).toThrow(/day 0/i);
  });
});
