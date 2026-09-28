'use client';

import { useActionState } from 'react';
import { signInAction, type SignInState } from './actions';

const INITIAL: SignInState = { message: null, email: '' };

const INPUT =
  'h-14 w-full rounded-md border border-line-strong bg-surface px-4 text-xl text-ink outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30';

export function SignInForm({ next }: { readonly next: string }) {
  const [state, action, pending] = useActionState(signInAction, INITIAL);

  return (
    <form action={action} className="grid gap-5" noValidate>
      <input type="hidden" name="next" value={next} />
      <div className="grid gap-2">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          defaultValue={state.email}
          className={INPUT}
        />
      </div>
      <div className="grid gap-2">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className={INPUT} />
      </div>

      <p role="alert" aria-live="polite" className="min-h-5 text-sm text-[var(--state-error)]">
        {state.message}
      </p>

      <button
        type="submit"
        disabled={pending}
        className="h-14 w-full rounded-md bg-accent text-lg font-medium text-surface transition-colors hover:bg-accent-hover active:translate-y-px disabled:opacity-60"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
