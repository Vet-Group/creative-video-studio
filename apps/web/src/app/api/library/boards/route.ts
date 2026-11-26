import { randomUUID } from 'node:crypto';
import { pool } from '@/lib/auth';
import { readJson } from '@/lib/assets';
import { BOARD_LIMIT, BOARD_NAME_TAKEN, boardName, MAX_BOARD_NAME, MAX_BOARDS } from '@/lib/library-boards';
import { guard } from '@/lib/session';
import { listBoards } from './fields';

/**
 * The caller's own boards in the active workspace by name: `{ boards: [{ id, name, count }] }`, `count` being the items still in the Library. Private to the owner:
 * no other member, not even an Admin, sees them (an Admin's system=1 view may show more items than `count` says).
 */
export async function GET(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  return Response.json({ boards: await listBoards(g.session.user.id, g.workspaceId) });
}

/**
 * Makes a board: `{ name }` (NFC, trimmed, 1 to 60 characters on one line). 201 with `{ id, name, count: 0 }`; 400 for a bad name; 409 `board_name_taken` for a name the
 * caller already uses here (compared without case) and 409 `board_limit` at MAX_BOARDS boards in this workspace.
 */
export async function POST(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const b = await readJson(request);
  const name = boardName(b && typeof b === 'object' ? (b as Record<string, unknown>).name : undefined);
  if (name === null) return Response.json({ error: `name must have 1 to ${MAX_BOARD_NAME} characters on one line` }, { status: 400 });
  const userId = g.session.user.id;
  const id = randomUUID();
  // One writer per member and workspace, so two adds cannot both take the last place (the shape of POST /api/choices).
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`select pg_advisory_xact_lock(hashtext('library_boards:' || $1 || ':' || $2))`, [userId, g.workspaceId]);
    if ((await client.query('select count(*)::int as n from library_boards where user_id = $1 and workspace_id = $2', [userId, g.workspaceId])).rows[0].n >= MAX_BOARDS) {
      await client.query('rollback');
      return Response.json({ error: `you can keep at most ${MAX_BOARDS} boards; delete one first`, code: BOARD_LIMIT }, { status: 409 });
    }
    await client.query('insert into library_boards (id, user_id, workspace_id, name) values ($1, $2, $3, $4)', [id, userId, g.workspaceId, name]);
    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    if ((e as { code?: string }).code === '23505') return Response.json({ error: 'you already have a board with this name', code: BOARD_NAME_TAKEN }, { status: 409 });
    throw e;
  } finally {
    client.release();
  }
  return Response.json({ id, name, count: 0 }, { status: 201 });
}
