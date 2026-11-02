const BASE = 'http://cvs.invalid';

/**
 * The page to open after signing in: `next` when it is a page of this site, else Create. Parsed the way a browser would, so `//host`,
 * `/\host` and a tab or newline inside the slashes, which browsers read as another site, fall back to Create.
 */
export function returnTo(next: unknown): string {
  if (typeof next !== 'string' || !next.startsWith('/')) return '/create';
  try {
    const u = new URL(next, BASE);
    const page = u.pathname + u.search + u.hash;
    // Resolving dot segments can turn `/..//host` into `//host`, another site again.
    return u.origin === BASE && u.pathname !== '/login' && !page.startsWith('//') ? page : '/create';
  } catch {
    return '/create';
  }
}

/** The login URL that comes back to `path` (a path with its query) after the sign-in. */
export const loginFor = (path: string | null | undefined) => (path && returnTo(path) !== '/create' ? `/login?next=${encodeURIComponent(path)}` : '/login');
