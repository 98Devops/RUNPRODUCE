import { describe, it, expect } from 'vitest';
import { computeDecision } from '../src/index.js';
import type { EngineInput } from '../src/types.js';
import { loadFixtures, resolvePath } from './golden/_shared.js';

const fixtures = loadFixtures();

describe('golden fixtures — the contract with the client', () => {
  it('loads all 13 fixtures', () => {
    expect(fixtures).toHaveLength(13);
    expect(fixtures.map((f) => f.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  });

  for (const fixture of fixtures) {
    const label = fixture.provisional
      ? `[${fixture.id}] ${fixture.description} (provisional: ${fixture.provisional})`
      : `[${fixture.id}] ${fixture.description}`;

    it(label, () => {
      const result = computeDecision(fixture.input as unknown as EngineInput);
      const actual = resolvePath(result, fixture.expect.path);
      expect(actual, `fixture ${fixture.id} (${fixture.name})`).toEqual(fixture.expect.value);
    });
  }
});
