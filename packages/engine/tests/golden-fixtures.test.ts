import { describe, it, expect, afterAll } from 'vitest';
import { computeDecision } from '../src/index.js';
import type { EngineInput } from '../src/types.js';
import {
  classifyFixture,
  loadFixtures,
  parseFixtureInput,
  resolvePath,
  toComparable,
  FIXTURE_IDS,
  type Fixture,
  type FixtureOutcome
} from './golden/_shared.js';

/**
 * The golden fixtures — the contract with the client.
 *
 * This suite is its own CI step. It does not fail the build for a fixture that
 * is waiting on a module nobody has written yet; it does fail for everything
 * else, including a fixture that targets a module which now exists and returns
 * the wrong number. See classifyFixture — the distinction is derived from the
 * run, not from a hand-maintained list of excuses.
 */

const fixtures = loadFixtures();

const passed: number[] = [];
const held: { id: number; reason: string }[] = [];

/**
 * Reading the value the fixture asks for is part of the engine call, not a step
 * after it. A module U3-U5 has not built is exposed on the decision as a getter
 * that throws `NotImplementedError`, so a fixture targeting `decision.feed`
 * only classifies as held if that throw happens inside this try. Resolving the
 * path outside it would report "not built yet" as a failure.
 */
function run(fixture: Fixture): FixtureOutcome {
  try {
    const decision = computeDecision(parseFixtureInput(fixture.input) as EngineInput);
    return { kind: 'returned', value: resolvePath(decision, fixture.expect.path) };
  } catch (error) {
    return { kind: 'threw', error };
  }
}

describe('golden fixtures — the contract with the client', () => {
  // Completeness, not integrity: writing all 13 is U1 task 5. Held until then,
  // at which point this assertion moves into the gating integrity suite so a
  // vanished fixture fails the build.
  it(`all ${FIXTURE_IDS.length} fixtures are written`, (ctx) => {
    if (fixtures.length < FIXTURE_IDS.length) {
      held.push({ id: 0, reason: `only ${fixtures.length}/${FIXTURE_IDS.length} written — U1 task 5` });
      ctx.skip();
    }
    expect(fixtures.map((f) => f.id)).toEqual([...FIXTURE_IDS]);
    passed.push(0);
  });

  for (const fixture of fixtures) {
    const label = fixture.provisional
      ? `[${fixture.id}] ${fixture.description} (provisional: ${fixture.provisional})`
      : `[${fixture.id}] ${fixture.description}`;

    it(label, (ctx) => {
      const outcome = run(fixture);
      const verdict = classifyFixture(fixture, outcome);

      if (verdict.kind === 'held') {
        held.push({ id: fixture.id, reason: verdict.reason });
        ctx.skip();
        return;
      }

      if (verdict.kind === 'fail') {
        expect.fail(`fixture ${fixture.id} (${fixture.name}) threw: ${verdict.reason}`);
        return;
      }

      const actual = outcome.kind === 'returned' ? outcome.value : undefined;
      expect(toComparable(actual), `fixture ${fixture.id} (${fixture.name})`).toEqual(
        verdict.expected
      );
      passed.push(fixture.id);
    });
  }
});

afterAll(() => {
  const lines = [
    '',
    'Golden fixtures',
    `  written  ${fixtures.length}/${FIXTURE_IDS.length}`,
    `  passing  ${passed.length}`,
    `  held     ${held.length}`,
    ...held.map((h) => `    - ${h.id === 0 ? 'completeness' : `fixture ${h.id}`}: ${h.reason}`),
    held.length === 0
      ? '  Nothing held. This step now gates in full — TD-2 can close.'
      : '  Held fixtures do not fail this step. Everything else does.',
    ''
  ];
  console.log(lines.join('\n'));
});
