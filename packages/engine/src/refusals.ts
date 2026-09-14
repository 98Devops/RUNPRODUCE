import { feedDrawsMissingInputs } from './feed.js';
import { projectProduction, salesMissingInputs } from './production.js';
import type { EngineInput, MissingInput, SalesOrder } from './types.js';

/**
 * Invariant 5: what the engine refuses to guess. **The one list.**
 *
 * TD-4 finding 8. This used to be three lists: `missingInputsFor` in index.ts
 * for `computeDecision`, `cashFlowsMissingInputs` in cash.ts for the calendar
 * and `computeAllocation`, and `salesMissingInputs` called only by
 * `computeDecision`. They drifted. A BANDED bulk order with no bands, or a gate
 * order with no price, returned `ok` from `computeDecision` while the calendar
 * refused it; an oversold batch that `computeDecision` refused was scored by
 * the allocation as if its orders were real. Every entry point now calls this,
 * so a refusal added here reaches all of them at once.
 *
 * **Two stages, in order.** The input-only checks come first and return on
 * their own if anything is missing. Only then is production projected, for the
 * one check that needs the flock (sales bird counts). That keeps the projection
 * from running on an input already known to be unpriceable, and it is the order
 * `computeDecision` has always refused in.
 *
 * An input with no sales skips the projection entirely: there is nothing for
 * the second stage to check, and every allocation candidate is such an input, so
 * the calendar's guard costs nothing extra per candidate (OQ-29).
 */
export function missingInputsFor(input: EngineInput): MissingInput[] {
  const missing = inputOnlyMissingInputs(input);
  if (missing.length > 0 || input.sales.length === 0) return missing;
  return salesMissingInputs(input, projectProduction(input));
}

function inputOnlyMissingInputs(input: EngineInput): MissingInput[] {
  const missing: MissingInput[] = [];

  /**
   * The gate price is needed by every batch, bulk sales or not: the harvest
   * plan's gate window and hold cost both read it. `planHarvest` once priced a
   * null gate price at `0n`, valuing a bird at nothing.
   */
  const basis = input.parameters.gate_pricing_basis;
  const gateRate =
    basis === 'PER_KG'
      ? input.parameters.gate_price_cents_per_kg
      : input.parameters.gate_price_cents_per_bird;
  if (gateRate === null) {
    missing.push({
      key: 'gate_price',
      why: `Client has not provided a ${basis} gate price`
    });
  }

  // OQ-21. A fractional bag count affects every batch that has entered a draw.
  missing.push(...feedDrawsMissingInputs(input));

  for (const sale of input.sales) {
    if (sale.channel === 'BULK') continue;
    missing.push(...gateOrderProblems(sale));
  }

  if (!input.sales.some((sale) => sale.channel === 'BULK')) return missing;

  /**
   * Both values are KNOWN (10c each, AD-55) and neither is read from the seed
   * here. A value being known is not the same as it being supplied: the seed is
   * what an app-level default should be built from, not a silent fallback
   * behind a caller's back.
   *
   * The abattoir fee is dropped on a DIRECT delivery (no abattoir, no fee);
   * transport is charged on both modes, the conservative direction.
   */
  const { abattoir_fee_cents, transport_cents_per_bird, delivery_mode } = input.parameters;
  if (delivery_mode === 'ABATTOIR' && abattoir_fee_cents === null) {
    missing.push({
      key: 'abattoir_fee',
      why:
        'This input carries no abattoir fee per bird, which nets a bulk sale delivered via ' +
        'the abattoir. The client answered it on 2026-09-10 (10 cents, ' +
        'SEED_ABATTOIR_FEE_CENTS), but a known value is not a supplied one.'
    });
  }
  if (transport_cents_per_bird === null) {
    missing.push({
      key: 'transport_cents_per_bird',
      why:
        'This input carries no transport cost per bird, which nets a bulk sale. The client ' +
        'answered it on 2026-09-12 (10 cents, SEED_TRANSPORT_CENTS_PER_BIRD, separate from ' +
        'the abattoir fee), but a known value is not a supplied one.'
    });
  }

  // Per ORDER, not per batch: the contract lives on the order (AD-57), and one
  // buyer's deal being unpriceable says nothing about another's.
  for (const sale of input.sales) {
    if (sale.channel !== 'BULK') continue;
    missing.push(...bulkContractProblems(sale));
  }

  return missing;
}

