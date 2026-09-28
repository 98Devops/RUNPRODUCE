/**
 * T-S6 to T-S9 · The session's database half (U7 D16): a real sign-in against
 * local Auth, through the app's own session client and an in-memory cookie
 * jar standing in for the browser. The unit half (T-S1 to T-S5) is in
 * `apps/web/tests`.
 */
import {
  createSessionClient,
  currentUser,
  myMemberships,
  signIn,
  SignInRefused,
  signOut,
  type CookieJar,
  type SessionCookie
} from '../../../apps/web/lib/repositories/index.js';
import { env, newAccount, newOrg, type Account } from '../src/harness.js';

const LOCAL = { RUNPRODUCE_SUPABASE_TARGET: 'local' };

/** The browser, reduced to its cookie store. */
class MemoryJar implements CookieJar {
  readonly cookies = new Map<string, string>();
  getAll(): SessionCookie[] {
    return [...this.cookies].map(([name, value]) => ({ name, value }));
  }
  setAll(cookies: { name: string; value: string; options: Readonly<Record<string, unknown>> }[]): void {
    for (const { name, value, options } of cookies) {
      if (value === '' || options['maxAge'] === 0) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
  authCookies(): string[] {
    return [...this.cookies.keys()].filter((name) => name.includes('-auth-token'));
  }
}

function sessionFor(jar: CookieJar) {
  return createSessionClient({ url: env.url, anonKey: env.anonKey }, jar, LOCAL);
}

let orgId: string;
let worker: Account;

beforeAll(async () => {
  orgId = await newOrg('Session farm');
  worker = await newAccount(orgId, 'WORKER');
});

describe('T-S6 · a sign-in round trip through the cookie jar', () => {
  it('leaves the session in the jar, and a fresh client reads it back as the member', async () => {
    const jar = new MemoryJar();
    await signIn(sessionFor(jar), { email: worker.email, password: worker.password });
    expect(jar.authCookies().length).toBeGreaterThan(0);

    // A new request: a new client, the same cookies.
    const next = sessionFor(jar);
    await expect(currentUser(next)).resolves.toEqual({ userId: worker.userId, email: worker.email });
  });

  it("runs the next request's RPCs as the member", async () => {
    const jar = new MemoryJar();
    await signIn(sessionFor(jar), { email: worker.email, password: worker.password });
    const memberships = await myMemberships(sessionFor(jar));
    expect(memberships.map((m) => [m.orgId, m.role])).toEqual([[orgId, 'WORKER']]);
  });

  it('has no user without a sign-in', async () => {
    await expect(currentUser(sessionFor(new MemoryJar()))).resolves.toBeNull();
  });
});

describe('T-S7 · a refused sign-in says the same thing whatever was wrong', () => {
  async function refusal(email: string, password: string): Promise<SignInRefused> {
    const jar = new MemoryJar();
    const error = await signIn(sessionFor(jar), { email, password }).then(
      () => null,
      (e: unknown) => e
    );
    expect(jar.authCookies()).toEqual([]);
    if (!(error instanceof SignInRefused)) throw new Error(`expected SignInRefused, got ${String(error)}`);
    return error;
  }

  it('a wrong password and an unknown email are the same code and sentence', async () => {
    const wrong = await refusal(worker.email, 'not-the-password');
    const unknown = await refusal('nobody-at-all@runproduce.test', 'whatever-password');
    expect(wrong.code).toBe('invalid_credentials');
    expect([unknown.code, unknown.message]).toEqual([wrong.code, wrong.message]);
    expect(wrong.message).toBe('Email or password is wrong.');
  });
});

describe('T-S8 · sign-out', () => {
  it('clears the auth cookies, after which there is no user', async () => {
    const jar = new MemoryJar();
    await signIn(sessionFor(jar), { email: worker.email, password: worker.password });
    await signOut(sessionFor(jar));
    expect(jar.authCookies()).toEqual([]);
    await expect(currentUser(sessionFor(jar))).resolves.toBeNull();
  });
});

describe('T-S9 · myMemberships', () => {
  it('is empty for a signed-in user with no membership', async () => {
    const nobody = await newAccount(null, null);
    const jar = new MemoryJar();
    await signIn(sessionFor(jar), { email: nobody.email, password: nobody.password });
    await expect(myMemberships(sessionFor(jar))).resolves.toEqual([]);
  });
});
