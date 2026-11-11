import { audit } from '@cvs/core/audit';
import { withTransaction } from '@cvs/core/ledger';
import { FEEDBACK_STATUSES, type FeedbackStatus } from '@cvs/db';
import { bad, readBody } from '@/lib/admin';
import { type RouteContext } from '@/lib/assets';
import { pool } from '@/lib/auth';
import { NOTE_MAX } from '@/lib/feedback';
import { guard } from '@/lib/session';

/**
 * Admin triage of one board item: set `status` (new|reviewing|done|rejected) and/or `adminNote` (the reply the author sees; null or empty clears it).
 * Each change is audited. A no-op body (the same status and note) changes nothing.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const { id } = await params;
  const b = await readBody(request);
  if (!b) return bad('bad request');
  const hasStatus = 'status' in b;
  const hasNote = 'adminNote' in b;
  if (!hasStatus && !hasNote) return bad('nothing to change');
  if (hasStatus && !FEEDBACK_STATUSES.includes(b.status as FeedbackStatus)) return bad(`status must be one of ${FEEDBACK_STATUSES.join(', ')}`);
  let note: string | null = null;
  if (hasNote) {
    if (b.adminNote !== null && typeof b.adminNote !== 'string') return bad('adminNote must be a string or null');
    note = b.adminNote === null ? null : (b.adminNote as string).trim();
    if (note && note.length > NOTE_MAX) return bad(`adminNote must be at most ${NOTE_MAX} characters`);
    if (note === '') note = null;
  }
  const actorId = g.session.user.id;
  const result = await withTransaction(pool, async (tx) => {
    const cur = (await tx.query('select status, admin_note from feedback where id = $1 for update', [id])).rows[0];
    if (!cur) return bad('not found', 404);
    const newStatus = (hasStatus ? (b.status as FeedbackStatus) : cur.status) as FeedbackStatus;
    const newNote = hasNote ? note : (cur.admin_note as string | null);
    if (newStatus === cur.status && newNote === cur.admin_note) return;
    await tx.query('update feedback set status = $1, admin_note = $2, updated_at = now() where id = $3', [newStatus, newNote, id]);
    await audit(tx, {
      actorId,
      action: 'feedback.update',
      target: `feedback:${id}`,
      oldValue: { status: cur.status, adminNote: cur.admin_note },
      newValue: { status: newStatus, adminNote: newNote },
    });
  });
  return result ?? Response.json({ ok: true });
}
