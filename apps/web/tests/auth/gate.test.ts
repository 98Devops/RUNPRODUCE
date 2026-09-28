/**
 * T-S2 and T-S3 · Where a request may go (U7 D12). Pure functions, so the
 * middleware that calls them is a thin shell with nothing of its own to test.
 */
import { gate, safeNextPath } from '../../lib/auth/gate.js';

describe('T-S2 · safeNextPath accepts only a same-site path', () => {
  it.each([
    ['/capture', '/capture'],
    ['/capture?date=2026-03-21', '/capture?date=2026-03-21'],
    ['/capture/2026-03-21', '/capture/2026-03-21']
  ])('keeps %s', (raw, expected) => {
    expect(safeNextPath(raw)).toBe(expected);
  });

  it.each<[string, string | null | undefined]>([
    ['nothing', undefined],
    ['null', null],
    ['an empty string', ''],
    ['a protocol-relative URL', '//evil.example/capture'],
    ['a backslash host', '/\\evil.example'],
    ['a full URL', 'https://evil.example/capture'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a relative path', 'capture'],
    ['the sign-in page itself', '/sign-in'],
    ['a path with a control character', '/capture\n//evil.example']
  ])('falls back to /capture for %s', (_label, raw) => {
    expect(safeNextPath(raw)).toBe('/capture');
  });
});

describe('T-S3 · gate', () => {
  it('sends a signed-out visitor from /capture to sign-in, remembering where they were going', () => {
    expect(gate({ pathname: '/capture', search: '', signedIn: false })).toEqual({
      kind: 'redirect',
      to: '/sign-in?next=%2Fcapture'
    });
  });

  it('keeps the query string in next', () => {
    expect(gate({ pathname: '/capture', search: '?date=2026-03-21', signedIn: false })).toEqual({
      kind: 'redirect',
      to: '/sign-in?next=%2Fcapture%3Fdate%3D2026-03-21'
    });
  });

  it('protects paths under /capture too', () => {
    expect(gate({ pathname: '/capture/2026-03-21', search: '', signedIn: false }).kind).toBe('redirect');
  });

  it('lets a signed-in visitor through to /capture', () => {
    expect(gate({ pathname: '/capture', search: '', signedIn: true })).toEqual({ kind: 'pass' });
  });

  it('sends a signed-in visitor away from sign-in', () => {
    expect(gate({ pathname: '/sign-in', search: '', signedIn: true })).toEqual({ kind: 'redirect', to: '/capture' });
  });

  it('honours a safe next when a signed-in visitor lands on sign-in', () => {
    expect(gate({ pathname: '/sign-in', search: '?next=%2Fcapture%3Fdate%3D2026-03-21', signedIn: true })).toEqual({
      kind: 'redirect',
      to: '/capture?date=2026-03-21'
    });
  });

  it('lets a signed-out visitor see sign-in', () => {
    expect(gate({ pathname: '/sign-in', search: '', signedIn: false })).toEqual({ kind: 'pass' });
  });

  it.each([true, false])('never gates the console at / (signed in: %s)', (signedIn) => {
    expect(gate({ pathname: '/', search: '', signedIn })).toEqual({ kind: 'pass' });
  });
});
