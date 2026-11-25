// The Admin Overview: this month's two budgets (the same figures as the Costs page), today's jobs, accounts, models, the latest audit entries and
// when each sales-team member last used CVS.
import { CANCELED_ERROR } from '@cvs/core/ledger';
import { pool } from '@/lib/auth';
import { costsPage, snapshot, wholeMonth } from '@/lib/costs';

const ICT_TODAY = `(date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh')`;

export async function adminOverview() {
  const costs = costsPage(await snapshot(wholeMonth(null)), false);
  const [today, running, users, models, audit, sellers] = await Promise.all([
    pool.query(
      `select count(*)::int as today, count(*) filter (where status = 'succeeded')::int as succeeded,
              count(*) filter (where status in ('failed', 'failed_unknown', 'timed_out') and error is distinct from '${CANCELED_ERROR}')::int as failed
         from jobs where created_at >= ${ICT_TODAY}`,
    ),
    pool.query(`select count(*)::int as running from jobs where status in ('queued', 'submitting', 'running')`),
    pool.query('select count(*) filter (where not banned)::int as active, count(*) filter (where banned)::int as locked from users'),
    pool.query('select count(*) filter (where enabled)::int as enabled, count(*)::int as total from model_configs where twin_of is null'),
    pool.query(
      `select a.id::int as id, coalesce(u.name, 'Hệ thống') as "actorName", a.action, a.target, a.created_at as "createdAt"
         from audit_entries a left join users u on u.id = a.actor_id order by a.id desc limit 40`,
    ),
    // Who in each sales team uses CVS: their last job or video analysis, and the last trace of their own sign-in. Sign-out deletes a session row, so a
    // linked sign-in account (Lark, made on the first sign-in) counts too; an Admin-made password account and an Admin's impersonation do not.
    pool.query(
      `select u.id, u.name, t.name as team,
              greatest((select max(created_at) from jobs j where j.user_id = u.id and not j.is_mock), (select max(created_at) from analyses a where a.user_id = u.id)) as "lastUsedAt",
              greatest((select max(updated_at) from sessions s where s.user_id = u.id and s.impersonated_by is null),
                       (select max(created_at) from accounts a where a.user_id = u.id and a.provider_id <> 'credential')) as "lastSeenAt"
         from users u join teams t on t.id = u.team_id
        where t.billable and not t.hidden and not u.banned
        order by t.name, u.name`,
    ),
  ]);
  return {
    month: costs.month,
    provisional: costs.provisional,
    totalUsd: costs.total.usdDisplay,
    video: costs.capUsage,
    features: costs.featuresCapUsage,
    jobs: { ...today.rows[0], ...running.rows[0] } as { today: number; succeeded: number; failed: number; running: number },
    users: users.rows[0] as { active: number; locked: number },
    models: models.rows[0] as { enabled: number; total: number },
    audit: audit.rows as { id: number; actorName: string; action: string; target: string; createdAt: string }[],
    sellers: sellers.rows as { id: string; name: string; team: string; lastUsedAt: string | null; lastSeenAt: string | null }[],
  };
}

export type AdminOverview = Awaited<ReturnType<typeof adminOverview>>;
