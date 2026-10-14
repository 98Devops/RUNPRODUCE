'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { IsoDate } from '@runproduce/engine';
import { formatShortDate } from '@/lib/format';
import { resolveBatch, type BatchRef } from '@/lib/nav/resolve-batch';

/**
 * The batch picker (AD-104, U7 D27). Shown only when there is a choice; the
 * layout decides that. It reads `?batch=` because a layout is never given the
 * query, and changing it drops every other parameter: a date belongs to the
 * batch it was picked for.
 */
export function BatchPicker({ batches }: { readonly batches: readonly BatchRef[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const resolved = resolveBatch(batches, useSearchParams().get('batch'));
  const value = resolved.kind === 'batch' ? resolved.batch.code : '';

  return (
    <label className="grid gap-1 text-sm text-muted">
      <span className="sr-only">Batch</span>
      <select
        value={value}
        onChange={(event) => router.push(`${pathname}?batch=${encodeURIComponent(event.target.value)}`)}
        className="h-11 w-full min-w-0 rounded-md border border-line-strong bg-surface px-3 text-lg text-ink outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
      >
        {value === '' && <option value="">Pick a batch</option>}
        {batches.map((b) => (
          <option key={b.code} value={b.code}>
            {b.code} · placed {formatShortDate(b.placementDate as IsoDate)}
          </option>
        ))}
      </select>
    </label>
  );
}
