import { describe, it, expect } from 'vitest';
import { loadFixtures, parseFixtureInput, resolvePath, toComparable } from './golden/_shared.js';

/**
 * The runner is test-support code, but resolvePath is real logic: a fixture
 * pins one output field by dotted path, so a wrong resolution would make a
 * fixture silently assert against `undefined` and pass once U2 lands.
 */
describe('resolvePath', () => {
  it('returns the root for the empty path', () => {
    const root = { kind: 'missing_input' };
    expect(resolvePath(root, '')).toBe(root);
  });

  it('resolves a single segment', () => {
    expect(resolvePath({ kind: 'ok' }, 'kind')).toBe('ok');
  });

  it('resolves a nested dotted path', () => {
    const result = { decision: { costing: { feed_cost_cents: '807981' } } };
    expect(resolvePath(result, 'decision.costing.feed_cost_cents')).toBe('807981');
  });

  it('resolves to undefined for a missing leaf rather than throwing', () => {
    expect(resolvePath({ decision: {} }, 'decision.production')).toBeUndefined();
  });

  it('throws when a segment traverses into a non-object', () => {
    expect(() => resolvePath({ decision: 7 }, 'decision.production')).toThrow(
      /non-object at 'production'/
    );
  });

  it('throws when a segment traverses into null', () => {
    expect(() => resolvePath({ decision: null }, 'decision.production')).toThrow(
      /non-object at 'production'/
    );
  });
});

describe('loadFixtures', () => {
  it('returns fixtures sorted by id, with no duplicate ids', () => {
    const ids = loadFixtures().map((f) => f.id);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('parseFixtureInput', () => {
  it('decodes a money string into bigint cents', () => {
    const parsed = parseFixtureInput({ chick_price_cents: '100' }) as Record<string, unknown>;
    expect(parsed.chick_price_cents).toBe(100n);
  });

  it('decodes money fields whose name carries "cents" in the middle', () => {
    const parsed = parseFixtureInput({
      gate_price_cents_per_bird: '430',
      transport_cents_per_bird: null
    }) as Record<string, unknown>;
    expect(parsed.gate_price_cents_per_bird).toBe(430n);
    expect(parsed.transport_cents_per_bird).toBeNull();
  });

  it('leaves weights, counts and dates alone', () => {
    const parsed = parseFixtureInput({
      chick_count: 3000,
      slaughter_target_g: 1770,
      placement_date: '2026-02-06'
    }) as Record<string, unknown>;
    expect(parsed).toEqual({
      chick_count: 3000,
      slaughter_target_g: 1770,
      placement_date: '2026-02-06'
    });
  });

  it('reaches money nested in objects and arrays', () => {
    const parsed = parseFixtureInput({
      batch: { chick_price_cents: '100' },
      sales: [{ price_cents_per_bird: '390' }]
    }) as { batch: Record<string, unknown>; sales: Record<string, unknown>[] };
    expect(parsed.batch.chick_price_cents).toBe(100n);
    expect(parsed.sales[0]?.price_cents_per_bird).toBe(390n);
  });
});

describe('toComparable', () => {
  it('encodes bigint cents back to the string a fixture file holds', () => {
    expect(toComparable(807981n)).toBe('807981');
  });

  it('leaves a plain number as a number — not every fixture value is money', () => {
    expect(toComparable(13224)).toBe(13224);
    expect(toComparable(1.53)).toBe(1.53);
  });

  it('encodes bigints nested in a returned result', () => {
    expect(toComparable({ costing: { feed_cost_cents: 807981n }, fcr: 1.53 })).toEqual({
      costing: { feed_cost_cents: '807981' },
      fcr: 1.53
    });
  });

  it('passes null and undefined through untouched', () => {
    expect(toComparable(null)).toBeNull();
    expect(toComparable(undefined)).toBeUndefined();
  });
});
