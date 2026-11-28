/** A cookie holding the last page width class (1 below the layout breakpoint, else 0), so the server can render the phone layout before the browser can say. */
export const NARROW_COOKIE = 'cvs_narrow';

/** Which layout the server renders first: the saved width class, else a phone's or tablet's user agent. A wrong guess only costs the flip it had before (useMediaQuery). */
export function guessNarrow(saved: string | undefined, userAgent: string | null): boolean {
  return saved ? saved === '1' : /Mobi|Android|iPhone|iPad/.test(userAgent ?? '');
}
