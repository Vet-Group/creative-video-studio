import { type NextRequest, NextResponse } from 'next/server';
import { HOME_COOKIE, isLanding } from '@/lib/landing';

/** Hands the requested page to the app layout, which sends a signed-out visitor to /login?next=<page> and back there after the sign-in. */
export function proxy(request: NextRequest) {
  // A bookmark or the installed app opens `/`: go straight to the landing the last page saved, instead of rendering app/page.tsx (which stays for a first visit).
  const home = request.cookies.get(HOME_COOKIE)?.value;
  if (request.nextUrl.pathname === '/' && isLanding(home)) return NextResponse.redirect(new URL(home, process.env.APP_URL ?? request.url)); // the public address, as the OAuth pages build theirs: a proxy redirect must be absolute
  const url = request.nextUrl.clone();
  url.searchParams.delete('_rsc'); // Next's own cache key on client navigations, not part of the page
  const headers = new Headers(request.headers);
  headers.set('x-cvs-path', url.pathname + url.search);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ['/((?!api/|_next/|login|.*\\..*).*)'] };
