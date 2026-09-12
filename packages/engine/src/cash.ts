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
  Parameters,
  Phase,
  SalesOrder
} from './types.js';

/**
 * The abattoir's cash fee per bird — **10 cents**, answered by the client
 * 2026-09-10 (OQ-2, first half). The abattoir also keeps the offals, which is
 * real value given up and is recorded rather than costed (AD-32).
 */
export const SEED_ABATTOIR_FEE_CENTS = 10n as Cents;

/**
 * What the run to the abattoir costs per bird — **10 cents**, answered by the
 * client 2026-09-12 (OQ-2, second half, closing it).
 *
 * **A SEPARATE cost from the fee above, which happens to be the same number**
 * (AD-55). One is what the abattoir charges to slaughter; the other is the
 * truck that gets the birds there. They were answered two days apart, they can
 * move independently, and one shared 10c constant would make today's
 * coincidence permanent and untraceable. Three different transport costs have
 * been in play on this project and conflating any two produces a double-count
 * or a hole — see `SEED_DELIVERY_CENTS_PER_TONNE` (feed delivery) and the
 * retired $400 "Other/Transport" overhead (OQ-16).
 *
 * **Charged on both delivery modes.** Whether a DIRECT run to the buyer costs
 * the same per bird is unanswered; this charges the one figure we have either
 * way, which is the conservative direction. The abattoir FEE, by contrast, is
 * correctly dropped on a DIRECT delivery — no abattoir, no fee.
 */
export const SEED_TRANSPORT_CENTS_PER_BIRD = 10n as Cents;

/**
 * Everything abattoir-related, per bird: **20 cents**. Named so the total is
 * derived from its two parts in one place rather than typed as a literal
 * anywhere, and so a change to either part cannot leave the total stale.
 */
export const SEED_ABATTOIR_COST_CENTS_PER_BIRD = (SEED_ABATTOIR_FEE_CENTS +
  SEED_TRANSPORT_CENTS_PER_BIRD) as Cents;

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
        'Bulk net needs the cost of the run to the abattoir. The client answered it on ' +
        '2026-09-12 — 10 cents a bird, SEED_TRANSPORT_CENTS_PER_BIRD, separate from the ' +
        '10c abattoir fee answered 2026-09-10, so 20c a bird in total — but this input ' +
        'does not carry it. A value being known is not the same as it being supplied, and ' +
        'nothing reads the seed behind the back of a caller: the seed is what an app-level ' +
        'default should be built from, not a silent fallback here.'
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
      'Bulk net is not implemented. The FORMULA is now settled — gross minus abattoir fee ' +
      'minus transport, with no offsetting overhead since the client retired the $400 ' +
      'Other/Transport line (OQ-16, retired 2026-09-12) — but no code computes it: ' +
      'receiptCents returns a GROSS amount and the BULK branch below refuses rather than ' +
      'booking it. This entry is what keeps that refusal a typed blank instead of a raw ' +
      'throw, and it must survive until the net is actually written.'
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
    cents += costOfFeed(gramsByPhase[phase.phase], phase);
  }
  return cents as Cents;
}


/**
 * Bulk net per bird — gross, minus the abattoir fee, minus transport.
 *
 * **Built and deliberately NOT yet wired into the calendar.** The arithmetic is
 * settled; the PRICE SOURCE is not. This function reads the ORDER's own price,
 * which is the least-invented choice — it is what the client entered for that
 * order — and it does NOT consult `parameters.bulk_bands`. Whether the contract
 * bands override an order's stated price is an open client question (the bands
 * top out at $3.70 for a 1.3 kg dressed bird, while his one recorded sale was
 * $2.00/kg = $5.75/bird at 2.875 kg live — two incompatible structures), and
 * OQ-22 tracks the same conflict from the code side. Wiring this into the BULK
 * branch waits on that answer, which is why `cashFlowsMissingInputs` still
 * refuses a bulk candidate.
 *
 * **Per-bird truncation is not the same as truncating the order total.** A
 * PER_KG gross truncates once per bird here, where `receiptCents` truncates
 * once across the whole order. They can differ by up to one cent per bird, and
 * that is correct for each: a per-bird net is a per-bird figure.
 *
 * **Offals are not netted.** AD-32 — the abattoir keeps them on top of the 10c
 * cash fee, which is real value given up, and nobody has priced it. Subtracting
 * zero would assert it is worthless; `SalesOrder` carries no offal field at all
 * yet, which is its own gap.
 */
