import { describe, expect, it } from 'vitest';
import { dayNumberFor } from '../src/day-number.js';
import type { IsoDate } from '../src/types.js';

const iso = (s: string): IsoDate => s as IsoDate;

describe('dayNumberFor', () => {
  it('returns 1 on placement day', () => {
    expect(dayNumberFor(iso('2026-02-06'), iso('2026-02-06'))).toBe(1);
  });

  it('returns 41 for the fixture 1 window', () => {
    expect(dayNumberFor(iso('2026-02-06'), iso('2026-03-18'))).toBe(41);
  });

  it('returns 30 for the fixture 4 window', () => {
    expect(dayNumberFor(iso('2026-02-06'), iso('2026-03-07'))).toBe(30);
  });

  it('crosses a month boundary without drift', () => {
    expect(dayNumberFor(iso('2026-02-06'), iso('2026-03-01'))).toBe(24);
  });

  it('throws when asOf precedes placement', () => {
    expect(() => dayNumberFor(iso('2026-02-06'), iso('2026-02-05'))).toThrow(
      /before placement/i,
    );
  });

  it('rejects a malformed date rather than coercing it', () => {
    expect(() => dayNumberFor(iso('2026-02-06'), iso('18/03/2026'))).toThrow(
      /not an iso date/i,
    );
  });

  // The calendar arithmetic is hand-rolled, so prove it rather than trusting
  // that the two fixture windows happening to work means it is right.
  it('counts the leap day in a leap year', () => {
    expect(dayNumberFor(iso('2024-02-28'), iso('2024-03-01'))).toBe(3);
  });

  it('does not count a leap day in a common year', () => {
    expect(dayNumberFor(iso('2026-02-28'), iso('2026-03-01'))).toBe(2);
  });

  it('treats 2000 as a leap year and 1900 as not', () => {
    expect(dayNumberFor(iso('2000-02-28'), iso('2000-03-01'))).toBe(3);
    expect(dayNumberFor(iso('1900-02-28'), iso('1900-03-01'))).toBe(2);
  });

  it('crosses a year boundary without drift', () => {
    expect(dayNumberFor(iso('2026-12-31'), iso('2027-01-01'))).toBe(2);
  });

  it('spans a full common year', () => {
    expect(dayNumberFor(iso('2026-01-01'), iso('2027-01-01'))).toBe(366);
  });
});
