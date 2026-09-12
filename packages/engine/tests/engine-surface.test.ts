import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Reachability, not correctness.
 *
 * Every other test in this suite imports a module directly — `../src/feed.js`,
 * `../src/allocation.js`. That proves the logic inside the module is right and
 * proves NOTHING about whether a consumer of the package can reach it. M5b shipped
 * eight tasks and 35 passing tests with `allocation.ts` re-exported from nowhere:
 * `computeAllocation` was correct, tested, and invisible from the package's only
 * entry point.
 *
 * So this file asserts the surface itself, by reading the source rather than by
 * listing names a human has to remember to update. A new exported function in any
 * engine module either appears in `index.ts` or fails here.
 */

const SRC = join(__dirname, '..', 'src');

/**
 * Deliberately NOT public: exported from its module so a sibling module can reuse
 * it, and no part of the package's API. Adding to this list is a real decision —
 * it says "consumers must not call this" — so each entry carries its reason.
 */
const INTERNAL_CROSS_MODULE: Readonly<Record<string, string>> = {
  // cash.ts prices a planned draw the way computeCosting prices feed, and must
  // use the identical round-up convention or the two disagree by cents.
  costOfFeed: 'shared by costing.ts and cash.ts so feed rounds identically in both',
  // cash.ts dates a HARVEST_COMPLETE overhead against the day the batch could
  // be finished (AD-56). Deriving a second notion of "the batch is done" there
  // is the duplication AD-52 removed from feed pricing.
  firstDayAtWeight: 'shared by harvest.ts and cash.ts so one engine holds one harvest-completion day'
};

function valueExportsOf(source: string): string[] {
  const names: string[] = [];
  for (const m of source.matchAll(/^export (?:async )?function (\w+)/gm)) names.push(m[1]!);
  for (const m of source.matchAll(/^export const (\w+)/gm)) names.push(m[1]!);
  for (const m of source.matchAll(/^export class (\w+)/gm)) names.push(m[1]!);
  return names;
}

describe('the engine surface is reachable from index.ts', () => {
  const index = readFileSync(join(SRC, 'index.ts'), 'utf8');

  const reExported = new Set<string>();
  for (const block of index.matchAll(/export\s*\{([^}]*)\}\s*from/g)) {
    for (const raw of block[1]!.split(',')) {
      const name = raw.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) reExported.add(name);
    }
  }
  const starModules = new Set<string>();
  for (const m of index.matchAll(/export \* from '\.\/([\w-]+)\.js'/g)) starModules.add(m[1]!);

  const modules = readdirSync(SRC)
    .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
    .map((f) => f.replace(/\.ts$/, ''));

  it.each(modules)('%s exports nothing the package cannot reach', (mod) => {
    if (starModules.has(mod)) return; // re-exported wholesale, nothing to miss
    const source = readFileSync(join(SRC, `${mod}.ts`), 'utf8');

    const unreachable = valueExportsOf(source).filter(
      (name) => !reExported.has(name) && !(name in INTERNAL_CROSS_MODULE)
    );

    expect(
      unreachable,
      `${mod}.ts exports ${unreachable.join(', ')}, which index.ts does not re-export. ` +
        'Either add it to index.ts, or add it to INTERNAL_CROSS_MODULE with the reason ' +
        'it must stay internal.'
    ).toEqual([]);
  });

  it('keeps the internal allowlist honest — every entry still exists', () => {
    // An allowlist that outlives the thing it excuses quietly stops meaning
    // anything, and the next person reads it as precedent.
    const everyExport = new Set(
      modules.flatMap((mod) => valueExportsOf(readFileSync(join(SRC, `${mod}.ts`), 'utf8')))
    );
    for (const name of Object.keys(INTERNAL_CROSS_MODULE)) {
      expect(everyExport.has(name), `${name} is allowlisted but no longer exported anywhere`).toBe(
        true
      );
    }
  });
});
