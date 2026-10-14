/**
 * T-S2, T-S3 and T-T7 · Where a request may go (U7 D12, D27). Pure functions,
 * so the middleware that calls them is a thin shell with nothing of its own to
 * test.
 */
import { FARM_PATHS, gate, HOME_AFTER_SIGN_IN, safeNextPath } from '../../lib/auth/gate.js';

describe('T-S2 · safeNextPath accepts only a same-site path', () => {
  it.each([
    ['/today', '/today'],
    ['/today?date=2026-03-21', '/today?date=2026-03-21'],
    ['/today?batch=B1&date=2026-03-21', '/today?batch=B1&date=2026-03-21']
  ])('keeps %s', (raw, expected) => {
    expect(safeNextPath(raw)).toBe(expected);
  });

  it.each<[string, string | null | undefined]>([
    ['nothing', undefined],
    ['null', null],
    ['an empty string', ''],
    ['a protocol-relative URL', '//evil.example/today'],
    ['a backslash host', '/\\evil.example'],
    ['a full URL', 'https://evil.example/today'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a relative path', 'today'],
    ['the sign-in page itself', '/sign-in'],
    ['a path with a control character', '/today\n//evil.example']
  ])('falls back to /today for %s', (_label, raw) => {
    expect(safeNextPath(raw)).toBe('/today');
  });
});

describe('T-S3 · gate', () => {
  it('sends a signed-out visitor from /today to sign-in, remembering where they were going', () => {
    expect(gate({ pathname: '/today', search: '', signedIn: false })).toEqual({
      kind: 'redirect',
      to: '/sign-in?next=%2Ftoday'
    });
  });

  it('keeps the query string in next', () => {
    expect(gate({ pathname: '/today', search: '?date=2026-03-21', signedIn: false })).toEqual({
      kind: 'redirect',
      to: '/sign-in?next=%2Ftoday%3Fdate%3D2026-03-21'
    });
  });

  it('lets a signed-in visitor through to /today', () => {
    expect(gate({ pathname: '/today', search: '', signedIn: true })).toEqual({ kind: 'pass' });
  });

  it('sends a signed-in visitor away from sign-in', () => {
    expect(gate({ pathname: '/sign-in', search: '', signedIn: true })).toEqual({ kind: 'redirect', to: '/today' });
  });

  it('honours a safe next when a signed-in visitor lands on sign-in', () => {
    expect(gate({ pathname: '/sign-in', search: '?next=%2Ftoday%3Fdate%3D2026-03-21', signedIn: true })).toEqual({
      kind: 'redirect',
      to: '/today?date=2026-03-21'
    });
  });

  it('lets a signed-out visitor see sign-in', () => {
    expect(gate({ pathname: '/sign-in', search: '', signedIn: false })).toEqual({ kind: 'pass' });
  });

  it.each([true, false])('never gates the console at / (signed in: %s)', (signedIn) => {
    expect(gate({ pathname: '/', search: '', signedIn })).toEqual({ kind: 'pass' });
  });
});

describe('T-T7 · the farm tabs and the old /capture', () => {
  it('lands on Today after sign-in', () => {
    expect(HOME_AFTER_SIGN_IN).toBe('/today');
  });

  it('covers the five tabs', () => {
    expect(FARM_PATHS).toEqual(['/start', '/today', '/feed', '/results', '/next']);
  });

  it.each(['/start', '/today', '/feed', '/results', '/next', '/today/2026-03-21'])(
    'protects %s from a signed-out visitor',
    (pathname) => {
      expect(gate({ pathname, search: '', signedIn: false }).kind).toBe('redirect');
    }
  );

  it.each(['/todays', '/feeds', '/resultsx'])('does not protect %s, which only starts like a tab', (pathname) => {
    expect(gate({ pathname, search: '', signedIn: false })).toEqual({ kind: 'pass' });
  });

  it.each([true, false])('redirects /capture to /today, keeping the query (signed in: %s)', (signedIn) => {
    expect(gate({ pathname: '/capture', search: '?date=2026-03-21', signedIn })).toEqual({
      kind: 'redirect',
      to: '/today?date=2026-03-21'
    });
    expect(gate({ pathname: '/capture', search: '', signedIn })).toEqual({ kind: 'redirect', to: '/today' });
  });

  it('redirects paths under /capture to /today as well', () => {
    expect(gate({ pathname: '/capture/2026-03-21', search: '', signedIn: false })).toEqual({
      kind: 'redirect',
      to: '/today'
    });
  });
});
