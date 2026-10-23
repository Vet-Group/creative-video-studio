// Writes audit_entries (PRD "Audit log"). Call it in the transaction of the change it records, so the two commit or fail together.
import type { Queryable } from './ledger';

export interface AuditEntry {
  actorId: string;
  /** The event type, for example 'verdict.set' or 'clip.delete'. */
  action: string;
  /** What was touched, as 'kind:id' (for example 'job:<id>'). */
  target: string;
  oldValue?: unknown;
  newValue?: unknown;
}

export async function audit(tx: Queryable, e: AuditEntry): Promise<void> {
  await tx.query('insert into audit_entries (actor_id, action, target, old_value, new_value) values ($1, $2, $3, $4::jsonb, $5::jsonb)', [
    e.actorId,
    e.action,
    e.target,
    e.oldValue == null ? null : JSON.stringify(e.oldValue),
    e.newValue == null ? null : JSON.stringify(e.newValue),
  ]);
}
