import { describe, expect, it } from 'vitest';
import type {
  Channel,
  Confidence,
  DeliveryMode,
  OverheadBasis,
  OverheadKey,
  OverheadTiming,
  Phase,
  PricingBasis,
  SalePricingBasis
} from '../src/index.js';
import * as engine from '../src/index.js';
import {
  CHANNELS,
  CONFIDENCES,
  DELIVERY_MODES,
  OVERHEAD_BASES,
  OVERHEAD_KEYS,
  OVERHEAD_TIMINGS,
  PHASES,
  PRICING_BASES,
  SALE_PRICING_BASES
} from '../src/index.js';

/**
 * The runtime half of each categorical union (AD-63, AD-92). The repository
 * layer builds its Zod enums from these, and the database drift test compares
 * them with the named CHECKs, so they live beside the unions they list.
 *
 * Compile time: `Same<>` fails `tsc` if an array misses a member or lists one
 * the union lacks. Run time: each is reachable from the entry point and lists
 * each value once.
 */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

export type Complete = [
  Assert<Same<(typeof PHASES)[number], Phase>>,
  Assert<Same<(typeof CHANNELS)[number], Channel>>,
  Assert<Same<(typeof PRICING_BASES)[number], PricingBasis>>,
  Assert<Same<(typeof SALE_PRICING_BASES)[number], SalePricingBasis>>,
  Assert<Same<(typeof CONFIDENCES)[number], Confidence>>,
  Assert<Same<(typeof DELIVERY_MODES)[number], DeliveryMode>>,
  Assert<Same<(typeof OVERHEAD_KEYS)[number], OverheadKey>>,
  Assert<Same<(typeof OVERHEAD_BASES)[number], OverheadBasis>>,
  Assert<Same<(typeof OVERHEAD_TIMINGS)[number], OverheadTiming>>
];

const NAMES = [
  'PHASES',
  'CHANNELS',
  'PRICING_BASES',
  'SALE_PRICING_BASES',
  'CONFIDENCES',
  'DELIVERY_MODES',
  'OVERHEAD_KEYS',
  'OVERHEAD_BASES',
  'OVERHEAD_TIMINGS'
] as const;

describe('enum runtime arrays (AD-63, AD-92)', () => {
  it.each(NAMES)('%s is exported from the engine entry point and lists each value once', (name) => {
    const values = (engine as Record<string, unknown>)[name];
    expect(Array.isArray(values)).toBe(true);
    const list = values as readonly string[];
    expect(list.length).toBeGreaterThan(0);
    expect(new Set(list).size).toBe(list.length);
  });

  it('lists phases in feeding order, which the curve and the draw schedule both follow', () => {
    expect(PHASES).toEqual(['STARTER', 'GROWER', 'FINISHER']);
  });
});
