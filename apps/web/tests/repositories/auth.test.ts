/**
 * T-S4 and T-S5 · The auth repository against a fake client (U7 D11). The
 * database half, a real sign-in on the local stack, is T-S6 to T-S9 in
 * `packages/db-tests`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  currentUser,
  mapAuthError,
  myMemberships,
  RepositoryError,
  signIn,
  SignInRefused,
  signOut
} from '../../lib/repositories/index.js';

const WRONG = 'Email or password is wrong.';
const LIMITED = 'Too many attempts. Wait a minute and try again.';
const DISABLED = 'This account is switched off. Ask the owner.';
const OFFLINE = "Can't reach the server. Check the connection and try again.";
const GENERIC = 'Sign-in failed. Try again.';

function authError(code: string | undefined, name = 'AuthApiError') {
  return { name, code, message: `raw ${code}`, status: 400 };
}

describe('T-S4 · mapAuthError: one sentence per cause, never the raw message', () => {
  it.each<[string, ReturnType<typeof authError>, string, string]>([
    ['wrong credentials', authError('invalid_credentials'), 'invalid_credentials', WRONG],
    ['request rate limit', authError('over_request_rate_limit'), 'rate_limited', LIMITED],
    ['a banned user', authError('user_banned'), 'account_disabled', DISABLED],
    ['no connection', authError(undefined, 'AuthRetryableFetchError'), 'unreachable', OFFLINE],
    ['an unknown code', authError('hook_timeout'), 'unknown', GENERIC],
    ['no code at all', authError(undefined), 'unknown', GENERIC]
  ])('%s', (_label, error, code, message) => {
    const mapped = mapAuthError(error);
    expect(mapped).toBeInstanceOf(SignInRefused);
    expect(mapped.code).toBe(code);
    expect(mapped.message).toBe(message);
  });

  it('is not a RepositoryError, so a generic catch cannot swallow it', () => {
    expect(mapAuthError(authError('invalid_credentials'))).not.toBeInstanceOf(RepositoryError);
  });
});

function fakeAuth(overrides: Record<string, unknown>) {
  const calls: { fn: string; args: unknown[] }[] = [];
  const auth = new Proxy(
    {},
    {
      get:
        (_t, fn: string) =>
        async (...args: unknown[]) => {
          calls.push({ fn, args });
          return overrides[fn] ?? { data: null, error: null };
        }
    }
  );
  return { client: { auth } as unknown as SupabaseClient, calls };
}

describe('T-S4 · signIn and signOut', () => {
  it('resolves when Supabase accepts the credentials', async () => {
    const { client, calls } = fakeAuth({ signInWithPassword: { data: { session: {} }, error: null } });
    await expect(signIn(client, { email: 'w@farm.test', password: 'pw' })).resolves.toBeUndefined();
    expect(calls).toEqual([{ fn: 'signInWithPassword', args: [{ email: 'w@farm.test', password: 'pw' }] }]);
  });

  it('throws SignInRefused when Supabase refuses', async () => {
    const { client } = fakeAuth({ signInWithPassword: { data: {}, error: authError('invalid_credentials') } });
    await expect(signIn(client, { email: 'w@farm.test', password: 'no' })).rejects.toMatchObject({
      name: 'SignInRefused',
      code: 'invalid_credentials',
      message: WRONG
    });
  });

  it('signs out this device only', async () => {
    const { client, calls } = fakeAuth({});
    await signOut(client);
    expect(calls).toEqual([{ fn: 'signOut', args: [{ scope: 'local' }] }]);
  });
});

describe('T-S4 · currentUser comes from verified claims', () => {
  it('returns the user id and email', async () => {
    const { client, calls } = fakeAuth({
      getClaims: { data: { claims: { sub: 'u-1', email: 'w@farm.test' } }, error: null }
    });
    await expect(currentUser(client)).resolves.toEqual({ userId: 'u-1', email: 'w@farm.test' });
    expect(calls.map((c) => c.fn)).toEqual(['getClaims']);
  });

  it('returns null when there is no session', async () => {
    const { client } = fakeAuth({ getClaims: { data: null, error: null } });
    await expect(currentUser(client)).resolves.toBeNull();
  });

  it('returns null when the token does not verify', async () => {
    const { client } = fakeAuth({ getClaims: { data: null, error: { name: 'AuthInvalidJwtError', message: 'bad' } } });
    await expect(currentUser(client)).resolves.toBeNull();
  });
});

function fakeRpc(reply: { data?: unknown; error?: { code: string; message: string } }) {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rpc: async (fn: string, args?: unknown) => {
      calls.push({ fn, args });
      return { data: reply.data ?? null, error: reply.error ?? null };
    }
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe('T-S5 · myMemberships', () => {
  it('maps each row to a membership', async () => {
    const { client, calls } = fakeRpc({
      data: [{ org_id: 'o-1', org_name: 'Test Farm', role: 'WORKER' }]
    });
    await expect(myMemberships(client)).resolves.toEqual([{ orgId: 'o-1', orgName: 'Test Farm', role: 'WORKER' }]);
    expect(calls).toEqual([{ fn: 'my_memberships', args: undefined }]);
  });

  it('returns an empty list for a user with no membership', async () => {
    await expect(myMemberships(fakeRpc({ data: [] }).client)).resolves.toEqual([]);
  });

  it('refuses a role it does not know, rather than passing it through', async () => {
    const reply = { data: [{ org_id: 'o-1', org_name: 'Test Farm', role: 'SUPERUSER' }] };
    await expect(myMemberships(fakeRpc(reply).client)).rejects.toBeInstanceOf(RepositoryError);
  });

  it('maps a database error through mapDatabaseError', async () => {
    const reply = { error: { code: '42501', message: 'not permitted' } };
    await expect(myMemberships(fakeRpc(reply).client)).rejects.toMatchObject({ name: 'Forbidden' });
  });
});
