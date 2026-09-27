'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { safeNextPath } from '@/lib/auth/gate';
import { requestSessionClient } from '@/lib/auth/server';
import { signIn, SignInRefused } from '@/lib/repositories';

export interface SignInState {
  readonly message: string | null;
  readonly email: string;
}

const form = z.object({
  email: z.string().trim().min(1),
  password: z.string().min(1),
  next: z.string().optional()
});

/** U7 D11 and D12. Refusals come back as the form's one sentence; success redirects. */
export async function signInAction(_previous: SignInState, data: FormData): Promise<SignInState> {
  const parsed = form.safeParse({
    email: data.get('email') ?? '',
    password: data.get('password') ?? '',
    next: data.get('next') ?? undefined
  });
  const email = typeof data.get('email') === 'string' ? String(data.get('email')).trim() : '';
  if (!parsed.success) return { message: 'Enter your email and password.', email };

  try {
    await signIn(await requestSessionClient(), { email: parsed.data.email, password: parsed.data.password });
  } catch (error) {
    if (error instanceof SignInRefused) {
      if (error.code === 'unknown') console.error('sign-in refused', error.cause);
      return { message: error.message, email };
    }
    throw error;
  }
  redirect(safeNextPath(parsed.data.next));
}
