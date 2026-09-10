export type Cents = bigint & { readonly __brand: 'Cents' };

const asCents = (n: bigint): Cents => n as Cents;

function fromCents(n: bigint): Cents {
  return asCents(n);
}

function fromDollars(dollars: number): Cents {
  const scaled = dollars * 100;
  const rounded = Math.round(scaled);
  if (Math.abs(scaled - rounded) > 1e-6) {
    throw new Error(`Money.fromDollars: ${dollars} has sub-cent precision`);
  }
  return asCents(BigInt(rounded));
}

function add(a: Cents, b: Cents): Cents {
  return asCents(a + b);
}

function subtract(a: Cents, b: Cents): Cents {
  return asCents(a - b);
}

function multiplyByCount(amount: Cents, count: number): Cents {
  if (!Number.isInteger(count)) {
    throw new Error(`Money.multiplyByCount: count ${count} must be an integer`);
  }
  return asCents(amount * BigInt(count));
}

function compare(a: Cents, b: Cents): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function equals(a: Cents, b: Cents): boolean {
  return a === b;
}

/**
 * Largest-remainder allocation. sum(result) === total, exactly, always.
 */
function split(total: Cents, weights: readonly number[]): Cents[] {
  if (weights.length === 0) {
    throw new Error('Money.split: needs at least one weight');
  }
  for (const w of weights) {
    if (!Number.isInteger(w)) {
      throw new Error(`Money.split: weight ${w} must be an integer`);
    }
    if (w < 0) {
      throw new Error(`Money.split: weight ${w} must not be negative`);
    }
  }

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight === 0) {
    throw new Error('Money.split: weights sum to zero');
  }

  const totalWeightBig = BigInt(totalWeight);
  const negative = total < 0n;
  const magnitude = negative ? -total : total;

  const base: bigint[] = [];
  const remainders: { index: number; remainder: bigint }[] = [];
  let allocated = 0n;

  for (let i = 0; i < weights.length; i++) {
    const weight = BigInt(weights[i] ?? 0);
    const product = magnitude * weight;
    const share = product / totalWeightBig;
    base.push(share);
    remainders.push({ index: i, remainder: product % totalWeightBig });
    allocated += share;
  }

  let leftover = magnitude - allocated;
  remainders.sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1
  );

  for (const { index } of remainders) {
    if (leftover === 0n) break;
    base[index] = (base[index] ?? 0n) + 1n;
    leftover -= 1n;
  }

  return base.map((n) => asCents(negative ? -n : n));
}

export const Money = {
  zero: asCents(0n),
  fromCents,
  fromDollars,
  add,
  subtract,
  multiplyByCount,
  compare,
  equals,
  split
} as const;
