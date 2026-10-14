/**
 * Where a request may go (U7 D12, D27). Pure, so middleware is a thin shell
 * around it. Middleware is not the authority: every farm page and every server
 * action check the user again, and RLS has the last word on data.
 *
 * `/` (the U9 console) is never gated until step 6 retires it (D13, AD-104).
 */
export const HOME_AFTER_SIGN_IN = '/today';
export const SIGN_IN_PATH = '/sign-in';

/**
 * The five farm tabs (AD-104). All five are protected from the start, built or
 * not, so a tab that lands later is never briefly open to a signed-out visitor.
 */
export const FARM_PATHS = ['/start', '/today', '/feed', '/results', '/next'] as const;

/** Chunk 2's placeholder route. Old links and bookmarks go to Today. */
const RETIRED_CAPTURE_PATH = '/capture';

export type GateDecision = { readonly kind: 'pass' } | { readonly kind: 'redirect'; readonly to: string };

export interface GateRequest {
  readonly pathname: string;
  /** The raw query string, with its leading `?`, or empty. */
  readonly search: string;
  readonly signedIn: boolean;
}

function isUnder(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`);
}

function isProtected(pathname: string): boolean {
  return FARM_PATHS.some((root) => isUnder(pathname, root));
}

/**
 * Only a path on this site, and never sign-in itself: one leading `/`, not
 * `//host` or `/\host`, no control characters. Anything else is Today.
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/')) return HOME_AFTER_SIGN_IN;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return HOME_AFTER_SIGN_IN;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(raw)) return HOME_AFTER_SIGN_IN;
  const path = raw.split(/[?#]/, 1)[0] ?? '';
  if (path === SIGN_IN_PATH || path.startsWith(`${SIGN_IN_PATH}/`)) return HOME_AFTER_SIGN_IN;
  return raw;
}

export function gate(request: GateRequest): GateDecision {
  const { pathname, search, signedIn } = request;
  if (isUnder(pathname, RETIRED_CAPTURE_PATH)) return { kind: 'redirect', to: `${HOME_AFTER_SIGN_IN}${search}` };
  if (isProtected(pathname) && !signedIn) {
    const next = encodeURIComponent(`${pathname}${search}`);
    return { kind: 'redirect', to: `${SIGN_IN_PATH}?next=${next}` };
  }
  if (pathname === SIGN_IN_PATH && signedIn) {
    return { kind: 'redirect', to: safeNextPath(new URLSearchParams(search).get('next')) };
  }
  return { kind: 'pass' };
}