export function bulkNetCentsPerBird(sale: SalesOrder, parameters: Parameters): Cents {
  const { abattoir_fee_cents, transport_cents_per_bird, delivery_mode } = parameters;

  // The programming-error guard, matching this module's precedent: callers
  // check cashFlowsMissingInputs() and report a typed refusal; this catches one
  // that skipped it. Transport is NOT zero by default — nobody has said the
  // truck is free, and the retired $400 overhead did not price it (OQ-16 was
  // retired, not answered).
  if (transport_cents_per_bird === null) {
    throw new Error(
      'Cannot net a BULK sale: transport per bird is unavailable (OQ-2). ' +
        'Call cashFlowsMissingInputs() first and return missing_input.'
    );
  }

  let gross: bigint;
  if (sale.pricing_basis === 'PER_KG') {
    const rate = sale.price_cents_per_kg;
    if (rate === null) throw new Error('A PER_KG BULK order has no price_cents_per_kg');
    // Truncating, per bird — a receipt must never round up in our favour.
    gross = (rate * BigInt(sale.avg_live_weight_g)) / 1000n;
  } else {
    const rate = sale.price_cents_per_bird;
    if (rate === null) throw new Error('A PER_BIRD BULK order has no price_cents_per_bird');
    gross = rate;
  }

  // The fee is the abattoir's. A DIRECT delivery to the buyer does not incur
  // it — though whether transport costs the same per bird on that route is
  // unanswered, and this charges the one figure we have either way.
  const fee = delivery_mode === 'ABATTOIR' ? (abattoir_fee_cents ?? 0n) : 0n;

  return (gross - fee - transport_cents_per_bird) as Cents;
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
  feed: FeedLiability,
  /**
   * Dated flows belonging to a DIFFERENT batch that is still running when this
   * one is placed — its feed draws falling due, its receipts landing.
   *
   * A parameter rather than something folded into `openingCents`, because
   * AD-43's reserve-floor filter reads the day-by-day trough and a lump at day
   * 1 would misstate it: a draw due on day 25 that dips the balance below the
   * floor is exactly the fact the filter exists to catch. `EngineInput.batch`
   * is singular, so there is no way to express a second batch inside `input`.
   *
   * Flows dated before this batch's placement still throw. That is deliberate:
   * anything the other batch settles before this one is placed belongs in
   * `openingCents`, and the throw is what stops it being counted twice.
   */
  carriedFlows: readonly CashFlow[] = []
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
    /**
     * Delivery lands on the COLLECTION date, not the due date — "on the spot
     * when the feed is collected" (client, 2026-09-12, closing OQ-28's timing
     * half). Its own flow rather than part of the payment above, because the
     * two fall on different days: the feed is on 30-day terms and the truck is
     * not. Folding them together would move up to $529 a cycle a month early
     * or a month late, and the trough is what the reserve-floor filter reads.
     */
    if (draw.delivery_cents > 0n) {
      flows.push({
        kind: 'FEED_DELIVERY_PAYMENT',
        date: draw.collection_date,
        amount_cents: -draw.delivery_cents as Cents,
        description: `Delivery of ${draw.kg} kg, paid on collection`
      });
    }
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
    /**
     * Delivery on feed not yet collected, on the planned COLLECTION date. An
     * upper bound like the `kg` it comes from, and carried for the AD-54
     * reason: leaving it off understates the projected trough by up to $529 a
     * cycle, and understatement is the flattering direction this engine must
     * not err in. It is deduped by the same collection-date key as the draw
     * payment above.
     */
    if (planned.delivery_cents > 0n) {
      flows.push({
        kind: 'PLANNED_FEED_DELIVERY_PAYMENT',
        date: planned.collection_date,
        amount_cents: -planned.delivery_cents as Cents,
        description: `Delivery of ${planned.kg} kg planned, paid on collection`
      });
    }
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
      // above checks only whether the VALUES are present, not whether any
      // code combines them. Since OQ-16's retirement (2026-09-12) the formula
      // is settled — gross minus abattoir fee minus transport, with nothing to
      // double-count against — but settling a formula does not write it. This
      // branch still has no net to book, so it refuses. So this throws unconditionally for BULK, independent of
      // the guard, until the bulk-net formula itself is settled; booking
      // the gross contract price here would silently answer OQ-16 in the
      // client's stead, which is the wrong-balance invariant 5 forbids.
      throw new Error(
        'Cannot book a BULK receipt: bulk net is contract price minus abattoir fee minus ' +
          'transport, and this function computes no such net — receiptCents returns GROSS. ' +
          'The formula is settled (OQ-16 retired 2026-09-12: the $400 overhead it might ' +
          'have double-counted no longer exists), and the abattoir fee is known (10c/bird, ' +
          '2026-09-10). What is missing is the transport value (OQ-2) and the ' +
          'implementation itself. Do not book the gross contract price.'
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

  flows.push(...carriedFlows);

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
