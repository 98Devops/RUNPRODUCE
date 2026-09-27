/**
 * U7 D12. Refreshes the session and applies `gate`. A thin shell: the decision
 * is `lib/auth/gate.ts`, and it is not the authority, since the capture page
 * and every server action check the user again.
 *
 * Matches `/capture` and `/sign-in` only. The console at `/` is never touched
 * (D13).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { gate } from '@/lib/auth/gate';
import { sessionConfig } from '@/lib/auth/config';
import { createSessionClient, currentUser, type CookieJar } from '@/lib/repositories';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const jar: CookieJar = {
    getAll: () => request.cookies.getAll().map(({ name, value }) => ({ name, value })),
    setAll: (written) => {
      for (const { name, value } of written) request.cookies.set(name, value);
      response = NextResponse.next({ request });
      for (const { name, value, options } of written) response.cookies.set(name, value, options);
    }
  };

  // getClaims() refreshes an expired token and writes the new one through the jar.
  const user = await currentUser(createSessionClient(sessionConfig(), jar));
  const decision = gate({ pathname: request.nextUrl.pathname, search: request.nextUrl.search, signedIn: user !== null });
  if (decision.kind === 'pass') return response;

  // A redirect must carry any refreshed session cookie, or the next request signs out.
  const redirect = NextResponse.redirect(new URL(decision.to, request.url));
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

export const config = {
  matcher: ['/capture', '/capture/:path*', '/sign-in']
};
