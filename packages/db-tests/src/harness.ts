import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { resolveDbTestEnv } from './env.js';

export const env = resolveDbTestEnv(process.env);

export type Role = 'OWNER' | 'MANAGER' | 'WORKER';

/** Superuser connection for setup only: organisations, memberships, catalog reads. */
export const pool = new pg.Pool({ connectionString: env.dbUrl, max: 6 });

const service = createClient(env.url, env.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

export interface Member {
  readonly userId: string;
  readonly role: Role | null;
  readonly client: SupabaseClient;
}

export async function newOrg(label: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    'insert into public.organizations (name) values ($1) returning id',
    [`${label} ${randomUUID().slice(0, 8)}`]
  );
  return rows[0]!.id;
}

/** A real Auth user, signed in through Auth, with a membership (or none when `role` is null). */
export async function newMember(orgId: string | null, role: Role | null): Promise<Member> {
  const email = `${(role ?? 'nobody').toLowerCase()}-${randomUUID()}@runproduce.test`;
  const password = `pw-${randomUUID()}`;
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`createUser: ${created.error?.message}`);
  const userId = created.data.user.id;

  if (orgId !== null && role !== null) {
    await pool.query('insert into private.memberships (org_id, user_id, role) values ($1, $2, $3)', [orgId, userId, role]);
  }

  const client = createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw new Error(`signIn: ${signedIn.error.message}`);
  return { userId, role, client };
}

export class DbError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(`${code}: ${message}`);
  }
}

export async function rpc<T = unknown>(member: Member, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await member.client.rpc(fn, args);
  if (error) throw new DbError(error.code ?? '', error.message);
  return data as T;
}

/** Asserts a call is refused with `code`, and returns the error for message checks. */
export async function refused(call: Promise<unknown>, code: string): Promise<DbError> {
  try {
    await call;
  } catch (error) {
    if (error instanceof DbError && error.code === code) return error;
    throw new Error(`expected SQLSTATE ${code}, got ${error instanceof Error ? error.message : String(error)}`);
  }
  throw new Error(`expected SQLSTATE ${code}, but the call succeeded`);
}

/**
 * A transaction on a dedicated connection, running as `userId` exactly as
 * PostgREST would: role `authenticated` with the JWT claims set. Used where a
 * test needs two transactions open at once, which RPC over HTTP cannot hold.
 */
export async function openAs(userId: string): Promise<pg.PoolClient> {
  const conn = await pool.connect();
  await conn.query('begin');
  await conn.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: userId, role: 'authenticated' })
  ]);
  await conn.query('set local role authenticated');
  return conn;
}

export const uuid = randomUUID;

export async function rowCount(sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(`select count(*)::text as n from (${sql}) s`, params);
  return Number(rows[0]!.n);
}
