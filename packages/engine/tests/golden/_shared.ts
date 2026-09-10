import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export interface FixtureExpectation {
  readonly path: string;
  readonly value: unknown;
}

export interface Fixture {
  readonly id: number;
  readonly name: string;
  readonly description: string;
  readonly input: Record<string, unknown>;
  readonly expect: FixtureExpectation;
  /** Present when the expected value depends on an unanswered OQ. */
  readonly provisional?: string;
}

const HERE = dirname(fileURLToPath(import.meta.url));

export function loadFixtures(): Fixture[] {
  return readdirSync(HERE)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(HERE, f), 'utf8')) as Fixture)
    .sort((a, b) => a.id - b.id);
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
