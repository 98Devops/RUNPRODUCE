/**
 * A session client for this request, in a server component or server action,
 * over Next's cookie store. A new client per call (the `@supabase/ssr`
 * contract). Middleware builds its own over the request and response.
 */
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSessionClient, type CookieJar } from '@/lib/repositories';
import { sessionConfig } from './config';

export async function requestSessionClient(): Promise<SupabaseClient> {
  const store = await cookies();
  const jar: CookieJar = {
    getAll: () => store.getAll().map(({ name, value }) => ({ name, value })),
    setAll: (written) => {
      try {
        for (const { name, value, options } of written) store.set(name, value, options);
      } catch {
        // A server component cannot set cookies. Middleware refreshes the
        // session before the page renders, so nothing is lost here.
      }
    }
  };
  return createSessionClient(sessionConfig(), jar);
}
