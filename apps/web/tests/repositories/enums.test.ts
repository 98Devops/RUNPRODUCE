/**
 * Enum parity (D27, AD-92). Each engine union the snapshot carries has one
 * runtime array in the repository layer. Zod's enums are built from those
 * arrays, and AD-63's drift test (packages/db-tests/tests/enum-drift.test.ts)
 * compares the same arrays with the named CHECKs in `pg_constraint`.
 *
 * The compile-time half: `Same<>` fails `tsc` if an array misses a union member
 * or lists a value the union lacks. The runtime half: every array reaches the
 * entry point and lists each value once.
 *
 * `CASH_DIRECTIONS` is not here: the engine has no cash-direction union until
 * AD-67's engine side lands, and `loadEngineInput` does not map cash yet.
 */
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
} from '@runproduce/engine';
import * as repositories from '../../lib/repositories/index.js';
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
} from '../../lib/repositories/index.js';

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

describe('enum parity · runtime arrays (D27)', () => {
  it.each(NAMES)('%s is exported from the repository entry point and lists each value once', (name) => {
    const values = (repositories as Record<string, unknown>)[name];
    expect(Array.isArray(values)).toBe(true);
    const list = values as readonly string[];
    expect(list.length).toBeGreaterThan(0);
    expect(new Set(list).size).toBe(list.length);
  });
});
