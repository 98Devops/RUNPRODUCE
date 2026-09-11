import { SEED_BREED_CURVE, pointForDay } from './breed-curve.js';
import { costOfFeed } from './costing.js';
import { addDays, daysBetween } from './day-number.js';
import { SEED_OVERHEADS, overheadBreakdown } from './overheads.js';
import type {
  BreedCurve,
  CashCalendar,
  CashDay,
  CashFlow,
  Cents,
  EngineInput,
  FeedLiability,
  MissingInput,
  Phase,
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
  // OQ-16 is a question about the FORMULA — whether transport belongs in bulk
  // net at all — not about the two values above. Supplying both does not
  // answer it, so this entry must survive even once abattoir_fee_cents and
  // transport_cents_per_bird are both non-null. Without it,
  // cashFlowsMissingInputs() would return [] the day the client answers OQ-2,
  // and the BULK branch below would still throw unconditionally — a raw
  // Error where invariant 5 promises a typed blank. 'bulk_price' is the
  // existing key for "we cannot price a bulk sale"; this is exactly that.
  missing.push({
    key: 'bulk_price',
    why:
      'OQ-16 asks whether transport belongs in bulk net at all, given the Final Report ' +
      'already books an Other/Transport line for a gate-sold batch — a question about the ' +
      'bulk-net FORMULA, not its inputs. Supplying abattoir_fee_cents and ' +
      'transport_cents_per_bird does not release it: no BULK candidate is scoreable until ' +
      'OQ-16 is answered.'
  });
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
 * Prices a `PlannedDraw`'s span the way the rest of the engine prices feed —
 * `computeCosting`'s own method, grams per day bucketed by breed-curve phase,
 * each phase's cents rounded UP (`costOfFeed`, exported from costing.ts for
 * exactly this reuse) — because a `PlannedDraw` carries `bags` and `kg` but no
 * money of its own; nobody has entered a supplier price for feed not yet
 * drawn.
 *
 * `flock` is held FLAT across the span, matching `computeFeedLiability`'s own
 * treatment of `planned_draws` (U3 has no mortality model, AD-24) — the money
 * derived here must agree with the upper-bound `kg` already on the record,
 * not silently switch to a more precise, declining flock the rest of the
 * planned schedule does not use.
 */
function pricePlannedDrawSpan(
  curve: BreedCurve,
  flock: number,
  coversFirstDay: number,
  coversLastDay: number
): Cents {
  const gramsByPhase: Record<Phase, bigint> = { STARTER: 0n, GROWER: 0n, FINISHER: 0n };
  for (let day = coversFirstDay; day <= coversLastDay; day += 1) {
    const point = pointForDay(curve, day);
    gramsByPhase[point.phase] += BigInt(point.feed_g) * BigInt(flock);
  }
  let cents = 0n;
  for (const phase of curve.phases) {
    cents += costOfFeed(gramsByPhase[phase.phase], phase.price_per_kg_cents);
  }
  return cents as Cents;
}

/**
 * M5a — the cash calendar.
 *
 * Day-by-day opening / in / out / closing from placement through
 * `throughDay`. Pure arithmetic on dated flows; it holds no opinion about
 * which candidate or strategy is better.
 *
 * Chick cost, feed draw payments (both collected and planned), sales
 * receipts and overheads are the flows it projects.
 *
 * `throughDay` has NO DEFAULT on purpose. AD-43 makes the 90-day calendar a
 * display horizon while each allocation candidate is scored over its own
 * completion horizon, and a default here would let a caller silently inherit
 * the wrong window — the mismatch error AD-36 names.
 *
 * Two things are assumed rather than measured, and the calendar says so on
 * two separate fields rather than one, because they are independent facts:
 * `overhead_timing` (the amounts are the client's own; only the date they
 * land on is this module's guess) and `planned_feed_confidence` (feed not
 * yet drawn is priced off a flat-flock schedule, because U3 has no
 * mortality model — see `feed.planned_draws`).
 *
 * Sales orders are taken as given: every order in `input.sales` becomes a
 * receipt regardless of `order_date` relative to `input.asOf`. Unlike
 * `feed.ts`, which filters draws against `asOf` itself, this module does not
 * enforce invariant 7 on sales — the caller owns that filtering. M5b needs
 * this: a candidate's whole point is receipts that have not happened yet.
 */
