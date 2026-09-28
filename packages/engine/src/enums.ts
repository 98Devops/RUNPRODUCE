import type {
  Channel,
  Confidence,
  DeliveryMode,
  EntrySource,
  OverheadBasis,
  OverheadKey,
  OverheadTiming,
  Phase,
  PhaseSource,
  PricingBasis,
  SalePricingBasis
} from './types.js';

/**
 * The runtime list of each categorical union (AD-63, AD-92). The engine itself
 * never reads these: they exist so the repository layer can build its Zod enums
 * and the database drift test can compare its CHECKs against the same values.
 * Declared here, beside the unions, so a union and its list change together;
 * `tests/enums.test.ts` fails the typecheck if one misses a member.
 */
export const PHASES = ['STARTER', 'GROWER', 'FINISHER'] as const satisfies readonly Phase[];
export const CHANNELS = ['GATE', 'BULK'] as const satisfies readonly Channel[];
export const PRICING_BASES = ['PER_BIRD', 'PER_KG'] as const satisfies readonly PricingBasis[];
export const SALE_PRICING_BASES = ['PER_BIRD', 'PER_KG', 'BANDED'] as const satisfies readonly SalePricingBasis[];
export const CONFIDENCES = ['measured', 'calibrated', 'assumed'] as const satisfies readonly Confidence[];
export const DELIVERY_MODES = ['ABATTOIR', 'DIRECT'] as const satisfies readonly DeliveryMode[];
export const OVERHEAD_KEYS = [
  'vaccine',
  'electricity_heating',
  'labour',
  'transport_other'
] as const satisfies readonly OverheadKey[];
export const OVERHEAD_BASES = ['PER_BIRD', 'PER_BATCH'] as const satisfies readonly OverheadBasis[];
export const OVERHEAD_TIMINGS = ['PLACEMENT', 'MONTHLY', 'HARVEST_COMPLETE'] as const satisfies readonly OverheadTiming[];
export const ENTRY_SOURCES = ['MEASURED', 'STANDARD_CONFIRMED'] as const satisfies readonly EntrySource[];
export const PHASE_SOURCES = ['FROM_CURVE', 'EXTRAPOLATED_BEYOND_CURVE'] as const satisfies readonly PhaseSource[];
