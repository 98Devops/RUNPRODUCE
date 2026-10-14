/**
 * The presentation boundary (code-standards.md: formatting happens in
 * `apps/web` only). Money stays bigint until it becomes text here, so no figure
 * passes through a float on its way to the screen.
 */
import type { Cents, IsoDate } from '@runproduce/engine';

const MINUS = '−';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * `$11,504` in summary views, `$11,504.37` in ledgers (ui-context.md). Summary
 * rounding is half away from zero, so a negative rounds the same way its
 * magnitude would.
 */
export function formatMoney(value: Cents, options: { readonly cents?: boolean } = {}): string {
  const negative = value < 0n;
  const magnitude = negative ? -value : value;

  let text: string;
  if (options.cents === true) {
    const dollars = magnitude / 100n;
    const rest = (magnitude % 100n).toString().padStart(2, '0');
    text = `$${groupThousands(dollars.toString())}.${rest}`;
  } else {
    const dollars = (magnitude + 50n) / 100n;
    if (dollars === 0n) return '$0';
    text = `$${groupThousands(dollars.toString())}`;
  }
  return negative && magnitude > 0n ? `${MINUS}${text}` : text;
}

/** Always thousands-separated, never abbreviated. */
export function formatBirds(count: number): string {
  return groupThousands(String(count));
}

/** `8 Mar`. Read from the ISO string itself, so no time zone can shift the day. */
export function formatShortDate(date: IsoDate): string {
  const [, month, day] = date.split('-');
  return `${Number(day)} ${MONTHS[Number(month) - 1]}`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** `Sat 17 Oct`. The weekday is computed in UTC from the ISO string, so no time zone can shift it. */
export function formatWeekdayDate(date: IsoDate): string {
  const [year, month, day] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1)).getUTCDay();
  return `${WEEKDAYS[weekday]} ${formatShortDate(date)}`;
}

/** `Day 30 · 7 Mar`: the cycle day and the calendar date, always together. */
export function formatDayDate(dayNumber: number, date: IsoDate): string {
  return `Day ${dayNumber} · ${formatShortDate(date)}`;
}

/** The feed columns are Postgres `integer`: no figure above this is storable. */
const MAX_FEED_G = 2_147_483_647;

/**
 * Typed kilograms to integer grams, read as a decimal string with no float
 * (U7 D31, rule 2): `parseFloat("32.3") * 1000` is 32,299.999…. A whole
 * number or one decimal, ASCII digits only. Anything else is null, including
 * a comma decimal: "3,02" could mean 3.02 or 302, and guessing would store a
 * number the worker never typed under MEASURED.
 */
export function parseKgTenths(text: string): number | null {
  const match = /^(\d+)(?:\.(\d))?$/.exec(text.trim());
  if (match === null) return null;
  const [, whole = '', tenth = '0'] = match;
  // Integer arithmetic only. Over 7 whole digits is already past the column.
  if (whole.replace(/^0+/, '').length > 7) return null;
  const grams = Number(whole) * 1000 + Number(tenth) * 100;
  return grams <= MAX_FEED_G ? grams : null;
}

/**
 * Grams to kilograms at one decimal, half up, for display and for the
 * standard the "Use" button fills in. Never grouped, so the figure it fills
 * is one `parseKgTenths` accepts. The stored figure stays the exact grams.
 */
export function formatKgTenths(grams: number): string {
  const tenths = Math.floor((grams + 50) / 100);
  return `${Math.floor(tenths / 10)}.${tenths % 10}`;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * One input of an `Explained<T>`, whose value is typed `unknown`: money is
 * bigint cents (with cents, since the popover is the detail view), a date is an
 * ISO string, a count is a number, and anything else is already words.
 */
export function formatInput(value: unknown): string {
  if (typeof value === 'bigint') return formatMoney(value as Cents, { cents: true });
  if (typeof value === 'number') return formatBirds(value);
  if (typeof value === 'string' && ISO_DATE.test(value)) return formatShortDate(value as IsoDate);
  return String(value);
}
