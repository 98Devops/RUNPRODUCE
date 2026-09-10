import { describe, it, expect } from 'vitest';
import { loadFixtures, validateFixture, FIXTURE_IDS } from './golden/_shared.js';

/**
 * Integrity of the fixture files themselves — as opposed to whether the engine
 * satisfies them. This gates the build. A malformed or vanished fixture is a
 * regression at any point in the build; it is never "waiting on a module".
 * Completeness (all 13 present) lives in the golden step, because writing them
 * is U1 task 5.
 */

const raw = loadFixtures();

describe('golden fixture files', () => {
  it('every fixture on disk is well formed', () => {
    const problems = raw.flatMap((fixture) => validateFixture(fixture));
    expect(problems).toEqual([]);
  });

  it('has no duplicate ids', () => {
    const ids = raw.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has no id outside the contracted set of 13', () => {
    const unexpected = raw.map((f) => f.id).filter((id) => !FIXTURE_IDS.includes(id));
    expect(unexpected).toEqual([]);
  });

  it('never has more fixtures than the contract', () => {
    expect(raw.length).toBeLessThanOrEqual(FIXTURE_IDS.length);
  });
});

describe('validateFixture', () => {
  const good = {
    id: 1,
    name: 'feed-cost-day-41',
    description: 'feed cost at day 41',
    input: {},
    expect: { path: 'costing.feed_cost_cents', value: '807981' }
  };

  it('accepts a well-formed fixture', () => {
    expect(validateFixture(good)).toEqual([]);
  });

  it('accepts a placeholder fixture with no expected value', () => {
    const held = { ...good, expect: { path: 'allocation', placeholder: 'OQ-2' } };
    expect(validateFixture(held)).toEqual([]);
  });

  it('rejects a fixture with neither a value nor a placeholder', () => {
    const empty = { ...good, expect: { path: 'allocation' } };
    expect(validateFixture(empty)).toEqual([
      'fixture 1: expect must declare exactly one of value or placeholder'
    ]);
  });

  it('rejects a fixture declaring both a value and a placeholder', () => {
    const both = { ...good, expect: { path: 'allocation', value: 1, placeholder: 'OQ-2' } };
    expect(validateFixture(both)).toEqual([
      'fixture 1: expect must declare exactly one of value or placeholder'
    ]);
  });

  it('rejects an empty placeholder reason — a hold must name what it waits on', () => {
    const vague = { ...good, expect: { path: 'allocation', placeholder: '  ' } };
    expect(validateFixture(vague)).toEqual(['fixture 1: placeholder must name what it waits on']);
  });

  it('rejects a missing name', () => {
    const nameless = { ...good, name: '' };
    expect(validateFixture(nameless)).toEqual(['fixture 1: name must be a non-empty string']);
  });

  it('rejects a non-object input', () => {
    const bad = { ...good, input: 3 };
    expect(validateFixture(bad)).toEqual(['fixture 1: input must be an object']);
  });

  it('rejects a non-string expect.path', () => {
    const bad = { ...good, expect: { path: 3, value: 1 } };
    expect(validateFixture(bad)).toEqual(['fixture 1: expect.path must be a string']);
  });

  it('rejects a non-integer id', () => {
    expect(validateFixture({ ...good, id: 'one' })).toEqual([
      'fixture ?: id must be a positive integer'
    ]);
  });

  it('reports every problem, not just the first', () => {
    const bad = { id: 2, name: '', description: '', input: 3, expect: { path: 3 } };
    expect(validateFixture(bad)).toHaveLength(5);
  });
});
