/**
 * Where the session client points (U7 D10). Server-only variables, with no
 * `NEXT_PUBLIC_` prefix: the browser never holds a Supabase client. The URL is
 * checked by the project-ref guard when the client is created, so a missing or
 * wrong one refuses there, never here.
 */
import type { SessionClientOptions } from '@/lib/repositories';

export function sessionConfig(env: Readonly<Record<string, string | undefined>> = process.env): SessionClientOptions {
  const anonKey = env['SUPABASE_ANON_KEY'];
  if (!anonKey) throw new Error('SUPABASE_ANON_KEY is not set. Sign-in needs it (server-only, U7 D10).');
  return { url: env['SUPABASE_URL'], anonKey };
}
