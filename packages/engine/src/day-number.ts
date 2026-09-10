import type { IsoDate } from './types.js';

/**
 * Days since 1970-01-01 for a proleptic Gregorian calendar date.
 *
 * This is Howard Hinnant's `days_from_civil`, done in integer arithmetic. We
 * deliberately do NOT use `Date.UTC` here. `Date.UTC` would be pure in the
 * strict sense — arithmetic on its arguments, never a clock read — but the
 * engine's lint rule bans `Date` outright, and an exception weakens a guard
 * that exists precisely so nobody has to adjudicate case by case whether a
 * given `Date` use reads the clock. Twelve lines of arithmetic is cheaper
 * than a standing exemption.
 *
 * Correct for every date the product can see; leap years and century rules
 * are handled by the era arithmetic rather than by special cases.
 */
function daysFromCivil(year: number, month: number, day: number): number {
  // Shift the year so that March is month 1 — this puts the leap day at the
  // end of the year, which is what makes the rest of the arithmetic branchless.
  const y = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400; // [0, 399]
  const dayOfYear =
    Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1; // [0, 365]
  const dayOfEra =
    yearOfEra * 365 +
    Math.floor(yearOfEra / 4) -
    Math.floor(yearOfEra / 100) +
    dayOfYear; // [0, 146096]
  return era * 146097 + dayOfEra - 719468;
}

/** Parse 'YYYY-MM-DD' to days since the epoch. Rejects anything else. */
function epochDay(date: IsoDate): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (match === null) throw new Error(`Not an ISO date: ${date}`);
  const [, year, month, day] = match;
  return daysFromCivil(Number(year), Number(month), Number(day));
}

/**
 * Day number for a batch. Placement day is day 1, per CONTEXT.md — not day 0.
 *
 * Throws rather than returning a zero or negative day when `asOf` precedes
 * placement: every downstream caller indexes the breed curve with this, and a
 * day 0 would silently read the wrong row instead of failing.
 */
export function dayNumberFor(placement_date: IsoDate, asOf: IsoDate): number {
  const elapsed = epochDay(asOf) - epochDay(placement_date);
  if (elapsed < 0) {
    throw new Error(`asOf ${asOf} is before placement ${placement_date}`);
  }
  return elapsed + 1;
}