/**
 * What stops THIS gate order being priced, if anything.
 *
 * `SalesOrder.pricing_basis` is typed per order, not per channel, so nothing in
 * the type stops a gate order carrying BANDED. Refused here rather than booked
 * at the per-bird price with the bands ignored.
 */
function gateOrderProblems(sale: SalesOrder): MissingInput[] {
  if (sale.pricing_basis === 'BANDED') {
    return [
      {
        key: 'gate_price',
        why:
          `This ${sale.channel} order is priced BANDED. Bands are a bulk contract priced ` +
          'on dressed weight, and a gate bird is sold live, so there is no gate reading ' +
          'of them to fall back on.'
      }
    ];
  }
  const rate =
    sale.pricing_basis === 'PER_KG' ? sale.price_cents_per_kg : sale.price_cents_per_bird;
  if (rate === null) {
    return [
      {
        key: 'gate_price',
        why: `This ${sale.channel} order is priced ${sale.pricing_basis} and carries no such price.`
      }
    ];
  }
  return [];
}

/**
 * What stops THIS bulk order being priced, if anything.
 *
 * Exported for one reason: `bulkNetCentsPerBird` is public, and its
 * programming-error guard must refuse exactly what this refuses, not a copy.
 */
export function bulkContractProblems(sale: SalesOrder): MissingInput[] {
  if (sale.pricing_basis === 'BANDED') {
    if (sale.bands === null || sale.bands.length === 0) {
      return [
        {
          key: 'bulk_price',
          why:
            'This BULK order is priced BANDED but carries no band schedule. The contract ' +
            'belongs to the buyer and Daniel sells to more than one (2026-09-12: bulk ' +
            'pricing "depends on the buyer"), so nothing can stand in for it — not ' +
            'parameters.bulk_bands, which is the planning default for a sale that has no ' +
            'buyer yet.'
        }
      ];
    }
    if (sale.avg_dressed_weight_g === null) {
      return [
        {
          key: 'dressed_weight',
          why:
            'This BULK order is priced on DRESSED weight and none was recorded. Deriving it ' +
            'from live weight would price a real invoice off the assumed ~62% yield that ' +
            'OQ-17 exists to replace. A forecast may use that estimate; an invoice may not.'
        }
      ];
    }
    const floors = sale.bands.map((band) => band.dressed_floor_g);
    const lowest = Math.min(...floors);
    const highest = Math.max(...floors);
    if (sale.avg_dressed_weight_g < lowest) {
      return [
        {
          key: 'bulk_price',
          why:
            `A ${sale.avg_dressed_weight_g} g dressed bird falls BELOW this contract's ` +
            `lowest band (${lowest} g). The schedule does not say what it pays for one, and ` +
            'reading the bottom band down to cover it would invent a price the contract ' +
            'does not contain.'
        }
      ];
    }
    if (sale.avg_dressed_weight_g > highest) {
      return [
        {
          key: 'bulk_price',
          why:
            `A ${sale.avg_dressed_weight_g} g dressed bird is ABOVE this contract's top band ` +
            `(${highest} g), and the schedule stops there. Reusing the top band would ` +
            'extrapolate past the stated range — and this schedule pays LESS as the bird ' +
            'gets heavier, so the extrapolation is not even conservative. What a heavier ' +
            'bird pays is question 2 on the Daniel list, unanswered. See OQ-30.'
        }
      ];
    }
    return [];
  }

  const rate =
    sale.pricing_basis === 'PER_KG' ? sale.price_cents_per_kg : sale.price_cents_per_bird;
  if (rate === null) {
    return [
      {
        key: 'bulk_price',
        why: `This BULK order is priced ${sale.pricing_basis} and carries no such price.`
      }
    ];
  }
  return [];
}
