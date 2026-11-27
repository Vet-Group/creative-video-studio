// Social proof: how many Runs of an app or a preset the viewer's own workspace made in the last 7 days. Never who made them, and never another workspace's numbers.
import type { Queryable } from '@cvs/core/ledger';

/** A line shows only from this many Runs, so a quiet week reads as nothing rather than as one lonely Run. */
export const MIN_USES = 3;

/** The line under a card or tile, or null under MIN_USES. */
export const usesLine = (n: number | undefined): string | null => (n !== undefined && n >= MIN_USES ? `${n.toLocaleString('vi-VN')} lượt dùng tuần này` : null);

/**
 * The workspace's Runs of the last 7 days, by job feature and by preset (the counts as they are: the sort reads those under MIN_USES too).
 * One Run counts once: the jobs of a bulk or multi-item Run share `params.batch`, a retry is no new Run, and a deleted job was a Run all the same.
 * shortcut: Marketing's clips and Create's camera angles carry no shared id, so each clip counts; give them a batch id if their numbers matter.
 */
export async function weeklyUses(db: Queryable, workspaceId: string): Promise<{ features: Map<string, number>; presets: Map<string, number> }> {
  const { rows } = await db.query(
    `select feature, preset_id, count(distinct coalesce(params->>'batch', id))::int as n
       from jobs where workspace_id = $1 and created_at > now() - interval '7 days' and retry_of is null
      group by feature, preset_id`,
    [workspaceId],
  );
  const features = new Map<string, number>(), presets = new Map<string, number>();
  for (const r of rows as { feature: string; preset_id: string | null; n: number }[]) {
    features.set(r.feature, (features.get(r.feature) ?? 0) + r.n);
    if (r.preset_id) presets.set(r.preset_id, (presets.get(r.preset_id) ?? 0) + r.n);
  }
  return { features, presets };
}
