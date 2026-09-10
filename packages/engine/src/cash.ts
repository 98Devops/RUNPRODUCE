import { addDays } from './day-number.js';
import { SEED_OVERHEADS, overheadBreakdown } from './overheads.js';
import type {
  CashCalendar,
  CashDay,
  CashFlow,
  Cents,
  EngineInput,
  FeedLiability,
  MissingInput,
  SalesOrder
} from './types.js';

/**
 * What the calendar cannot compute, and why — checked BEFORE projecting.
 *
 * M5b calls this first: a candidate that cannot be scored must return
 * `missing_input` rather than a number, and discovering that mid-projection
 * would mean throwing away work for every candidate.
 */
export function cashFlowsMissingInputs(input: EngineInput): MissingInput[] {
  const missing: MissingInput[] = [];
  if (!input.sales.some((sale) => sale.channel === 'BULK')) return missing;

  const { abattoir_fee_cents, transport_cents_per_bird, delivery_mode } = input.parameters;

  if (delivery_mode === 'ABATTOIR' && abattoir_fee_cents === null) {
    missing.push({
      key: 'abattoir_fee',
      why:
        'Bulk net needs the abattoir fee per bird (OQ-2). Until it and transport land, ' +
        'Cover Fast and Build Reserve return missing_input for any bulk-inclusive ' +
        'candidate while Maximum Growth still returns a real number — its scalar is ' +
        'placement size, which needs no bulk net. That split is expected, not a bug (AD-43).'
    });
  }
  if (transport_cents_per_bird === null) {
    missing.push({
      key: 'transport_cents_per_bird',
      why:
        'Bulk net needs transport to the abattoir (OQ-2), and OQ-16 gates it ' +
        'independently: the Final Report already books an Other/Transport line for a ' +
        'gate-sold batch, and the brief says do not double-count. An answered OQ-2 does ' +
        'not release OQ-16.'
    });
  }
  return missing;
}

/**
 * GROSS receipt for an order — contract price x quantity, nothing subtracted.
 *
 * Correct as-is for GATE, whose cash-in IS the gross amount. NOT correct for
 * BULK: bulk net is gross minus the abattoir fee minus transport, and this
 * function does not compute that. The BULK branch at the call site must
 * never pass this value through as a receipt — see the throw there.
 */
function receiptCents(sale: SalesOrder): Cents {
  if (sale.pricing_basis === 'PER_KG') {
    const rate = sale.price_cents_per_kg;
    if (rate === null) {
      throw new Error(`A PER_KG ${sale.channel} order has no price_cents_per_kg`);
    }
    // Integer grams against a per-kg rate, truncating — a receipt must never
    // round up in our favour.
    return ((rate * BigInt(sale.avg_live_weight_g) * BigInt(sale.bird_count)) / 1000n) as Cents;
  }
  const rate = sale.price_cents_per_bird;
  if (rate === null) {
    throw new Error(`A PER_BIRD ${sale.channel} order has no price_cents_per_bird`);
  }
  return (rate * BigInt(sale.bird_count)) as Cents;
}

/**
 * M5a — the cash calendar.
 *
 * Day-by-day opening / in / out / closing from placement through
 * `throughDay`. Pure arithmetic on dated flows; it holds no opinion about
 * which candidate or strategy is better.
 *
 * Chick cost and feed draw payments (Task 3) are the first flows to land
 * here. Sales receipts and overheads are Tasks 4-5.
 *
 * `throughDay` has NO DEFAULT on purpose. AD-43 makes the 90-day calendar a
 * display horizon while each allocation candidate is scored over its own
 * completion horizon, and a default here would let a caller silently inherit
 * the wrong window — the mismatch error AD-36 names.
 */
