import type { Metadata } from 'next';
import { NotReady } from '@/components/not-ready';
import { authEnabled } from '@/lib/auth/config';
import { safeNextPath } from '@/lib/auth/gate';
import { SignInForm } from './sign-in-form';

// Read per request: whether sign-in exists is the deploy's, not the build's.
export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  return { title: authEnabled() ? 'Sign in · RunProduce' : 'Not ready yet · RunProduce' };
}

/** U7 D12. Capture density (ui-context: one column, 480px, large targets). */
export default async function SignInPage({ searchParams }: { readonly searchParams: Promise<{ next?: string | string[] }> }) {
  if (!authEnabled()) return <NotReady />;
  const { next } = await searchParams;
  return (
    <main className="mx-auto grid min-h-[100dvh] max-w-[480px] content-start gap-8 px-4 pt-16 pb-10">
      <header className="grid gap-1">
        <p className="text-sm font-semibold tracking-tight text-accent">RunProduce</p>
        <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
      </header>
      <SignInForm next={safeNextPath(typeof next === 'string' ? next : undefined)} />
    </main>
  );
}
