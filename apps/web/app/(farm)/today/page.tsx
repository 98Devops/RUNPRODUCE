import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { NotReady } from '@/components/not-ready';
import { authEnabled } from '@/lib/auth/config';
import { SIGN_IN_PATH } from '@/lib/auth/gate';
import { loadFarm } from '@/lib/nav/farm';
import { resolveBatch } from '@/lib/nav/resolve-batch';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  return { title: authEnabled() ? 'Today · RunProduce' : 'Not ready yet · RunProduce' };
}

type SearchParams = Promise<{ batch?: string | string[] }>;

/**
 * Today (AD-104, U7 D29): the day's capture for one batch. Open to every role.
 * Checks the user itself (D12); the layout's check is not the authority.
 */
export default async function TodayPage({ searchParams }: { readonly searchParams: SearchParams }) {
  if (!authEnabled()) return <NotReady />;
  const farm = await loadFarm();
  if (farm.kind === 'signed_out') redirect(`${SIGN_IN_PATH}?next=%2Ftoday`);
  if (farm.kind === 'no_access') return null;

  const { batch: param } = await searchParams;
  const resolved = resolveBatch(farm.batches, typeof param === 'string' ? param : null);

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
        <Link href="/today" className="text-lg font-medium text-accent underline decoration-accent/40 underline-offset-4">
          Show the current batch
        </Link>
      </main>
    );
  }

  return (
    <main className="grid gap-2">
      <h1 className="text-3xl font-semibold tracking-tight">Batch {resolved.batch.code}</h1>
      <p className="text-sm text-muted">The day’s form arrives in the next commit of this chunk.</p>
    </main>
  );
}
