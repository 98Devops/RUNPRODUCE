/**
 * AD-63's drift test. Every named CHECK that mirrors an engine union must list
 * exactly the union's values. A value added, removed or renamed on one side
 * only fails here (or in the typecheck, for the runtime arrays below).
 *
 * The runtime arrays are declared `as const satisfies readonly Union[]`, and
 * `Same<>` fails compilation if a union member is missing from its array, so a
 * union, its array and its constraint cannot disagree silently (AD-92).
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
import { newFarm } from '../src/payloads.js';
import { parameterSetPayload, BASE_PARAMETERS } from '../src/payloads.js';
import { pool, refused, rpc } from '../src/harness.js';

export type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
export type Assert<T extends true> = T;

export const PHASES = ['STARTER', 'GROWER', 'FINISHER'] as const satisfies readonly Phase[];
export const CHANNELS = ['GATE', 'BULK'] as const satisfies readonly Channel[];
export const PRICING_BASES = ['PER_BIRD', 'PER_KG'] as const satisfies readonly PricingBasis[];
export const SALE_PRICING_BASES = ['PER_BIRD', 'PER_KG', 'BANDED'] as const satisfies readonly SalePricingBasis[];
export const CONFIDENCES = ['measured', 'calibrated', 'assumed'] as const satisfies readonly Confidence[];
export const DELIVERY_MODES = ['ABATTOIR', 'DIRECT'] as const satisfies readonly DeliveryMode[];
export const OVERHEAD_KEYS = ['vaccine', 'electricity_heating', 'labour', 'transport_other'] as const satisfies readonly OverheadKey[];
export const OVERHEAD_BASES = ['PER_BIRD', 'PER_BATCH'] as const satisfies readonly OverheadBasis[];
export const OVERHEAD_TIMINGS = ['PLACEMENT', 'MONTHLY', 'HARVEST_COMPLETE'] as const satisfies readonly OverheadTiming[];

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

/**
 * `direction` has no engine union yet: AD-67's opening-cash function introduces
 * `CashDirection`. Until then the constraint is pinned to its approved values,
 * and this entry moves onto the union when it exists.
 */
const CASH_DIRECTIONS_PENDING_UNION = ['IN', 'OUT'] as const;
/** Chunk 6: roles have no engine union either (AD-85). */
const ROLES = ['OWNER', 'MANAGER', 'WORKER'] as const;

const GOVERNED: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['parameter_sets_gate_pricing_basis_values', PRICING_BASES],
  ['parameter_sets_delivery_mode_values', DELIVERY_MODES],
  ['overhead_lines_key_values', OVERHEAD_KEYS],
  ['overhead_lines_basis_values', OVERHEAD_BASES],
  ['overhead_lines_timing_values', OVERHEAD_TIMINGS],
  ['overhead_lines_confidence_values', CONFIDENCES],
  ['feed_prices_phase_values', PHASES],
  ['breed_curve_points_phase_values', PHASES],
  ['breed_curve_phases_phase_values', PHASES],
  ['feed_draw_versions_phase_values', PHASES],
  ['sales_order_versions_channel_values', CHANNELS],
  ['sales_order_versions_pricing_basis_values', SALE_PRICING_BASES],
  ['cash_transaction_versions_direction_values', CASH_DIRECTIONS_PENDING_UNION],
  ['memberships_role_values', ROLES]
];

afterAll(async () => {
  await pool.end();
});

describe('AD-63 · named CHECK constraints match the engine unions', () => {
  it.each(GOVERNED)('%s', async (name, expected) => {
    const { rows } = await pool.query<{ def: string }>(
      `select pg_get_constraintdef(c.oid) as def
         from pg_constraint c join pg_namespace n on n.oid = c.connamespace
        where c.conname = $1 and n.nspname in ('public', 'facts', 'private')`,
      [name]
    );
    expect(rows, `constraint ${name} must exist exactly once`).toHaveLength(1);
    const values = [...rows[0]!.def.matchAll(/'([^']*)'::text/g)].map((m) => m[1]);
    expect([...values].sort()).toEqual([...expected].sort());
  });
});

describe('T-RT1 (part 3) · a misspelt overhead timing is rejected, not stored', () => {
  it.each(['monthly_split', 'monthly'])('rejects timing %s and writes no set', async (timing) => {
    const farm = await newFarm('T-RT1');
    const payload = parameterSetPayload(farm.orgId, '2026-03-01', BASE_PARAMETERS);
    const lines = payload['overhead_lines'] as Array<Record<string, unknown>>;
    lines[0] = { ...lines[0], timing };

    const error = await refused(rpc(farm.owner, 'create_parameter_set', { payload }), '23514');
    expect(error.message).toContain('overhead_lines_timing_values');
    const { rows } = await pool.query(
      `select 1 from public.parameter_sets where org_id = $1 and effective_from = '2026-03-01'`,
      [farm.orgId]
    );
    expect(rows).toHaveLength(0);
  });
});
