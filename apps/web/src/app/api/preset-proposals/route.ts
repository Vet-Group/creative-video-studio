import { withTransaction } from '@cvs/core/ledger';
import { bad, readBody } from '@/lib/admin';
import { pool } from '@/lib/auth';
import { presetFields } from '@/lib/presets';
import { guard, isEditor } from '@/lib/session';

/** How many undecided proposals one member may have at a time. */
export const MAX_PENDING_PROPOSALS = 20;
export const MAX_PROPOSAL_NOTE = 500;

/**
 * The caller's own proposals, newest first, and for a template editor every pending one too, each with the preset it would change as it is now
 * (`current`, null for a new preset). A member never reads a preset's prompt, as in GET /api/presets.
 */
export async function GET(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const editor = isEditor(g.session.user);
  const { rows } = await pool.query(
    `select p.id, p.preset_id, p.label, p.prompt, p.enabled, p.sort_order, p.note, p.status, p.created_at, u.name as proposed_by, p.proposed_by = $1 as mine,
            c.label as c_label, c.prompt as c_prompt, c.enabled as c_enabled, c.sort_order as c_sort_order
       from preset_proposals p join users u on u.id = p.proposed_by left join presets c on c.id = p.preset_id
      where p.proposed_by = $1 or ($2 and p.status = 'pending')
      order by p.created_at desc, p.id limit 200`,
    [g.session.user.id, editor],
  );
  return Response.json({
    proposals: rows.map((r) => ({
      id: r.id, presetId: r.preset_id, label: r.label, prompt: r.prompt, enabled: r.enabled, sortOrder: r.sort_order, note: r.note, status: r.status,
      createdAt: r.created_at.toISOString(), proposedBy: r.proposed_by, mine: r.mine,
      current: r.preset_id === null ? null : { label: r.c_label, enabled: r.c_enabled, sortOrder: r.c_sort_order, ...(editor ? { prompt: r.c_prompt } : {}) },
    })),
  });
}

/**
 * Any member: propose a change to a preset (`presetId` with at least one of `label`, `prompt`, `sortOrder`, `enabled`, checked as an edit is)
 * or a new preset (no `presetId`; `label` and `prompt` required), with an optional `note`. An Admin or template editor decides it
 * (./[id]/decision). A member has at most MAX_PENDING_PROPOSALS undecided at a time.
 */
export async function POST(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const body = (await readBody(request)) ?? {};
  const fields = presetFields(body);
  if (typeof fields === 'string') return bad(fields);
  const { presetId = null, note = null } = body;
  if (presetId !== null && typeof presetId !== 'string') return bad('presetId must be a preset id, or left out for a new preset');
  if (note !== null && !(typeof note === 'string' && note.trim().length <= MAX_PROPOSAL_NOTE)) return bad(`note has at most ${MAX_PROPOSAL_NOTE} characters`);
  if (presetId === null && (fields.label === undefined || fields.prompt === undefined)) return bad('a new preset needs a label and a prompt');
  if (Object.keys(fields).length === 0) return bad('give at least one of label, prompt, sortOrder, enabled');
  if (presetId !== null && !(await pool.query('select 1 from presets where id = $1', [presetId])).rowCount) return bad('not found', 404);

  const userId = g.session.user.id;
  return withTransaction(pool, async (tx): Promise<Response> => {
    await tx.query('select pg_advisory_xact_lock(hashtext($1))', [`preset_proposals:${userId}`]); // two sends at once both count the other
    const pending = (await tx.query(`select count(*)::int as n from preset_proposals where proposed_by = $1 and status = 'pending'`, [userId])).rows[0].n;
    if (pending >= MAX_PENDING_PROPOSALS) return bad(`Bạn đã có ${MAX_PENDING_PROPOSALS} đề xuất đang chờ duyệt. Hãy chờ duyệt bớt rồi gửi tiếp.`, 429); // a cap refusal members read (errorText)
    const id = crypto.randomUUID();
    await tx.query(
      'insert into preset_proposals (id, preset_id, label, prompt, enabled, sort_order, note, proposed_by) values ($1, $2, $3, $4, $5, $6, $7, $8)',
      [id, presetId, fields.label ?? null, fields.prompt ?? null, fields.enabled ?? null, fields.sortOrder ?? null, typeof note === 'string' && note.trim() ? note.trim() : null, userId],
    );
    return Response.json({ id, status: 'pending' }, { status: 201 });
  });
}
