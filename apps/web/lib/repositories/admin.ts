/**
 * The service-role client (D29, AD-94). It bypasses RLS, so it stays out of
 * the request path: lint allows importing this file only from the seed script,
 * the DB test harness and `netlify/functions` (T-RP5). Its key never carries
 * the `NEXT_PUBLIC_` prefix (architecture.md).
 *
 * It passes the same project-ref guard as every other client.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { resolveProjectTarget, type TargetEnv } from './client.js';

export interface AdminClientOptions {
  readonly url: string | undefined;
  readonly serviceRoleKey: string;
}

export function createAdminClient(options: AdminClientOptions, env: TargetEnv = process.env): SupabaseClient {
  resolveProjectTarget(options.url, env);
  return createClient(options.url as string, options.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
