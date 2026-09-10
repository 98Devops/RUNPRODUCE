import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isNotImplemented } from '../../src/errors.js';

/** The 13 fixtures contracted in progress-tracker.md. */
export const FIXTURE_IDS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

/**
 * A fixture pins exactly one output field, addressed by dotted path.
 *
 * `value` is the expected value. `placeholder` stands in its place when the
 * expected value is not knowable yet — an unanswered open question — and names
 * what it waits on. Exactly one of the two is present.
 */
export interface FixtureExpectation {
  readonly path: string;
  readonly value?: unknown;
  readonly placeholder?: string;
}

export interface Fixture {
  readonly id: number;
  readonly name: string;
  readonly description: string;
  readonly input: Record<string, unknown>;
  readonly expect: FixtureExpectation;
  /**
   * Set when the expected value rests on an assumption rather than client data.
   * A provisional fixture still asserts — it locks in current behaviour so a
   * regression is caught — and it is not held. Only `placeholder` holds.
   */
  readonly provisional?: string;
}

const HERE = dirname(fileURLToPath(import.meta.url));

export function loadFixtures(): Fixture[] {
  return readdirSync(HERE)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(HERE, f), 'utf8')) as Fixture)
    .sort((a, b) => a.id - b.id);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Structural check on a fixture file, reporting every problem rather than the
 * first. This gates the build: a malformed fixture is a regression at any
 * stage, never something waiting on an unbuilt module.
 */
export function validateFixture(raw: unknown): string[] {
  const problems: string[] = [];
  if (!isObject(raw)) return ['fixture ?: must be an object'];

  const id = raw['id'];
  const label = typeof id === 'number' && Number.isInteger(id) && id > 0 ? String(id) : '?';
  const problem = (message: string): void => void problems.push(`fixture ${label}: ${message}`);

  if (label === '?') problem('id must be a positive integer');
  if (!isNonEmptyString(raw['name'])) problem('name must be a non-empty string');
  if (!isNonEmptyString(raw['description'])) problem('description must be a non-empty string');
  if (!isObject(raw['input'])) problem('input must be an object');

  const expectation = raw['expect'];
  if (!isObject(expectation)) {
    problem('expect must be an object');
    return problems;
  }

  if (typeof expectation['path'] !== 'string') problem('expect.path must be a string');

  const hasValue = 'value' in expectation;
  const hasPlaceholder = 'placeholder' in expectation;
  if (hasValue === hasPlaceholder) {
    problem('expect must declare exactly one of value or placeholder');
  } else if (hasPlaceholder && !isNonEmptyString(expectation['placeholder'])) {
    problem('placeholder must name what it waits on');
  }

  if ('provisional' in raw && !isNonEmptyString(raw['provisional'])) {
    problem('provisional must name the assumption it rests on');
  }

  return problems;
}

export type FixtureOutcome =
  | { readonly kind: 'returned'; readonly value: unknown }
  | { readonly kind: 'threw'; readonly error: unknown };

export type FixtureVerdict =
  | { readonly kind: 'assert'; readonly expected: unknown }
  | { readonly kind: 'held'; readonly reason: string }
  | { readonly kind: 'fail'; readonly reason: string };

/**
 * Decides whether a fixture gates the build.
 *
 * Held — reported, not failed — in exactly two cases: the fixture has no
 * expected value yet, or the engine call threw `NotImplementedError`. Both are
 * derived from the run, so a fixture rejoins the gate automatically once its
 * module lands. Everything else asserts, and asserting includes failing.
 */
export function classifyFixture(fixture: Fixture, outcome: FixtureOutcome): FixtureVerdict {
  const { placeholder } = fixture.expect;
  if (placeholder !== undefined) {
    return { kind: 'held', reason: `no expected value yet — ${placeholder}` };
  }

  if (outcome.kind === 'threw') {
    if (isNotImplemented(outcome.error)) {
      return { kind: 'held', reason: outcome.error.message };
    }
    return { kind: 'fail', reason: describeError(outcome.error) };
  }

  return { kind: 'assert', expected: fixture.expect.value };
}

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

/**
 * Resolves 'costing.feed_cost_cents' against a result object. '' means the
 * root. A missing leaf resolves to undefined; traversing *into* a non-object
 * throws, because that means the fixture's path disagrees with the shape the
 * engine returns and would otherwise assert against undefined silently.
 */
export function resolvePath(root: unknown, path: string): unknown {
  if (path === '') return root;
  let current: unknown = root;
  for (const segment of path.split('.')) {
    if (current === null || typeof current !== 'object') {
      throw new Error(`Cannot resolve '${path}': hit a non-object at '${segment}'`);
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}
