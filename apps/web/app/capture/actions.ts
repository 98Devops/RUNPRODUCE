'use server';

import { redirect } from 'next/navigation';
import { SIGN_IN_PATH } from '@/lib/auth/gate';
import { requestSessionClient } from '@/lib/auth/server';
import { signOut } from '@/lib/repositories';

/** U7 D12: POST only, from a form button, so a prefetched link cannot sign anyone out. */
export async function signOutAction(): Promise<void> {
  await signOut(await requestSessionClient());
  redirect(SIGN_IN_PATH);
}
