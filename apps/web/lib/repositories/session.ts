/**
 * The session client (U7 D10): a user's session in cookies, through
 * `@supabase/ssr`, behind the same project-ref guard as every other client
 * (D29, AD-94). This file is the only place `@supabase/ssr` is imported
 * (lint, T-RP5). There is no browser client: sign-in and capture submit
 * through server actions, so the browser never holds a key or a token.
 *
 * One client per request, never shared (the `@supabase/ssr` contract).
 */
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveProjectTarget, type TargetEnv } from './client.js';

export interface SessionCookie {
  readonly name: string;
  readonly value: string;
}

export interface SessionCookieWrite extends SessionCookie {
  readonly options: Readonly<Record<string, unknown>>;
}

/**
 * Where the session's cookies are read and written. Next's `cookies()` in a
 * server action, or the request and response in middleware; the adapters hold
 * no Supabase import.
 */
export interface CookieJar {
  getAll(): SessionCookie[];
  setAll(cookies: SessionCookieWrite[]): void;
}

export interface SessionClientOptions {
  readonly url: string | undefined;
  readonly anonKey: string;
}

/**
 * TD-13. `@supabase/ssr` leaves `HttpOnly` off so a browser client can read the
 * session; there is none here (D10), so no script ever needs this cookie.
 * `Secure` follows the build: Netlify serves production over HTTPS, and
 * `next dev` on http://localhost would lose the cookie with it on.
 */
function sessionCookieOptions(env: TargetEnv) {
  return { httpOnly: true, secure: env['NODE_ENV'] === 'production', sameSite: 'lax', path: '/' } as const;
}

export function createSessionClient(
  options: SessionClientOptions,
  jar: CookieJar,
  // NODE_ENV is read literally so Next inlines it in the edge middleware bundle,
  // where a dynamic `env['NODE_ENV']` lookup is not guaranteed to find it.
  env: TargetEnv = { ...process.env, NODE_ENV: process.env.NODE_ENV }
): SupabaseClient {
  resolveProjectTarget(options.url, env);
  return createServerClient(options.url as string, options.anonKey, {
    cookieOptions: sessionCookieOptions(env),
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (cookies) => jar.setAll(cookies)
    }
  });
}
