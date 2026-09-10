import { describe, it, expect } from 'vitest';
import { NotImplementedError } from '../src/errors.js';
import { classifyFixture, type Fixture } from './golden/_shared.js';

/**
 * The classifier decides whether a golden fixture gates the build or is held.
 * It is the whole substance of the CI split, so it is tested in its own right:
 * a classifier that returns 'held' too readily makes the golden step decorative.
 */

function fixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    id: 1,
    name: 'feed-cost-day-41',
    description: 'feed cost at day 41',
    input: {},
    expect: { path: 'costing.feed_cost_cents', value: '807981' },
    ...overrides
  };
}

describe('classifyFixture', () => {
  it('asserts when the engine returned a value', () => {
    const verdict = classifyFixture(fixture(), { kind: 'returned', value: { costing: {} } });
    expect(verdict).toEqual({ kind: 'assert', expected: '807981' });
  });

  it('holds a fixture whose engine module is not implemented', () => {
    const verdict = classifyFixture(fixture(), {
      kind: 'threw',
      error: new NotImplementedError('computeDecision', 'U2')
    });
    expect(verdict).toEqual({
      kind: 'held',
      reason: 'computeDecision not implemented — U2'
    });
  });

  it('fails a fixture that threw for any other reason', () => {
    const verdict = classifyFixture(fixture(), {
      kind: 'threw',
      error: new TypeError('cannot read opening_birds of undefined')
    });
    expect(verdict).toEqual({
      kind: 'fail',
      reason: 'TypeError: cannot read opening_birds of undefined'
    });
  });

  it('fails a fixture that threw a non-Error value', () => {
    const verdict = classifyFixture(fixture(), { kind: 'threw', error: 'boom' });
    expect(verdict).toEqual({ kind: 'fail', reason: 'boom' });
  });

  it('holds a fixture with no expected value yet, whatever the engine did', () => {
    const held = fixture({ expect: { path: 'allocation.bulk_net_cents', placeholder: 'OQ-2' } });
    expect(classifyFixture(held, { kind: 'returned', value: {} })).toEqual({
      kind: 'held',
      reason: 'no expected value yet — OQ-2'
    });
  });

  it('asserts a provisional fixture — provisional is not held', () => {
    const provisional = fixture({ provisional: 'OQ-7 — target vs. the curve' });
    const verdict = classifyFixture(provisional, { kind: 'returned', value: {} });
    expect(verdict).toEqual({ kind: 'assert', expected: '807981' });
  });

  it('asserts a fixture whose expected value is legitimately null', () => {
    const nullish = fixture({ expect: { path: 'allocation', value: null } });
    const verdict = classifyFixture(nullish, { kind: 'returned', value: {} });
    expect(verdict).toEqual({ kind: 'assert', expected: null });
  });

  it('does not hold on an error that merely mentions "not implemented"', () => {
    const verdict = classifyFixture(fixture(), {
      kind: 'threw',
      error: new Error('mortality ramp not implemented for day 0')
    });
    expect(verdict.kind).toBe('fail');
  });
});
