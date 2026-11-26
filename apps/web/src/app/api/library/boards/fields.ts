// The boards' server half, beside their route files (a module under app/ that is not a route is ignored by Next; lib/library-boards.ts is the client-safe half):
// the one rule of who sees a board and the list SQL.
import { pool } from '@/lib/auth';
import { LIBRARY_LISTED, LIVE_CLIP } from '@/lib/clips';
import type { LibraryBoard } from '@/lib/library-boards';

/** The caller's boards in `workspaceId` by name (`id` keeps one), each with the count of its items still in the Library. Who sees a board: its owner, in the active
 * workspace, with no Admin bypass and no sharing. */
export async function listBoards(userId: string, workspaceId: string, id: string | null = null): Promise<LibraryBoard[]> {
  const { rows } = await pool.query(
    `select b.id, b.name, (select count(*)::int from library_board_items bi join jobs j on j.id = bi.job_id where bi.board_id = b.id and ${LIVE_CLIP} and ${LIBRARY_LISTED}) as count
       from library_boards b where b.user_id = $1 and b.workspace_id = $2 and ($3::text is null or b.id = $3) order by lower(b.name), b.id`,
    [userId, workspaceId, id],
  );
  return rows;
}
