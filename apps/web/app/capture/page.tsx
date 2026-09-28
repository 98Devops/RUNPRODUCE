import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { NotReady } from '@/components/not-ready';
import { authEnabled } from '@/lib/auth/config';
import { requestSessionClient } from '@/lib/auth/server';
import { currentUser, myMemberships, type Role } from '@/lib/repositories';
import { signOutAction } from './actions';

// Read per request: whether sign-in exists is the deploy's, not the build's.
export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  return { title: authEnabled() ? 'Daily capture · RunProduce' : 'Not ready yet · RunProduce' };
}

const ROLE_LABEL: Record<Role, string> = { OWNER: 'Owner', MANAGER: 'Manager', WORKER: 'Worker' };

/**
 * U7 chunk 2 placeholder: proves the session by saying who is signed in, for
 * which farm, in which role. Chunk 5 replaces the body with the capture form.
 * Checks the user itself (D12): middleware is not the authority.
 */
export default async function CapturePage() {
  if (!authEnabled()) return <NotReady />;
  const client = await requestSessionClient();
  const user = await currentUser(client);
  if (user === null) redirect('/sign-in?next=%2Fcapture');
  const memberships = await myMemberships(client);

  return (
    <main className="mx-auto grid min-h-[100dvh] max-w-[480px] content-start gap-8 px-4 pt-10 pb-10">
      <header className="flex items-center justify-between gap-4">
        <p className="text-sm font-semibold tracking-tight text-accent">RunProduce</p>
        <form action={signOutAction}>
          <button
            type="submit"
            className="h-11 rounded-md border border-line-strong bg-surface px-4 text-sm font-medium transition-colors hover:bg-raised active:translate-y-px"
          >
            Sign out
          </button>
        </form>
      </header>

      <section className="grid gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Daily capture</h1>
        <p className="text-sm text-muted">
          Signed in as <span className="text-ink">{user.email ?? 'this account'}</span>
        </p>
      </section>

      {memberships.length === 0 ? (
        <p className="rounded-lg border border-line bg-surface p-4 text-lg">
          No farm access yet. Ask the owner to add you.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {memberships.map((m) => (
            <li key={m.orgId} className="flex items-center justify-between gap-4 p-4">
              <span className="text-lg font-medium">{m.orgName}</span>
              <span className="text-sm text-muted">{ROLE_LABEL[m.role]}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="text-sm text-muted">The capture form arrives in the next step of this build.</p>
    </main>
  );
}
