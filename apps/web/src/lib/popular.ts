// Social proof: how many Runs of an app or a preset the viewer's own workspace made in the last 7 days. Never who made them, and never another workspace's numbers.
import type { Queryable } from '@cvs/core/ledger';

/** A line shows only from this many Runs, so a quiet week reads as nothing rather than as one lonely Run. */
export const MIN_USES = 3;

/** The line under a card or tile, or null under MIN_USES. */
export const usesLine = (n: number | undefined): string | null => (n !== undefined && n >= MIN_USES ? `${n.toLocaleString('vi-VN')} lượt dùng tuần này` : null);

/**
 * The workspace's Runs of the last 7 days, by job feature and by preset (the counts as they are: the sort reads those under MIN_USES too).
 * One Run counts once: the jobs of a bulk or multi-item Run share `params.batch` (Marketing Studio's clips and Create's camera angles included), a retry is no new Run, and a deleted job was a Run all the same.
 * A Run counts for the tool the member used: a custom app's jobs (`params.app`, the app's id) count under `app:<id>` instead of their feature, and a Smart Remake, which makes no job, is a row of `remakes` counted under `smart_remake`.
 * Jobs made by a system account (`users.system`, such as the Admin account that runs paid tests) never count.
 * shortcut: Marketing and camera-angle Runs made before `params.batch` was sent for them count each clip until they age out of the window, 7 days after that release.
 */
export async function weeklyUses(db: Queryable, workspaceId: string): Promise<{ features: Map<string, number>; presets: Map<string, number> }> {
  const { rows } = await db.query(
    `select feature, preset_id, count(distinct run)::int as n from (
       select coalesce('app:' || (j.params->>'app'), j.feature) as feature, j.preset_id, coalesce(j.params->>'batch', j.id) as run
         from jobs j join users u on u.id = j.user_id
        where j.workspace_id = $1 and j.created_at > now() - interval '7 days' and j.retry_of is null and not u.system
       union all
       select 'smart_remake', null, r.id
         from remakes r join users u on u.id = r.user_id
        where r.workspace_id = $1 and r.created_at > now() - interval '7 days' and not u.system
     ) runs group by feature, preset_id`,
    [workspaceId],
  );
  const features = new Map<string, number>(), presets = new Map<string, number>();
  for (const r of rows as { feature: string; preset_id: string | null; n: number }[]) {
    features.set(r.feature, (features.get(r.feature) ?? 0) + r.n);
    if (r.preset_id) presets.set(r.preset_id, (presets.get(r.preset_id) ?? 0) + r.n);
  }
  return { features, presets };
}
