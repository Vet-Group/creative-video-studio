// The Admin Overview: this month's two budgets (the same figures as the Costs page), today's jobs, accounts, models and the latest audit entries.
import { pool } from '@/lib/auth';
import { costsPage, snapshot } from '@/lib/costs';

const ICT_TODAY = `(date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh')`;

export async function adminOverview() {
  const costs = costsPage(await snapshot(null));
  const [today, running, users, models, audit] = await Promise.all([
    pool.query(
      `select count(*)::int as today, count(*) filter (where status = 'succeeded')::int as succeeded,
              count(*) filter (where status in ('failed', 'failed_unknown', 'timed_out'))::int as failed
         from jobs where created_at >= ${ICT_TODAY}`,
    ),
    pool.query(`select count(*)::int as running from jobs where status in ('queued', 'submitting', 'running')`),
    pool.query('select count(*) filter (where not banned)::int as active, count(*) filter (where banned)::int as locked from users'),
    pool.query('select count(*) filter (where enabled)::int as enabled, count(*)::int as total from model_configs where twin_of is null'),
    pool.query(
      `select a.id::int as id, coalesce(u.name, 'Hệ thống') as "actorName", a.action, a.target, a.created_at as "createdAt"
         from audit_entries a left join users u on u.id = a.actor_id order by a.id desc limit 40`,
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
  };
}

export type AdminOverview = Awaited<ReturnType<typeof adminOverview>>;
