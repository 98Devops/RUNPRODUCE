import { describe, it, expect } from 'vitest';
import { Money } from '../src/money.js';

describe('Money construction', () => {
  it('converts whole dollars to cents', () => {
    expect(Money.fromDollars(1)).toBe(100n);
  });

  it('converts fractional dollars to cents without float drift', () => {
    expect(Money.fromDollars(4.3)).toBe(430n);
    expect(Money.fromDollars(0.65)).toBe(65n);
    expect(Money.fromDollars(8079.81)).toBe(807981n);
  });

  it('rejects a dollar amount with sub-cent precision', () => {
    expect(() => Money.fromDollars(1.005)).toThrow(/sub-cent/i);
  });

  it('exposes zero', () => {
    expect(Money.zero).toBe(0n);
  });
});

describe('Money arithmetic', () => {
  it('adds', () => {
    expect(Money.add(Money.fromCents(100n), Money.fromCents(23n))).toBe(123n);
  });

  it('subtracts, permitting a negative result', () => {
    expect(Money.subtract(Money.fromCents(100n), Money.fromCents(150n))).toBe(-50n);
  });

  it('multiplies by an integer count', () => {
    expect(Money.multiplyByCount(Money.fromCents(269327n), 3000)).toBe(807981000n);
  });

  it('rejects a non-integer count', () => {
    expect(() => Money.multiplyByCount(Money.fromCents(100n), 1.5)).toThrow(/integer/i);
  });

  it('compares and tests equality', () => {
    expect(Money.compare(Money.fromCents(1n), Money.fromCents(2n))).toBe(-1);
    expect(Money.compare(Money.fromCents(2n), Money.fromCents(1n))).toBe(1);
    expect(Money.compare(Money.fromCents(2n), Money.fromCents(2n))).toBe(0);
    expect(Money.equals(Money.fromCents(2n), Money.fromCents(2n))).toBe(true);
  });
});

describe('Money.split — largest remainder allocation', () => {
  it('splits evenly when it divides exactly', () => {
    const parts = Money.split(Money.fromCents(300n), [1, 1, 1]);
    expect(parts).toEqual([100n, 100n, 100n]);
  });

  it('distributes the remainder to the largest fractional parts', () => {
    const parts = Money.split(Money.fromCents(100n), [1, 1, 1]);
    expect(parts).toEqual([34n, 33n, 33n]);
    expect(parts.reduce((a, b) => a + b, 0n)).toBe(100n);
  });

  it('splits by weight, summing exactly to the total', () => {
    const parts = Money.split(Money.fromCents(1000n), [70, 30]);
    expect(parts).toEqual([700n, 300n]);
  });

  it('splits bird-days weighting exactly (CR-3 case)', () => {
    const parts = Money.split(Money.fromCents(807981n), [35000, 15000]);
    expect(parts.reduce((a, b) => a + b, 0n)).toBe(807981n);
    expect(parts).toEqual([565587n, 242394n]);
  });

  it('handles a single weight by returning the whole total', () => {
    expect(Money.split(Money.fromCents(777n), [5])).toEqual([777n]);
  });

  it('assigns zero to zero weights', () => {
    const parts = Money.split(Money.fromCents(100n), [1, 0, 1]);
    expect(parts).toEqual([50n, 0n, 50n]);
    expect(parts.reduce((a, b) => a + b, 0n)).toBe(100n);
  });

  it('splits a negative total exactly', () => {
    const parts = Money.split(Money.fromCents(-100n), [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0n)).toBe(-100n);
  });

  it('rejects an empty weight list', () => {
    expect(() => Money.split(Money.fromCents(100n), [])).toThrow(/at least one/i);
  });

  it('rejects weights summing to zero', () => {
    expect(() => Money.split(Money.fromCents(100n), [0, 0])).toThrow(/sum to zero/i);
  });

  it('rejects a negative weight', () => {
    expect(() => Money.split(Money.fromCents(100n), [2, -1])).toThrow(/negative/i);
  });
});
