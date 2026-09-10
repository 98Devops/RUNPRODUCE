import { addDays } from './day-number.js';
import type { CashCalendar, CashDay, Cents, EngineInput } from './types.js';

/**
 * M5a — the cash calendar.
 *
 * Day-by-day opening / in / out / closing from placement through
 * `throughDay`. Pure arithmetic on dated flows; it holds no opinion about
 * which candidate or strategy is better.
 *
 * This is the spine only: it produces the right number of dated days with
 * balances carrying forward, and nothing else. It deliberately carries no
 * flows — chick cost, feed draw payments, sales receipts and overheads are
 * Tasks 3-5, and every `in_cents` / `out_cents` here is zero until they land.
 *
 * `throughDay` has NO DEFAULT on purpose. AD-43 makes the 90-day calendar a
 * display horizon while each allocation candidate is scored over its own
 * completion horizon, and a default here would let a caller silently inherit
 * the wrong window — the mismatch error AD-36 names.
 */
export function projectCashCalendar(
  input: EngineInput,
  throughDay: number,
  openingCents: Cents
): CashCalendar {
  if (throughDay < 1) {
    throw new Error(`through_day ${throughDay} is before placement day 1`);
  }

  const { placement_date } = input.batch;
  const floor = input.parameters.reserve_floor_cents;

  const days: CashDay[] = [];
  let opening = openingCents;

  for (let day = 1; day <= throughDay; day += 1) {
    const date = addDays(placement_date, day - 1);
    const in_cents = 0n as Cents;
    const out_cents = 0n as Cents;
    const closing = (opening + in_cents - out_cents) as Cents;

    days.push({
      day_number: day,
      date,
      opening_cents: opening,
      in_cents,
      out_cents,
      closing_cents: closing,
      flows: [],
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
