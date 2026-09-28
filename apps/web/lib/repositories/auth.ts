/**
 * Sign-in, sign-out and "who am I" (U7 D11). Repository functions, because
 * only `lib/repositories` talks to Supabase (invariant 4), auth included.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { mapAuthError, mapDatabaseError, RepositoryError } from './errors.js';

/** The roles `private.memberships` allows (AD-85). The app's, not the engine's. */
export const ROLES = ['OWNER', 'MANAGER', 'WORKER'] as const;
export type Role = (typeof ROLES)[number];

export interface Membership {
  readonly orgId: string;
  readonly orgName: string;
  readonly role: Role;
}

export interface SignedInUser {
  readonly userId: string;
  readonly email: string | null;
}

export interface Credentials {
  readonly email: string;
  readonly password: string;
}

/** Resolves once the session is in the client's cookie jar; throws `SignInRefused` otherwise. */
export async function signIn(client: SupabaseClient, credentials: Credentials): Promise<void> {
  const { error } = await client.auth.signInWithPassword({ email: credentials.email, password: credentials.password });
  if (error) throw mapAuthError(error);
}

/** This device only: signing out a shared phone must not sign the owner out elsewhere. */
export async function signOut(client: SupabaseClient): Promise<void> {
  const { error } = await client.auth.signOut({ scope: 'local' });
  if (error) throw new RepositoryError(`sign-out: ${error.message}`, { cause: error });
}

/**
 * From `getClaims()`, which verifies the JWT. Never `getSession()`: that reads
 * the cookie unverified, and a cookie is whatever the browser sent.
 */
export async function currentUser(client: SupabaseClient): Promise<SignedInUser | null> {
  const { data, error } = await client.auth.getClaims();
  if (error || !data) return null;
  const { sub, email } = data.claims;
  if (typeof sub !== 'string' || sub === '') return null;
  return { userId: sub, email: typeof email === 'string' ? email : null };
}

const membershipRows = z.array(
  z.object({
    org_id: z.string().min(1),
    org_name: z.string(),
    role: z.enum(ROLES)
  })
);

/** The caller's memberships, over `public.my_memberships()`. Empty for a user with none. */
export async function myMemberships(client: SupabaseClient): Promise<Membership[]> {
  const { data, error } = await client.rpc('my_memberships');
  if (error) throw mapDatabaseError(error);
  const parsed = membershipRows.safeParse(data ?? []);
  if (!parsed.success) {
    throw new RepositoryError(`my_memberships returned an unexpected shape: ${parsed.error.message}`);
  }
  return parsed.data.map((row) => ({ orgId: row.org_id, orgName: row.org_name, role: row.role }));
}
