import { describe, it, expect } from 'vitest';
import { loadFixtures, resolvePath } from './golden/_shared.js';

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
