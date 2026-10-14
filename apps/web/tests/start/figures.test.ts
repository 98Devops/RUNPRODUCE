/**
 * T-SB3 and T-SB4 · Counts and money from typed text, with no float
 * (u8-start-batch.md D2, rule 2). The same comma and decimal rules as feed
 * (`parseKgTenths`): a dot is the decimal point, and a comma is refused, never
 * guessed.
 */
import type { Cents } from '@runproduce/engine';
import { formatCentsPlain, parseCents, parseCount } from '../../lib/format.js';

describe('T-SB3 · parseCount', () => {
  it.each([
    ['6000', 6000],
    ['60', 60],
    ['0', 0],
    [' 6000 ', 6000],
    ['007', 7],
    ['9999999', 9_999_999]
  ])('reads %j as %i', (text, count) => {
    expect(parseCount(text)).toBe(count);
  });

  it.each([
    ['nothing', ''],
    ['spaces only', '   '],
    ['a thousands comma', '6,000'],
    ['a decimal', '6.0'],
    ['a negative', '-1'],
    ['a plus sign', '+5'],
    ['an exponent', '6e3'],
    ['eight digits', '10000000'],
    ['an inner space', '6 000'],
    ['words', 'six thousand'],
    ['non-ASCII digits', '٦٠٠٠']
  ])('refuses %s', (_label, text) => {
    expect(parseCount(text)).toBeNull();
  });
});

describe('T-SB4 · parseCents', () => {
  it.each([
    ['1', 100n],
    ['1.0', 100n],
    ['1.00', 100n],
    ['$1.00', 100n],
    [' 1.00 ', 100n],
    ['0.85', 85n],
    ['0.5', 50n],
    ['0', 0n],
    ['9999.99', 999_999n]
  ])('reads %j as %s cents', (text, cents) => {
    expect(parseCents(text)).toBe(cents);
  });

  it.each([
    ['nothing', ''],
    ['a comma decimal, which could be 1.00 or 100', '1,00'],
    ['a thousands comma', '1,000.00'],
    ['three decimals', '1.005'],
    ['a leading point', '.85'],
    ['a trailing point', '1.'],
    ['a negative', '-1.00'],
    ['a dollar sign after', '1.00$'],
    ['a space after the dollar sign', '$ 1.00'],
    ['two dollar signs', '$$1'],
    ['five whole digits', '10000.00'],
    ['an exponent', '1e2'],
    ['words', 'one dollar']
  ])('refuses %s', (_label, text) => {
    expect(parseCents(text)).toBeNull();
  });

  it('is exact for every amount from 0.00 to 99.99, as a bigint', () => {
    for (let cents = 0; cents <= 9_999; cents += 1) {
      const text = `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
      const parsed = parseCents(text);
      expect(typeof parsed).toBe('bigint');
      expect(parsed).toBe(BigInt(cents));
    }
  });

  it('round-trips through formatCentsPlain, the correction form’s fill', () => {
    for (const cents of [0n, 1n, 85n, 100n, 150n, 999_999n]) {
      expect(parseCents(formatCentsPlain(cents as Cents))).toBe(cents);
    }
    expect(formatCentsPlain(100n as Cents)).toBe('1.00');
    expect(formatCentsPlain(85n as Cents)).toBe('0.85');
  });
});
