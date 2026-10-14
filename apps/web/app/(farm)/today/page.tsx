import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { IsoDate } from '@runproduce/engine';
import { NotReady } from '@/components/not-ready';
import { DatePicker } from '@/components/today/date-picker';
import { TodayForm } from '@/components/today/today-form';
import { authEnabled } from '@/lib/auth/config';
import { SIGN_IN_PATH } from '@/lib/auth/gate';
import { formatWeekdayDate } from '@/lib/format';
import { loadFarm } from '@/lib/nav/farm';
import { resolveBatch } from '@/lib/nav/resolve-batch';
import { curvePoints, dailyRecords } from '@/lib/repositories';
import { farmToday } from '@/lib/today/farm-date';
import { buildTodayView } from '@/lib/today/view';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  return { title: authEnabled() ? 'Today · RunProduce' : 'Not ready yet · RunProduce' };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : null);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const LINK = 'text-lg font-medium text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent';

/**
 * Today (AD-104, U7 D29): one day's capture for one batch. Open to every role.
 * It checks the user itself (D12); the layout's check is not the authority,
 * and the save action checks everything again.
 */
export default async function TodayPage({ searchParams }: { readonly searchParams: SearchParams }) {
  if (!authEnabled()) return <NotReady />;
  const farm = await loadFarm();
  if (farm.kind === 'signed_out') redirect(`${SIGN_IN_PATH}?next=%2Ftoday`);
  if (farm.kind === 'no_access') return null;

  const params = await searchParams;
  const resolved = resolveBatch(farm.batches, one(params['batch']));

  if (resolved.kind === 'none') {
    return (
      <main>
        <p className="text-lg">No batch is running yet.</p>
      </main>
    );
  }
  if (resolved.kind === 'unknown') {
    return (
      <main className="grid gap-3">
        <p className="text-lg">That batch isn’t one you can see.</p>
        <Link href="/today" className={LINK}>
          Show the current batch
        </Link>
      </main>
    );
  }

  const batch = resolved.batch;
  const today = farmToday(new Date());
  const placement = batch.placementDate;
  // Always named, so a batch placed mid-backfill never takes over the URL as the new default.
  const batchQuery = `batch=${encodeURIComponent(batch.code)}&`;

  if (today < placement) {
    return (
      <main>
        <p className="text-lg">
          Batch {batch.code} is placed on {formatWeekdayDate(placement)}. Record from that day.
        </p>
      </main>
    );
  }

  const asked = one(params['date']);
  const date = (asked ?? today) as IsoDate;
  // Never moved silently to the nearest allowed day: the worker picks again.
  if (!ISO.test(date) || date < placement || date > today) {
    return (
      <main className="grid gap-4">
        <p className="text-lg">Pick a day from placement ({formatWeekdayDate(placement)}) to today.</p>
        <DatePicker value={today} min={placement} max={today} hrefFor={`/today?${batchQuery}date=`} />
      </main>
    );
  }

  const [records, points] = await Promise.all([dailyRecords(farm.client, batch.batchId), curvePoints(farm.client, batch.breedCurveId)]);
  const view = buildTodayView({
    batch,
    points,
    records,
    date,
    today,
    role: farm.membership.role,
    userId: farm.user.userId
  });

  const saved = one(params['saved']);
  const removed = one(params['removed']);

  return (
    <main className="grid gap-6">
      <section className="grid gap-1">
        <h1 className="figures text-3xl font-semibold tracking-tight">
          Day {view.dayNumber} · {view.dayDate}
        </h1>
        <p className="figures text-sm text-muted">
          {view.lastRecorded === null ? 'Nothing recorded yet' : `Last recorded day ${view.lastRecorded.day}`}
          {view.missing !== null && (
            <span className="text-[var(--state-warning)]">
              {' '}
              · {view.missing.count} {view.missing.count === 1 ? 'day' : 'days'} missing, from{' '}
              <Link
                href={`/today?${batchQuery}date=${view.missing.firstDate}`}
                className="font-medium underline decoration-[var(--state-warning)]/40 underline-offset-4"
              >
                day {view.missing.firstDay}
              </Link>
            </span>
          )}
        </p>
      </section>

      {(saved !== null || removed !== null) && (
        <p role="status" className="rounded-lg border border-accent-soft-border bg-accent-soft p-3 text-lg">
          {saved !== null ? `Saved day ${saved}.` : `Removed day ${removed}’s record.`}
        </p>
      )}

      <DatePicker key={date} value={date} min={placement} max={today} hrefFor={`/today?${batchQuery}date=`} />

      <TodayForm
        key={`${batch.batchId}:${date}:${view.existing?.id ?? 'new'}`}
        batchId={batch.batchId}
        batchQuery={batchQuery}
        date={date}
        view={view}
      />
    </main>
  );
}
