// Library boards (a member's named, private sets of Library results, components/LibraryBoards.tsx). This half is safe to import in the browser;
// the SQL is in app/api/library/boards/.

/** A board as GET /api/library/boards lists it; `count` is the items still in the Library. */
export type LibraryBoard = { id: string; name: string; count: number };

export const MAX_BOARD_NAME = 60;
/** The most boards one member keeps in one workspace. */
export const MAX_BOARDS = 50;
/** The most results one add or remove names (the Library zip's limit, ZipDownload.tsx). */
export const MAX_BOARD_BATCH = 50;

/** The `code` of the 409 for a name the member already uses (compared without case) and of the 409 at MAX_BOARDS; the modal words both. */
export const BOARD_NAME_TAKEN = 'board_name_taken';
export const BOARD_LIMIT = 'board_limit';

/** What a board or job id may look like in a URL or body. */
export const BOARD_ID = /^[\w-]{1,64}$/;

const CONTROL = /[\p{Cc}\p{Zl}\p{Zp}]/u; // same rule as lib/choices.ts

/** A board name as stored: NFC and trimmed, 1 to 60 characters (counted as the database does) on one line; null for anything else. */
export function boardName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const name = v.normalize('NFC').trim();
  const length = [...name].length;
  return CONTROL.test(name) || length < 1 || length > MAX_BOARD_NAME ? null : name;
}