export function projectCashCalendar(
  input: EngineInput,
  throughDay: number,
  /**
   * The balance at the START of day 1 — i.e. on the placement date, before
   * any flow this function projects. Day 1 re-books the full chick cost and
   * the full overhead lump, so passing the client's CURRENT balance on a
   * batch placed weeks before `asOf` double-counts that outflow. Any flow
   * that would fall before placement must already be folded in here; see the
   * throw in `buildDays`.
   */
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
   * Overhead TIMING is assumed — one of two independent assumptions in this
   * module; the other is the planned feed schedule below.
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

  /**
   * `feed.planned_draws` is the WHOLE-CYCLE idealised schedule (placement
   * through the last curve day), unconditionally — it is not filtered down
   * to "what remains", so it overlaps in concept with `feed.draws` for any
   * draw already collected. Booking every planned entry regardless would
   * double-charge that overlap: a real, measured `FEED_DRAW_PAYMENT` above,
   * and a second, assumed payment for the same feed here — a confident wrong
   * number in the pessimistic direction, but still one invariant 5 forbids.
   *
   * The dedup key is `collection_date`, not `due_date`: a real draw's due
   * date is `collection_date + the DRAW'S OWN terms_days` (which can differ
   * from `parameters.feed_terms_days`, the only terms a planned draw knows),
   * so two payments for the same physical collection can legitimately land
   * on different dates. Matching the collection event itself is what a
   * "has this already happened" question actually asks.
   *
   * A collection that happened on a date the idealised schedule would not
   * have chosen (drawn early or late in reality) will not match by this key
   * and so still double-counts — a known limitation of `planned_draws`
   * carrying no link back to the real schedule, not something this module
   * can repair without touching feed.ts.
   */
  const curve = input.curve ?? SEED_BREED_CURVE;
  const collectedDates = new Set(feed.draws.map((draw) => draw.collection_date));
  for (const planned of feed.planned_draws) {
    if (collectedDates.has(planned.collection_date)) continue;
    flows.push({
      kind: 'PLANNED_FEED_DRAW_PAYMENT',
      date: planned.due_date,
      amount_cents: -pricePlannedDrawSpan(
        curve,
        flock,
        planned.covers_first_day,
        planned.covers_last_day
      ) as Cents,
      description:
        `${planned.bags} bags planned, days ${planned.covers_first_day}-` +
        `${planned.covers_last_day} (not yet collected, schedule assumed)`
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

  return buildDays(input, throughDay, openingCents, flows, floor, feed.planned_confidence);
}

/**
 * Lays dated flows onto the day series.
 *
 * A flow AFTER the horizon is dropped — intended, and what a `throughDay`
 * shorter than the full projection is FOR. A flow BEFORE day 1 is not
 * dropped: it throws. `openingCents` is documented as the balance at the
 * start of day 1, with every pre-placement flow already folded in, so a flow
 * that lands before placement is a caller error — most likely a draw whose
 * `terms_days` collapsed its due date to before placement — and silently
 * discarding it would raise the reported minimum, the flattering direction
 * this engine must never err in.
 */
function buildDays(
  input: EngineInput,
  throughDay: number,
  openingCents: Cents,
  flows: readonly CashFlow[],
  floor: Cents,
  plannedFeedConfidence: CashCalendar['planned_feed_confidence']
): CashCalendar {
  const byDate = new Map<string, CashFlow[]>();
  for (const flow of flows) {
    if (daysBetween(input.batch.placement_date, flow.date) < 0) {
      throw new Error(
        `Cash flow dated ${flow.date} (${flow.kind}) falls before placement day 1 ` +
          `(${input.batch.placement_date}). A flow before day 1 belongs in openingCents, ` +
          'not in this projection — see the openingCents parameter doc.'
      );
    }
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

  return summarise(days, throughDay, openingCents, plannedFeedConfidence);
}

/** The headline figures, derived from the day series so they cannot disagree. */
function summarise(
  days: readonly CashDay[],
  throughDay: number,
  openingCents: Cents,
  plannedFeedConfidence: CashCalendar['planned_feed_confidence']
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
    overhead_timing: 'assumed',
    planned_feed_confidence: plannedFeedConfidence
  };
}
