/**
 * T-T4 · Typed kilograms to integer grams with no float (U7 D31, rule 2).
 * `parseFloat("32.3") * 1000` is 32,299.999…, and 47 of the 5,001 one-decimal
 * values up to 500 kg go wrong the same way, on a field stored as MEASURED.
 */
import { formatKgTenths, parseKgTenths } from '../../lib/format.js';

describe('T-T4 · parseKgTenths', () => {
  it.each([
    ['302.5', 302_500],
    ['302', 302_000],
    ['32.3', 32_300],
    ['0.1', 100],
    ['0', 0],
    ['007.5', 7_500],
    [' 302.5 ', 302_500],
    ['1212.0', 1_212_000]
  ])('reads %j as %i g', (text, grams) => {
    expect(parseKgTenths(text)).toBe(grams);
  });

  it.each([
    ['two decimals', '302.55'],
    ['a negative', '-1'],
    ['an exponent', '1e3'],
    ['nothing', ''],
    ['spaces only', '   '],
    ['a comma decimal, which could be 3.02 or 302', '3,02'],
    ['a thousands comma', '1,212.0'],
    ['a trailing point', '302.'],
    ['a leading point', '.5'],
    ['a plus sign', '+5'],
    ['words', 'about 300'],
    ['a unit', '302kg'],
    ['Infinity', 'Infinity'],
    ['NaN', 'NaN'],
    ['hex', '0x10'],
    ['non-ASCII digits', '٣٠٢'],
    ['more than a 32-bit gram column holds', '2147484']
  ])('refuses %s', (_label, text) => {
    expect(parseKgTenths(text)).toBeNull();
  });

  it('is exact for every one-decimal value up to 500 kg, where parseFloat is not', () => {
    let floatWrong = 0;
    for (let tenths = 0; tenths <= 5_000; tenths += 1) {
      const text = `${Math.floor(tenths / 10)}.${tenths % 10}`;
      const grams = parseKgTenths(text);
      expect(grams).toBe(tenths * 100);
      expect(Number.isInteger(grams)).toBe(true);
      if (parseFloat(text) * 1000 !== tenths * 100) floatWrong += 1;
    }
    // The finding that motivated D31, held so the test proves what it claims.
    expect(floatWrong).toBe(47);
  });

  it('accepts the largest value the gram column holds, to the tenth', () => {
    expect(parseKgTenths('2147483.6')).toBe(2_147_483_600);
    expect(parseKgTenths('2147483.7')).toBeNull();
  });
});

describe('T-T4 · formatKgTenths, the display and the "Use" fill', () => {
  it.each([
    [303_000, '303.0'],
    [302_550, '302.6'],
    [302_549, '302.5'],
    [50, '0.1'],
    [49, '0.0'],
    [0, '0.0'],
    [1_212_000, '1212.0']
  ])('shows %i g as %s', (grams, text) => {
    expect(formatKgTenths(grams)).toBe(text);
  });

  it('never groups thousands, so the figure it fills is one parseKgTenths accepts', () => {
    for (const grams of [0, 49, 999_950, 1_212_345, 2_000_000]) {
      expect(parseKgTenths(formatKgTenths(grams))).not.toBeNull();
    }
  });
});
