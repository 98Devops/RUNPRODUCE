/**
 * Whether this deploy has sign-in at all. Production has no Supabase settings
 * until U11, so `/sign-in` and `/capture` show "not ready yet" there instead of
 * failing. Only a deploy with neither setting counts as off: a deploy with one
 * of the two is misconfigured, and must still fail loudly, not hide behind the
 * placeholder.
 */
import { authEnabled } from '../../lib/auth/config.js';

const URL_SET = { SUPABASE_URL: 'https://zlvjmaorlxrjnuxhykuh.supabase.co' };
const KEY_SET = { SUPABASE_ANON_KEY: 'anon-key' };

describe('authEnabled', () => {
  it('is off when neither setting exists (production before U11)', () => {
    expect(authEnabled({})).toBe(false);
  });

  it('is off when both are empty strings', () => {
    expect(authEnabled({ SUPABASE_URL: '', SUPABASE_ANON_KEY: '' })).toBe(false);
  });

  it('is on when both exist (the branch deploy, local)', () => {
    expect(authEnabled({ ...URL_SET, ...KEY_SET })).toBe(true);
  });

  it.each([
    ['only the URL', URL_SET],
    ['only the key', KEY_SET]
  ])('is on with %s, so the misconfiguration fails loudly downstream', (_label, env) => {
    expect(authEnabled(env)).toBe(true);
  });
});
