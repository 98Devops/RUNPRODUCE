import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { BatchPicker } from '@/components/farm/batch-picker';
import { TabBar } from '@/components/farm/tab-bar';
import { NotReady } from '@/components/not-ready';
import { authEnabled } from '@/lib/auth/config';
import { SIGN_IN_PATH } from '@/lib/auth/gate';
import { loadFarm } from '@/lib/nav/farm';
import { BUILT_TABS, showTabBar, visibleTabs } from '@/lib/nav/tabs';
import { signOutAction } from './actions';

// Read per request: whether sign-in exists is the deploy's, not the build's.
export const dynamic = 'force-dynamic';

/**
 * The farm layout (AD-104, U7 D27): the header and the tab bar every tab
 * shares. It checks the user itself (D12), and so does every page beneath it,
 * since a layout does not re-render on every navigation.
 */
export default async function FarmLayout({ children }: { readonly children: ReactNode }) {
  if (!authEnabled()) return <NotReady />;
  const farm = await loadFarm();
  if (farm.kind === 'signed_out') redirect(SIGN_IN_PATH);

  const tabs = farm.kind === 'farm' ? visibleTabs(farm.membership.role, BUILT_TABS) : [];
  const batches = farm.kind === 'farm' ? farm.batches.map((b) => ({ code: b.code, placementDate: b.placementDate })) : [];

  return (
    <div className={`mx-auto grid min-h-[100dvh] max-w-[480px] content-start gap-6 px-4 pt-6 ${showTabBar(tabs) ? 'pb-24' : 'pb-10'}`}>
      <header className="grid gap-3">
        <div className="flex items-center justify-between gap-4">
          <p className="min-w-0 truncate text-sm">
            <span className="font-semibold tracking-tight text-accent">RunProduce</span>
            {farm.kind === 'farm' && <span className="text-muted"> · {farm.membership.orgName}</span>}
          </p>
          <form action={signOutAction}>
            <button
              type="submit"
              className="h-11 rounded-md border border-line-strong bg-surface px-4 text-sm font-medium transition-colors hover:bg-raised active:translate-y-px"
            >
              Sign out
            </button>
          </form>
        </div>
        {batches.length > 1 && (
          <Suspense>
            <BatchPicker batches={batches} />
          </Suspense>
        )}
      </header>

      {farm.kind === 'no_access' ? (
        <main>
          <p className="rounded-lg border border-line bg-surface p-4 text-lg">No farm access yet. Ask the owner to add you.</p>
        </main>
      ) : (
        children
      )}

      <Suspense>
        <TabBar tabs={tabs} />
      </Suspense>
    </div>
  );
}
