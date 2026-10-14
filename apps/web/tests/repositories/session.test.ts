/**
 * T-S1 · The session client runs the project-ref guard first (U7 D10, AD-94).
 * `createServerClient` is replaced with a spy only to count calls and read its
 * arguments; the guard runs for real, exactly as in T-RP4.
 */
import { createServerClient } from '@supabase/ssr';
import { createSessionClient, type CookieJar } from '../../lib/repositories/index.js';

vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn(() => ({ fake: 'session' })) }));

const DEV = 'https://zlvjmaorlxrjnuxhykuh.supabase.co';
const OTHER = 'https://qqqqqqqqqqqqqqqqqqqq.supabase.co';
const LOCAL = 'http://127.0.0.1:54421';

const created = vi.mocked(createServerClient);

function jar(): CookieJar & { written: unknown[] } {
  const written: unknown[] = [];
  return {
    written,
    getAll: () => [{ name: 'sb-test-auth-token', value: 'v' }],
    setAll: (cookies) => {
      written.push(...cookies);
    }
  };
}

beforeEach(() => {
  created.mockClear();
});

describe('T-S1 · the session client is created only after the guard passes', () => {
  it('creates one client for the dev project, with the anon key', () => {
    expect(createSessionClient({ url: DEV, anonKey: 'anon' }, jar(), {})).toEqual({ fake: 'session' });
    expect(created).toHaveBeenCalledTimes(1);
    const [url, key] = created.mock.calls[0]!;
    expect(url).toBe(DEV);
    expect(key).toBe('anon');
  });

  it("reads and writes cookies through the jar it was given, and nowhere else", () => {
    const j = jar();
    createSessionClient({ url: DEV, anonKey: 'anon' }, j, {});
    const cookies = created.mock.calls[0]![2].cookies as {
      getAll: () => unknown;
      setAll: (c: { name: string; value: string; options: object }[]) => void;
    };
    expect(cookies.getAll()).toEqual([{ name: 'sb-test-auth-token', value: 'v' }]);
    cookies.setAll([{ name: 'sb-test-auth-token', value: 'new', options: { path: '/' } }]);
    expect(j.written).toEqual([{ name: 'sb-test-auth-token', value: 'new', options: { path: '/' } }]);
  });

  it('writes the session cookie HttpOnly, Lax, on every path (TD-13)', () => {
    createSessionClient({ url: DEV, anonKey: 'anon' }, jar(), {});
    expect(created.mock.calls[0]![2].cookieOptions).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
  });

  it.each<[string, Record<string, string>, boolean]>([
    ['a production build (Netlify, HTTPS)', { NODE_ENV: 'production' }, true],
    ['next dev on http://localhost', { NODE_ENV: 'development' }, false],
    ['no NODE_ENV at all', {}, false]
  ])('marks it Secure only in %s (TD-13)', (_label, env, secure) => {
    createSessionClient({ url: DEV, anonKey: 'anon' }, jar(), env);
    expect(created.mock.calls[0]![2].cookieOptions).toMatchObject({ secure });
  });

  it('allows a local stack only when the target says local', () => {
    createSessionClient({ url: LOCAL, anonKey: 'anon' }, jar(), { RUNPRODUCE_SUPABASE_TARGET: 'local' });
    expect(created).toHaveBeenCalledTimes(1);
  });

  it.each<[string, string | undefined, Record<string, string>]>([
    ['another project', OTHER, {}],
    ['a missing URL', undefined, {}],
    ['a local stack with no target', LOCAL, {}],
    ['an unknown target', DEV, { RUNPRODUCE_SUPABASE_TARGET: 'staging' }]
  ])('refuses %s, and never creates a client', (_label, url, env) => {
    expect(() => createSessionClient({ url, anonKey: 'anon' }, jar(), env)).toThrow(/Refusing to create a Supabase client/);
    expect(created).not.toHaveBeenCalled();
  });
});
