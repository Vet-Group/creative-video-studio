// The recommendation score of a model, computed on every request from what the app has harvested: the prior quality (a bake-off record or a public
// leaderboard, model_configs.pass_seed_*), staff Pass/Fail marks, and how often its real jobs end well. The best-scoring model of a picker gets the badge.
import { pool } from '@/lib/auth';

export interface ModelStats {
  passes: number;
  total: number;
  ok: number;
  bad: number;
}

/** Each real job outcome counts against 4 assumed successes, so one early failure dents a model without sinking it. */
const RELIABILITY_PRIOR = 4;

/** Quality is the pass rate (0.5 while nothing is counted), reliability the share of real jobs that ended well; the score is 0-100. */
export function scoreOf(s: ModelStats) {
  const passRate = s.total > 0 ? s.passes / s.total : null;
  const reliability = (s.ok + RELIABILITY_PRIOR) / (s.ok + s.bad + RELIABILITY_PRIOR);
  return { passRate, reliability, score: Math.round(100 * (passRate ?? 0.5) * reliability) };
}

/**
 * `best`: the highest score, the cheaper on a tie, then by id (what a picker pre-selects). `recommended`: the best, unless every choice scores the same
 * (nothing tells them apart yet) or there is only one.
 */
export function rank(models: { id: string; score: number; usd: number }[]): { best: string | null; recommended: string | null } {
  const sorted = [...models].sort((a, b) => b.score - a.score || a.usd - b.usd || a.id.localeCompare(b.id));
  const first = sorted[0];
  return { best: first?.id ?? null, recommended: first && first.score > sorted[sorted.length - 1]!.score ? first.id : null };
}

/**
 * Prior plus marked passes and totals, and real job outcomes, per model. With `feature` only that feature's marks and jobs count (a model can serve
 * several features); without it every one does. Marks on deleted or purged results count too.
 */
export async function modelStats(feature: string | null): Promise<Map<string, ModelStats>> {
  const { rows } = await pool.query(
    `select m.id, coalesce(m.pass_seed_passes, 0) + coalesce(v.passes, 0) as passes, coalesce(m.pass_seed_total, 0) + coalesce(v.total, 0) as total,
            coalesce(o.ok, 0) as ok, coalesce(o.bad, 0) as bad
       from model_configs m
       left join (select j.model, (count(*) filter (where v.verdict = 'pass'))::int as passes, count(*)::int as total
                    from verdicts v join jobs j on j.id = v.job_id where $1::text is null or j.feature = $1 group by j.model) v on v.model = m.id
       left join (select model, (count(*) filter (where status = 'succeeded'))::int as ok,
                         (count(*) filter (where status in ('failed', 'failed_unknown', 'timed_out')))::int as bad
                    from jobs where not is_mock and ($1::text is null or feature = $1) group by model) o on o.model = m.id
      where m.enabled`,
    [feature],
  );
  return new Map(rows.map((r: Record<string, unknown>) => [r.id as string, { passes: Number(r.passes), total: Number(r.total), ok: Number(r.ok), bad: Number(r.bad) }]));
}
