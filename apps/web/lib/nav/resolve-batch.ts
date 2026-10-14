/**
 * Which batch a farm tab shows (AD-104, U7 D27). Pure: the layout and every
 * page call it with the batches they read and the `?batch=` they were given.
 *
 * - No code: the most recently placed batch, ties broken by the later code so
 *   the default never depends on the order rows arrive in.
 * - A code: that batch, matched exactly. Codes are unique per organisation as
 *   stored (`unique (org_id, code)`), so "b1" and "B1" are different batches.
 * - A code it cannot see: `unknown`, said plainly on the page. Never another
 *   batch in its place, which would show one batch's figures under another's name.
 */
export interface BatchRef {
  readonly code: string;
  readonly placementDate: string;
}

export type ResolvedBatch<B extends BatchRef> =
  | { readonly kind: 'batch'; readonly batch: B }
  | { readonly kind: 'none' }
  | { readonly kind: 'unknown'; readonly code: string };

export function resolveBatch<B extends BatchRef>(
  batches: readonly B[],
  param: string | null | undefined
): ResolvedBatch<B> {
  const [first, ...rest] = batches;
  if (first === undefined) return { kind: 'none' };

  if (param) {
    const chosen = batches.find((b) => b.code === param);
    return chosen ? { kind: 'batch', batch: chosen } : { kind: 'unknown', code: param };
  }

  const latest = rest.reduce((best, b) => (isLater(b, best) ? b : best), first);
  return { kind: 'batch', batch: latest };
}

/** ISO dates compare as strings. */
function isLater(a: BatchRef, b: BatchRef): boolean {
  if (a.placementDate !== b.placementDate) return a.placementDate > b.placementDate;
  return a.code > b.code;
}
