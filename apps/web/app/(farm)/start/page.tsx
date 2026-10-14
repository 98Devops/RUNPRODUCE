import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { NotReady } from '@/components/not-ready';
import { StartForm } from '@/components/start/start-form';
import { authEnabled } from '@/lib/auth/config';
import { SIGN_IN_PATH } from '@/lib/auth/gate';
import { formatBirds, formatCentsPlain, formatWeekdayDate } from '@/lib/format';
import { loadFarm } from '@/lib/nav/farm';
import { canStartBatch } from '@/lib/nav/tabs';
import { breedCurves, farmBatches } from '@/lib/repositories';
import { farmToday } from '@/lib/today/farm-date';
import { dayNumberFor } from '@runproduce/engine';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  return { title: authEnabled() ? 'Start batch · RunProduce' : 'Not ready yet · RunProduce' };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : null);

const LINK = 'text-lg font-medium text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent';

/**
 * Start batch (AD-104, U8): the Initialization sheet. OWNER and MANAGER only
 * (D1): a WORKER is sent to Today before anything is read. The open batches
 * are listed above the form (D6), each with "Correct" (D9).
 */
export default async function StartPage({ searchParams }: { readonly searchParams: SearchParams }) {
  if (!authEnabled()) return <NotReady />;
  const farm = await loadFarm();
  if (farm.kind === 'signed_out') redirect(`${SIGN_IN_PATH}?next=%2Fstart`);
  if (farm.kind === 'no_access') return null;
  if (!canStartBatch(farm.membership.role)) redirect('/today');

  const [batches, curves] = await Promise.all([farmBatches(farm.client), breedCurves(farm.client)]);
  const today = farmToday(new Date());
  const open = batches.filter((b) => b.closedOn === null && b.placementDate <= today);
  const correcting = one((await searchParams)['correct']);

  if (correcting !== null) {
    const batch = open.find((b) => b.code === correcting);
    if (batch === undefined) {
      return (
        <main className="grid gap-3">
          <p className="text-lg">That batch isn’t one you can correct.</p>
          <Link href="/start" className={LINK}>
            Back to Start batch
          </Link>
        </main>
      );
    }
    return (
      <main className="grid gap-6">
        <h1 className="text-3xl font-semibold tracking-tight">Correct {batch.code}</h1>
        <StartForm
          key={batch.placementVersionId}
          kind="correct"
          today={today}
          batch={batch}
          initial={{
            placementDate: batch.placementDate,
            chickCount: String(batch.chickCount),
            extraChickCount: String(batch.extraChickCount),
            chickPrice: formatCentsPlain(batch.chickPriceCents)
          }}
        />
        <Link href="/start" className={LINK}>
          Cancel
        </Link>
      </main>
    );
  }

  return (
    <main className="grid gap-6">
      <h1 className="text-3xl font-semibold tracking-tight">Start a batch</h1>

      {open.length > 0 && (
        <section aria-labelledby="open-heading" className="grid gap-2">
          <h2 id="open-heading" className="text-sm font-medium text-muted">
            Open now
          </h2>
          <ul className="grid gap-2">
            {open.map((b) => (
              <li key={b.batchId} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3">
                <p className="figures min-w-0 text-lg leading-snug">
                  <span className="font-semibold">{b.code}</span>
                  <span className="text-muted">
                    {' '}
                    · placed {formatWeekdayDate(b.placementDate)} · day {dayNumberFor(b.placementDate, today)} ·{' '}
                    {formatBirds(b.chickCount + b.extraChickCount)} birds
                  </span>
                </p>
                <Link
                  href={`/start?correct=${encodeURIComponent(b.code)}`}
                  className="flex h-11 shrink-0 items-center px-2 text-lg font-medium text-accent underline decoration-accent/40 underline-offset-4"
                >
                  Correct
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {curves.length === 0 ? (
        <p className="rounded-lg border border-line bg-surface p-4 text-lg">
          A batch needs your growth curve, and it isn’t set up yet. It’s loaded with your prices.
        </p>
      ) : (
        <StartForm kind="start" today={today} curves={curves} />
      )}
    </main>
  );
}
