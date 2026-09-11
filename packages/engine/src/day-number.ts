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

/**
 * The inverse of `daysFromCivil` — Hinnant's `civil_from_days`, same era
 * arithmetic run backwards. Kept here beside its inverse so the two cannot
 * drift apart, and written for the same reason: the engine's lint rule bans
 * `Date` outright, and a due date is arithmetic on a calendar, not a clock.
 */
function civilFromDays(z: number): { year: number; month: number; day: number } {
  const shifted = z + 719468;
  const era = Math.floor(shifted / 146097);
  const dayOfEra = shifted - era * 146097; // [0, 146096]
  const yearOfEra =
    Math.floor(
      dayOfEra -
        Math.floor(dayOfEra / 1460) +
        Math.floor(dayOfEra / 36524) -
        Math.floor(dayOfEra / 146096)
    ) / 365;
  const y = Math.floor(yearOfEra) + era * 400;
  const dayOfYear = dayOfEra - (365 * Math.floor(yearOfEra) + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const mp = Math.floor((5 * dayOfYear + 2) / 153); // [0, 11], March = 0
  const day = dayOfYear - Math.floor((153 * mp + 2) / 5) + 1; // [1, 31]
  const month = mp + (mp < 10 ? 3 : -9); // [1, 12]
  return { year: y + (month <= 2 ? 1 : 0), month, day };
}

const pad = (n: number, width: number): string => String(n).padStart(width, '0');

/**
 * `date` plus `n` days, as an ISO date.
 *
 * The only date construction the engine performs. Due dates are
 * `collection_date + terms_days` and nothing else — CONTEXT.md calls them
 * "always derived, never entered", and the architecture generates the column
 * the same way.
 */
export function addDays(date: IsoDate, n: number): IsoDate {
  const { year, month, day } = civilFromDays(epochDay(date) + n);
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}` as IsoDate;
}

/** Whole days from `from` to `to`. Negative when `to` precedes `from`. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return epochDay(to) - epochDay(from);
}
