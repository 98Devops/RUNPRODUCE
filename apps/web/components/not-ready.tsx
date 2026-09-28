import Link from 'next/link';

/**
 * What `/sign-in` and `/capture` show on a deploy without sign-in (production
 * until U11; `authEnabled`). Plain on purpose: no form, no session, no
 * Supabase, so it renders with no environment at all. U11 retires it.
 */
export function NotReady() {
  return (
    <main className="mx-auto grid min-h-[100dvh] max-w-[480px] content-start gap-6 px-4 pt-16 pb-10">
      <p className="text-sm font-semibold tracking-tight text-accent">RunProduce</p>
      <div className="grid gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          This part of RunProduce isn’t ready yet.
        </h1>
        <p className="text-lg">
          <Link
            href="/"
            className="font-medium text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent"
          >
            Take a look at the dashboard for now →
          </Link>
        </p>
      </div>
    </main>
  );
}
