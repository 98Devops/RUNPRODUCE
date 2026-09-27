/**
 * T-RP4 · The project-ref guard (D29, AD-94). The guard runs before any client
 * exists: a refused target never reaches `createClient`, so no request can be
 * sent to it. `createClient` is replaced with a spy only to count calls; the
 * guard itself runs for real.
 */
import { createClient } from '@supabase/supabase-js';
import { createRepositoryClient, resolveProjectTarget } from '../../lib/repositories/index.js';
// Deliberately not on the entry point: only seed, the DB tests and scheduled
// functions may import the service-role client (D29, T-RP5).
import { createAdminClient } from '../../lib/repositories/admin.js';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ fake: 'client' })) }));

const DEV = 'https://zlvjmaorlxrjnuxhykuh.supabase.co';
const CI_REF = 'abcdefghijklmnopqrst';
const PROD_REF = 'prodprodprodprodprod';
const OTHER = 'https://qqqqqqqqqqqqqqqqqqqq.supabase.co';
const LOCAL = 'http://127.0.0.1:54421';

const created = vi.mocked(createClient);

beforeEach(() => {
  created.mockClear();
});

function user(url: string | undefined, env: Record<string, string> = {}) {
  return () => createRepositoryClient({ url, anonKey: 'anon', accessToken: 'jwt' }, env);
}

describe('T-RP4 · the dev ref passes by default', () => {
  it('creates a client for the dev project with no target set', () => {
    expect(user(DEV)()).toEqual({ fake: 'client' });
    expect(created).toHaveBeenCalledTimes(1);
  });

  it("carries the caller's session, so RLS and the role checks apply", () => {
    user(DEV)();
    const [url, key, options] = created.mock.calls[0]!;
    expect(url).toBe(DEV);
    expect(key).toBe('anon');
    expect(options?.global?.headers).toEqual({ Authorization: 'Bearer jwt' });
    expect(options?.auth).toMatchObject({ persistSession: false, autoRefreshToken: false });
  });
});

describe('T-RP4 · everything else throws before a client is created', () => {
  it.each<[string, string | undefined, Record<string, string>]>([
    ['another project', OTHER, {}],
    ['a missing URL', undefined, {}],
    ['an empty URL', '', {}],
    ['a URL that is not a Supabase project', 'https://example.com', {}],
    ['production without its ref', `https://${PROD_REF}.supabase.co`, { RUNPRODUCE_SUPABASE_TARGET: 'production' }],
    [
      'production whose ref does not match',
      `https://${PROD_REF}.supabase.co`,
      { RUNPRODUCE_SUPABASE_TARGET: 'production', RUNPRODUCE_PRODUCTION_PROJECT_REF: 'zzzzzzzzzzzzzzzzzzzz' }
    ],
    ['the production ref with no target set', `https://${PROD_REF}.supabase.co`, { RUNPRODUCE_PRODUCTION_PROJECT_REF: PROD_REF }],
    ['the CI ref with no target set', `https://${CI_REF}.supabase.co`, { RUNPRODUCE_CI_PROJECT_REF: CI_REF }],
    ['dev while production is the target', DEV, { RUNPRODUCE_SUPABASE_TARGET: 'production', RUNPRODUCE_PRODUCTION_PROJECT_REF: PROD_REF }],
    ['an unknown target', DEV, { RUNPRODUCE_SUPABASE_TARGET: 'staging' }],
    ['a local stack with no target set', LOCAL, {}],
    ['a remote host while local is the target', DEV, { RUNPRODUCE_SUPABASE_TARGET: 'local' }]
  ])('%s', (_what, url, env) => {
    expect(user(url, env)).toThrow();
    expect(created).not.toHaveBeenCalled();
  });
});

describe('T-RP4 · the deliberate targets', () => {
  it('allows the CI project only with RUNPRODUCE_SUPABASE_TARGET=ci and its ref', () => {
    user(`https://${CI_REF}.supabase.co`, { RUNPRODUCE_SUPABASE_TARGET: 'ci', RUNPRODUCE_CI_PROJECT_REF: CI_REF })();
    expect(created).toHaveBeenCalledTimes(1);
  });

  it('allows production only with RUNPRODUCE_SUPABASE_TARGET=production and a matching ref (U11)', () => {
    user(`https://${PROD_REF}.supabase.co`, {
      RUNPRODUCE_SUPABASE_TARGET: 'production',
      RUNPRODUCE_PRODUCTION_PROJECT_REF: PROD_REF
    })();
    expect(created).toHaveBeenCalledTimes(1);
  });

  it('allows a local stack only with RUNPRODUCE_SUPABASE_TARGET=local', () => {
    user(LOCAL, { RUNPRODUCE_SUPABASE_TARGET: 'local' })();
    user('http://localhost:54421', { RUNPRODUCE_SUPABASE_TARGET: 'local' })();
    expect(created).toHaveBeenCalledTimes(2);
  });

  it('names the target it resolved, for logging', () => {
    expect(resolveProjectTarget(DEV, {})).toBe('dev');
    expect(resolveProjectTarget(LOCAL, { RUNPRODUCE_SUPABASE_TARGET: 'local' })).toBe('local');
  });
});

describe('the service-role client (admin.ts) goes through the same guard', () => {
  it('refuses another project before a client exists', () => {
    expect(() => createAdminClient({ url: OTHER, serviceRoleKey: 'service' }, {})).toThrow();
    expect(created).not.toHaveBeenCalled();
  });

  it('creates a client for the dev project with the service-role key and no session', () => {
    createAdminClient({ url: DEV, serviceRoleKey: 'service' }, {});
    const [, key, options] = created.mock.calls[0]!;
    expect(key).toBe('service');
    expect(options?.global?.headers).toBeUndefined();
  });
});
