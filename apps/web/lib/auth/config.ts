/**
 * Where the session client points (U7 D10). Server-only variables, with no
 * `NEXT_PUBLIC_` prefix: the browser never holds a Supabase client. The URL is
 * checked by the project-ref guard when the client is created, so a missing or
 * wrong one refuses there, never here.
 */
import type { SessionClientOptions } from '@/lib/repositories';

/**
 * Whether this deploy has sign-in at all. Off only when neither setting exists,
 * as on production until U11: `/sign-in` and `/capture` then show "not ready
 * yet" and nothing touches Supabase. One setting without the other is a
 * misconfiguration, so it counts as on and fails loudly in `sessionConfig` or
 * the project-ref guard, never hidden behind the placeholder.
 */
export function authEnabled(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return Boolean(env['SUPABASE_URL']) || Boolean(env['SUPABASE_ANON_KEY']);
}

export function sessionConfig(env: Readonly<Record<string, string | undefined>> = process.env): SessionClientOptions {
  const anonKey = env['SUPABASE_ANON_KEY'];
  if (!anonKey) throw new Error('SUPABASE_ANON_KEY is not set. Sign-in needs it (server-only, U7 D10).');
  return { url: env['SUPABASE_URL'], anonKey };
}
