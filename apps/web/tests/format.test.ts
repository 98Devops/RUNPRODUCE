/**
 * Display formatting (ui-context.md, "Number formatting rules"). The engine
 * hands over bigint cents and ISO dates; these are the only places they become
 * text.
 */
import type { Cents, IsoDate } from '@runproduce/engine';
import { formatBirds, formatDayDate, formatMoney, formatShortDate } from '../lib/format.js';

const cents = (n: bigint) => n as Cents;

describe('formatMoney', () => {
  it('drops cents in summary views, rounding half away from zero', () => {
    expect(formatMoney(cents(1_956_168n))).toBe('$19,562');
    expect(formatMoney(cents(1_956_149n))).toBe('$19,561');
    expect(formatMoney(cents(50n))).toBe('$1');
  });

  it('keeps cents in ledger views', () => {
    expect(formatMoney(cents(1_956_168n), { cents: true })).toBe('$19,561.68');
    expect(formatMoney(cents(5n), { cents: true })).toBe('$0.05');
  });

  it('prints a negative with a true minus sign, before the dollar', () => {
    expect(formatMoney(cents(-1_956_168n))).toBe('−$19,562');
    expect(formatMoney(cents(-50n))).toBe('−$1');
    expect(formatMoney(cents(-1_956_168n), { cents: true })).toBe('−$19,561.68');
  });

  it('prints zero as $0, never signed', () => {
    expect(formatMoney(cents(0n))).toBe('$0');
    expect(formatMoney(cents(-49n))).toBe('$0');
  });

  it('carries a value past 2^53 exactly', () => {
    expect(formatMoney(cents(900_719_925_474_099_300n), { cents: true })).toBe('$9,007,199,254,740,993.00');
  });
});

describe('formatBirds', () => {
  it('always separates thousands and never abbreviates', () => {
    expect(formatBirds(5000)).toBe('5,000');
    expect(formatBirds(2675)).toBe('2,675');
    expect(formatBirds(155_000)).toBe('155,000');
    expect(formatBirds(7)).toBe('7');
  });
});

describe('dates', () => {
  it('a short date is day and month, in UTC so the day never shifts', () => {
    expect(formatShortDate('2026-03-08' as IsoDate)).toBe('8 Mar');
    expect(formatShortDate('2026-04-12' as IsoDate)).toBe('12 Apr');
  });

  it('shows both the cycle day and the calendar date', () => {
    expect(formatDayDate(30, '2026-03-07' as IsoDate)).toBe('Day 30 · 7 Mar');
  });
});
