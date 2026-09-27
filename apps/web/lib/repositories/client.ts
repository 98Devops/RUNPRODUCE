/**
 * The one client factory, with the project-ref guard (D29, AD-94). This file
 * and `admin.ts` are the only places `createClient` is called (lint, T-RP5).
 *
 * The guard runs before any client exists, and never falls back:
 * - the dev project (`zlvjmaorlxrjnuxhykuh`) by default;
 * - the CI project only with `RUNPRODUCE_SUPABASE_TARGET=ci` and its ref in
 *   `RUNPRODUCE_CI_PROJECT_REF`;
 * - production only with `RUNPRODUCE_SUPABASE_TARGET=production` and a matching
 *   `RUNPRODUCE_PRODUCTION_PROJECT_REF`, set in Netlify's production context
 *   only (U11);
 * - a local stack only with `RUNPRODUCE_SUPABASE_TARGET=local` (amendment,
 *   2026-09-27: D29 predates local development against the app);
 * - anything else throws, including a missing URL.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const DEV_PROJECT_REF = 'zlvjmaorlxrjnuxhykuh';

export type ProjectTarget = 'dev' | 'ci' | 'production' | 'local';

export type TargetEnv = Readonly<Record<string, string | undefined>>;

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

function refuse(reason: string): never {
  throw new Error(`Refusing to create a Supabase client: ${reason}`);
}

/** The ref in `https://<ref>.supabase.co`, or null. */
function projectRefOf(host: string): string | null {
  return /^([a-z]{20})\.supabase\.co$/.exec(host)?.[1] ?? null;
}

/** Which target `url` is, under `env`. Throws on anything not deliberately allowed. */
export function resolveProjectTarget(url: string | undefined, env: TargetEnv): ProjectTarget {
  if (!url) refuse('no Supabase URL is set.');
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    refuse(`"${url}" is not a URL.`);
  }
  const target = env['RUNPRODUCE_SUPABASE_TARGET'];
  const ref = projectRefOf(host);

  switch (target) {
    case undefined:
    case '':
      if (ref === DEV_PROJECT_REF) return 'dev';
      return refuse(`${host} is not the dev project, and RUNPRODUCE_SUPABASE_TARGET is not set.`);
    case 'local':
      if (LOCAL_HOSTS.has(host)) return 'local';
      return refuse(`RUNPRODUCE_SUPABASE_TARGET=local, but ${host} is not a local stack.`);
    case 'ci': {
      const ciRef = env['RUNPRODUCE_CI_PROJECT_REF'];
      if (ciRef && ciRef !== DEV_PROJECT_REF && ref === ciRef) return 'ci';
      return refuse(`RUNPRODUCE_SUPABASE_TARGET=ci, but ${host} is not RUNPRODUCE_CI_PROJECT_REF.`);
    }
    case 'production': {
      const prodRef = env['RUNPRODUCE_PRODUCTION_PROJECT_REF'];
      if (prodRef && prodRef !== DEV_PROJECT_REF && ref === prodRef) return 'production';
      return refuse(`RUNPRODUCE_SUPABASE_TARGET=production, but ${host} is not RUNPRODUCE_PRODUCTION_PROJECT_REF.`);
    }
    default:
      return refuse(`unknown RUNPRODUCE_SUPABASE_TARGET "${target}".`);
  }
}

export interface RepositoryClientOptions {
  readonly url: string | undefined;
  readonly anonKey: string;
  /** The signed-in user's JWT. User requests always run as the caller, so RLS applies. */
  readonly accessToken: string;
}

/** The client for a user request: anon key plus the caller's JWT, after the guard. */
export function createRepositoryClient(options: RepositoryClientOptions, env: TargetEnv = process.env): SupabaseClient {
  resolveProjectTarget(options.url, env);
  return createClient(options.url as string, options.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${options.accessToken}` } }
  });
}
