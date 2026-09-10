/**
 * Thrown by an engine entry point that has not been built yet.
 *
 * This is load-bearing for CI, not decoration. The golden fixture step holds a
 * fixture — reports it, does not fail on it — only when the call it makes
 * throws this exact type. Any other throw, and any wrong value, fails the
 * build. So a fixture stops being excused the moment its module is
 * implemented, with no list anywhere to remember to update.
 */
export class NotImplementedError extends Error {
  readonly kind = 'not_implemented';
  readonly module: string;
  readonly unit: string;

  constructor(module: string, unit: string) {
    super(`${module} not implemented — ${unit}`);
    this.name = 'NotImplementedError';
    this.module = module;
    this.unit = unit;
  }
}

export function isNotImplemented(error: unknown): error is NotImplementedError {
  return (
    error instanceof NotImplementedError ||
    (error instanceof Error &&
      (error as { kind?: unknown }).kind === 'not_implemented' &&
      error.name === 'NotImplementedError')
  );
}
