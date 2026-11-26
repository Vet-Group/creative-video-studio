import { pool } from '@/lib/auth';
import { readJson, type RouteContext } from '@/lib/assets';
import { LIBRARY_LISTED, LIVE_CLIP } from '@/lib/clips';
import { BOARD_ID, MAX_BOARD_BATCH } from '@/lib/library-boards';
import { guard } from '@/lib/session';

const notFound = () => Response.json({ error: 'not found' }, { status: 404 });

/**
 * Adds results to one of the caller's own boards, or takes them off: `{ jobIds, inBoard }`, one to 50 different job ids. 400 for a bad body; 404 for a board that is
 * not the caller's (another workspace's too, or one deleted meanwhile) and, when adding, for any id that is not a live result the Library lists in this workspace (one of a system
 * account's is not), with nothing written. Adding what is already there changes nothing; taking off needs no liveness, so a hidden result can be cleared. Answers `{ jobIds, inBoard }`.
 */
export async function PUT(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const { id } = await params;
  const b = (await readJson(request)) as { jobIds?: unknown; inBoard?: unknown } | null;
  const ids = b?.jobIds;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > MAX_BOARD_BATCH || ids.some((i) => typeof i !== 'string' || !BOARD_ID.test(i)) || new Set(ids).size !== ids.length) {
    return Response.json({ error: `jobIds must be 1 to ${MAX_BOARD_BATCH} different job ids` }, { status: 400 });
  }
  if (typeof b?.inBoard !== 'boolean') return Response.json({ error: 'inBoard must be true or false' }, { status: 400 });
  // One transaction with the board held `for share`, so a concurrent delete of the board answers 404 here instead of failing on the foreign key.
  const client = await pool.connect();
  try {
    await client.query('begin');
    if ((await client.query('select 1 from library_boards where id = $1 and user_id = $2 and workspace_id = $3 for share', [id, g.session.user.id, g.workspaceId])).rowCount !== 1) {
      await client.query('rollback');
      return notFound();
    }
    if (b.inBoard) {
      const live = await client.query(`select count(*)::int as n from jobs j where j.id = any($1::text[]) and j.workspace_id = $2 and ${LIVE_CLIP} and ${LIBRARY_LISTED}`, [ids, g.workspaceId]);
      if (live.rows[0].n !== ids.length) {
        await client.query('rollback');
        return notFound();
      }
      await client.query('insert into library_board_items (board_id, job_id) select $1, unnest($2::text[]) on conflict do nothing', [id, ids]);
    } else {
      await client.query('delete from library_board_items where board_id = $1 and job_id = any($2::text[])', [id, ids]);
    }
    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
  return Response.json({ jobIds: ids, inBoard: b.inBoard });
}
