import { describe, expect, it } from 'vitest';
import {
  SEED_OVERHEADS,
  overheadBreakdown,
  overheadCostCents,
  validateOverheadModel
} from '../src/overheads.js';
import type { OverheadLine, OverheadModel } from '../src/types.js';

const REFERENCE_FLOCK = 3000;

describe('SEED_OVERHEADS', () => {
  it("totals $1,222.00 at Daniel's own 3,000-bird scale (Final Report)", () => {
    expect(overheadCostCents(SEED_OVERHEADS, REFERENCE_FLOCK)).toBe(122200n);
  });

  it('carries the four Final Report line items and nothing else', () => {
    expect(SEED_OVERHEADS.lines.map((l) => l.key)).toEqual([
      'vaccine',
      'electricity_heating',
      'labour',
      'transport_other'
    ]);
  });

  it('books every line as measured, because every figure is his own', () => {
    for (const line of SEED_OVERHEADS.lines) {
      expect(line.confidence).toBe('measured');
    }
  });

  it('cites the source document on every line', () => {
    for (const line of SEED_OVERHEADS.lines) {
      expect(line.source).toMatch(/Final Report/);
    }
  });

  it("classifies fixed and variable as the client's brief does", () => {
    const basisByKey = Object.fromEntries(SEED_OVERHEADS.lines.map((l) => [l.key, l.basis]));
    expect(basisByKey).toEqual({
      vaccine: 'PER_BIRD',
      transport_other: 'PER_BIRD',
      labour: 'PER_BATCH',
      electricity_heating: 'PER_BATCH'
    });
  });

  it('books each line against the flock it was measured at', () => {
    for (const line of SEED_OVERHEADS.lines) {
      expect(line.measured_at_flock_size).toBe(REFERENCE_FLOCK);
    }
  });

  it('reproduces the Final Report line items exactly, in cents', () => {
    const centsByKey = Object.fromEntries(
      SEED_OVERHEADS.lines.map((l) => [l.key, l.amount_cents])
    );
    expect(centsByKey).toEqual({
      vaccine: 4200n,
      electricity_heating: 14000n,
      labour: 64000n,
      transport_other: 40000n
    });
  });
});

describe('overheadCostCents', () => {
  it('scales PER_BIRD lines with the flock and leaves PER_BATCH lines alone', () => {
    // 6,000 birds: vaccine and transport double, labour and electricity do not.
    // 8,400 + 80,000 + 64,000 + 14,000 = 166,400
    expect(overheadCostCents(SEED_OVERHEADS, 6000)).toBe(166400n);
  });

  it('includes extra chicks, because they are in the flock (fixture 12)', () => {
    // 3,100 birds: vaccine 4,340; transport ceil(41,333.33) = 41,334; fixed 78,000
    expect(overheadCostCents(SEED_OVERHEADS, 3100)).toBe(123674n);
  });

  it('rounds a scaled PER_BIRD line up, never down', () => {
    const model: OverheadModel = {
      lines: [
        {
          key: 'transport_other',
          label: 'Transport and other',
          basis: 'PER_BIRD',
          amount_cents: 40000n,
          measured_at_flock_size: 3000,
          confidence: 'measured',
          source: 'test'
        } as OverheadLine
      ]
    };
    // 40,000 x 3,100 / 3,000 = 41,333.33 exactly
    expect(overheadCostCents(model, 3100)).toBe(41334n);
  });

  it('is zero for an empty model, not a guess', () => {
    expect(overheadCostCents({ lines: [] }, 5000)).toBe(0n);
  });

  it('rejects a negative flock', () => {
    expect(() => overheadCostCents(SEED_OVERHEADS, -1)).toThrow(/flock/);
  });

  it('rejects a fractional flock', () => {
    expect(() => overheadCostCents(SEED_OVERHEADS, 3000.5)).toThrow(/integer/);
  });

  it('charges only the fixed lines when the flock is zero', () => {
    expect(overheadCostCents(SEED_OVERHEADS, 0)).toBe(78000n);
  });
});

describe('overheadBreakdown', () => {
  it('sums to the same total as overheadCostCents', () => {
    const breakdown = overheadBreakdown(SEED_OVERHEADS, 5000);
    const summed = breakdown.reduce((total, charge) => total + charge.cents, 0n);
    expect(summed).toBe(overheadCostCents(SEED_OVERHEADS, 5000));
  });

  it('carries confidence and label through to each charge, for the UI badge', () => {
    const breakdown = overheadBreakdown(SEED_OVERHEADS, 3000);
    const vaccine = breakdown.find((c) => c.key === 'vaccine');
    expect(vaccine).toMatchObject({ cents: 4200n, confidence: 'measured', basis: 'PER_BIRD' });
    expect(vaccine?.label).toBe('Vaccine');
  });
});

describe('validateOverheadModel', () => {
  const line = (over: Partial<OverheadLine>): OverheadLine =>
    ({
      key: 'labour',
      label: 'Labour',
      basis: 'PER_BATCH',
      amount_cents: 64000n,
      measured_at_flock_size: 3000,
      confidence: 'measured',
      source: 'test',
      ...over
    }) as OverheadLine;

  it('accepts the seed', () => {
    expect(validateOverheadModel(SEED_OVERHEADS)).toEqual([]);
  });

  it('reports a duplicated key rather than silently double-charging', () => {
    const model: OverheadModel = { lines: [line({}), line({})] };
    expect(validateOverheadModel(model)).toEqual(['overheads: duplicate line key labour']);
  });

  it('reports a negative amount', () => {
    const model: OverheadModel = { lines: [line({ amount_cents: -1n as never })] };
    expect(validateOverheadModel(model)).toContain(
      'overheads: labour amount_cents must not be negative'
    );
  });

  it('reports a PER_BIRD line measured at a zero flock, which cannot be scaled', () => {
    const model: OverheadModel = {
      lines: [line({ basis: 'PER_BIRD', measured_at_flock_size: 0 })]
    };
    expect(validateOverheadModel(model)).toContain(
      'overheads: labour is PER_BIRD so measured_at_flock_size must be a positive integer'
    );
  });

  it('reports every problem, not just the first', () => {
    const model: OverheadModel = {
      lines: [line({ amount_cents: -1n as never, basis: 'PER_BIRD', measured_at_flock_size: 0 })]
    };
    expect(validateOverheadModel(model)).toHaveLength(2);
  });

  it('allows a PER_BATCH line to carry no reference flock', () => {
    const model: OverheadModel = { lines: [line({ measured_at_flock_size: 0 })] };
    expect(validateOverheadModel(model)).toEqual([]);
  });
});
