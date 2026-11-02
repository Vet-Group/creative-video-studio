import { type NextRequest, NextResponse } from 'next/server';

/** Hands the requested page to the app layout, which sends a signed-out visitor to /login?next=<page> and back there after the sign-in. */
export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.searchParams.delete('_rsc'); // Next's own cache key on client navigations, not part of the page
  const headers = new Headers(request.headers);
  headers.set('x-cvs-path', url.pathname + url.search);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ['/((?!api/|_next/|login|.*\\..*).*)'] };