export function projectCashCalendar(
  input: EngineInput,
  throughDay: number,
  openingCents: Cents,
  feed: FeedLiability
): CashCalendar {
  if (throughDay < 1) {
    throw new Error(`through_day ${throughDay} is before placement day 1`);
  }

  const { placement_date, chick_count, extra_chick_count, chick_price_cents } = input.batch;
  const floor = input.parameters.reserve_floor_cents;

  const flows: CashFlow[] = [];

  // Invariant 9: extras count toward the flock, so they are paid for at the
  // same price as the rest — nothing scales off chick_count alone.
  const flock = chick_count + extra_chick_count;
  flows.push({
    kind: 'CHICK_COST',
    date: placement_date,
    amount_cents: -(chick_price_cents * BigInt(flock)) as Cents,
    description: `${flock} chicks at ${chick_price_cents} cents`
  });

  /**
   * Overhead TIMING is assumed, and this is the only assumption in the module.
   *
   * `computeCosting` gives amounts and no dates — the client books overheads
   * per batch, not per day. Charging them all at placement is the simplest
   * defensible choice and it is almost certainly wrong in shape: labour is
   * likely monthly, which would flatten the early-cycle trough materially.
   * OQ-19 asks him. Until then the calendar says `overhead_timing: 'assumed'`
   * so nobody reads the minimum balance as measured. The AMOUNTS are his,
   * measured, straight out of `overheadBreakdown` — only the date they land
   * on is this module's guess.
   */
  const overheads = input.parameters.overheads ?? SEED_OVERHEADS;
  for (const line of overheadBreakdown(overheads, flock)) {
    flows.push({
      kind: 'OVERHEAD',
      date: placement_date,
      amount_cents: -line.cents as Cents,
      description: `${line.label} (${line.basis}, timing assumed — OQ-19)`
    });
  }

  // A draw is paid on its DUE date, not its collection date. The due date is
  // M3's own — already derived as collection_date + the draw's own terms
  // (which beat parameters.feed_terms_days) — so it is used as-is rather than
  // recomputed here.
  for (const draw of feed.draws) {
    flows.push({
      kind: 'FEED_DRAW_PAYMENT',
      date: draw.due_date,
      amount_cents: -draw.total_cents as Cents,
      description: `${draw.bags} bags ${draw.phase} drawn ${draw.collection_date}`
    });
  }

  // A calendar missing a bulk receipt is not a calendar with a caveat, it is
  // a wrong balance — so this is a programming-error guard, not the
  // invariant-5 path. Callers must check cashFlowsMissingInputs() first and
  // return missing_input; this only catches one that skipped it.
  const missing = cashFlowsMissingInputs(input);
  if (missing.length > 0) {
    throw new Error(
      `Cannot project cash: bulk net is unavailable — ${missing.map((m) => m.key).join(', ')}. ` +
        'Call cashFlowsMissingInputs() first and return missing_input.'
    );
  }

  for (const sale of input.sales) {
    if (sale.channel === 'BULK') {
      // Unreachable today: every fixture leaves transport null, so
      // cashFlowsMissingInputs() throws above before this loop runs, and
      // this branch has no test of its own — that is expected, not a gap.
      // It does NOT become safe to delete once the client supplies both
      // abattoir_fee_cents and transport_cents_per_bird, though: the guard
      // above checks only whether the VALUES are present, not whether we
      // know how to combine them. OQ-16 asks whether transport belongs in
      // bulk net at all, since the Final Report already books a transport
      // line for a gate-sold batch — a question values alone cannot
      // answer. So this throws unconditionally for BULK, independent of
      // the guard, until the bulk-net formula itself is settled; booking
      // the gross contract price here would silently answer OQ-16 in the
      // client's stead, which is the wrong-balance invariant 5 forbids.
      throw new Error(
        'Cannot book a BULK receipt: bulk net is contract price minus abattoir fee minus ' +
          'transport, and whether transport belongs here at all is OQ-16 — the Final Report ' +
          'already books a transport line for a gate-sold batch. Implement the net when OQ-2 ' +
          'and OQ-16 are both answered; do not book the gross contract price.'
      );
    }
    // A gate sale is cash on the day, priced at the order's own terms_days
    // (0 for gate, but never assumed — always the order's own value).
    flows.push({
      kind: 'GATE_RECEIPT',
      date: addDays(sale.order_date, sale.terms_days),
      amount_cents: receiptCents(sale),
      description: `${sale.bird_count} birds ${sale.channel}`
    });
  }

  return buildDays(input, throughDay, openingCents, flows, floor);
}

/** Lays dated flows onto the day series. A flow outside the horizon is dropped. */
function buildDays(
  input: EngineInput,
  throughDay: number,
  openingCents: Cents,
  flows: readonly CashFlow[],
  floor: Cents
): CashCalendar {
  const byDate = new Map<string, CashFlow[]>();
  for (const flow of flows) {
    const existing = byDate.get(flow.date);
    if (existing === undefined) byDate.set(flow.date, [flow]);
    else existing.push(flow);
  }

  const days: CashDay[] = [];
  let opening = openingCents;

  for (let day = 1; day <= throughDay; day += 1) {
    const date = addDays(input.batch.placement_date, day - 1);
    const dayFlows = byDate.get(date) ?? [];

    let in_cents = 0n;
    let out_cents = 0n;
    for (const flow of dayFlows) {
      if (flow.amount_cents >= 0n) in_cents += flow.amount_cents;
      else out_cents += -flow.amount_cents;
    }

    const closing = (opening + in_cents - out_cents) as Cents;

    days.push({
      day_number: day,
      date,
      opening_cents: opening,
      in_cents: in_cents as Cents,
      out_cents: out_cents as Cents,
      closing_cents: closing,
      flows: dayFlows,
      breaches_reserve_floor: closing < floor
    });

    opening = closing;
  }

  return summarise(days, throughDay, openingCents);
}

/** The headline figures, derived from the day series so they cannot disagree. */
function summarise(
  days: readonly CashDay[],
  throughDay: number,
  openingCents: Cents
): CashCalendar {
  const [first, ...rest] = days;
  if (first === undefined) throw new Error('Cash calendar has no days');

  // The EARLIEST day holding the minimum, so a recurring trough reports its
  // first occurrence rather than its last.
  let minimum = first;
  for (const day of rest) {
    if (day.closing_cents < minimum.closing_cents) minimum = day;
  }

  const last = days[days.length - 1] ?? first;
  const breach = days.find((day) => day.breaches_reserve_floor) ?? null;

  return {
    days,
    through_day: throughDay,
    opening_cents: openingCents,
    closing_cents: last.closing_cents,
    minimum_cents: minimum.closing_cents,
    minimum_date: minimum.date,
    breaches_reserve_floor: breach !== null,
    first_breach_date: breach === null ? null : breach.date,
    overhead_timing: 'assumed'
  };
}
