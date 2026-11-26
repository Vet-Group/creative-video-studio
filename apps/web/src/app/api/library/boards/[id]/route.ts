import { pool } from '@/lib/auth';
import { readJson, type RouteContext } from '@/lib/assets';
import { BOARD_NAME_TAKEN, boardName, MAX_BOARD_NAME } from '@/lib/library-boards';
import { guard } from '@/lib/session';
import { listBoards } from '../fields';

const notFound = () => Response.json({ error: 'not found' }, { status: 404 });

/**
 * Renames one of the caller's own boards (404 for any other, another workspace's too): `{ name }` as POST takes it. The id stays, so a saved link still opens
 * it. Answers with the board as GET lists it; 409 `board_name_taken` for a name the caller already uses.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { id } = await params;
  const b = await readJson(request);
  const name = boardName(b && typeof b === 'object' ? (b as Record<string, unknown>).name : undefined);
  if (name === null) return Response.json({ error: `name must have 1 to ${MAX_BOARD_NAME} characters on one line` }, { status: 400 });
  const userId = g.session.user.id;
  try {
    if ((await pool.query('update library_boards set name = $3 where id = $4 and user_id = $1 and workspace_id = $2', [userId, g.workspaceId, name, id])).rowCount !== 1) return notFound();
  } catch (e) {
    if ((e as { code?: string }).code === '23505') return Response.json({ error: 'you already have a board with this name', code: BOARD_NAME_TAKEN }, { status: 409 });
    throw e;
  }
  const updated = (await listBoards(userId, g.workspaceId, id))[0];
  return updated ? Response.json(updated) : notFound(); // deleted between the update and the read
}

/** Deletes one of the caller's own boards (404 for any other). Its results stay in the Library, with their favourites and marks. */
export async function DELETE(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { id } = await params;
  const { rowCount } = await pool.query('delete from library_boards where id = $3 and user_id = $1 and workspace_id = $2', [g.session.user.id, g.workspaceId, id]);
  return rowCount === 1 ? new Response(null, { status: 204 }) : notFound();
}
