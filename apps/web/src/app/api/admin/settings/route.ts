import { audit } from '@cvs/core/audit';
import { withTransaction } from '@cvs/core/ledger';
import { bad, pgCode, readBody } from '@/lib/admin';
import { pool } from '@/lib/auth';
import { guard } from '@/lib/session';

/** Admin: the two caps and every model with whether it is enabled and complete enough to enable. */
export async function GET(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const caps = (await pool.query('select monthly_cap_usd::text as "monthlyCapUsd", member_daily_clip_cap as "memberDailyClipCap" from settings where id = 1')).rows[0];
  const models = await pool.query('select id, label, provider, enabled, usd_per_second is not null as priced from model_configs order by provider, id');
  return Response.json({ ...caps, models: models.rows });
}

/**
 * Admin: change `monthlyCapUsd`, `memberDailyClipCap` and/or `models` (a list of `{ id, enabled }`). All or nothing. Changed caps are audited as
 * settings.update and each changed model as model.set_enabled. The database refuses to enable a model whose limits and price are not
 * recorded; that is 400 and nothing is changed.
 */
export async function PUT(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const { monthlyCapUsd, memberDailyClipCap, models } = (await readBody(request)) ?? {};
  const usd = Number(monthlyCapUsd);
  if (monthlyCapUsd !== undefined && !((typeof monthlyCapUsd === 'number' || (typeof monthlyCapUsd === 'string' && monthlyCapUsd.trim() !== '')) && usd >= 0 && usd < 1e8)) {
    return bad('monthlyCapUsd must be a number of 0 or more');
  }
  if (memberDailyClipCap !== undefined && !(Number.isInteger(memberDailyClipCap) && (memberDailyClipCap as number) >= 0 && (memberDailyClipCap as number) <= 100_000)) {
    return bad('memberDailyClipCap must be a whole number of 0 or more');
  }
  const list = models === undefined ? [] : models;
  if (!Array.isArray(list) || list.some((m) => typeof m?.id !== 'string' || typeof m?.enabled !== 'boolean')) return bad('models must be a list of { id, enabled }');
  if ([monthlyCapUsd, memberDailyClipCap, models].every((v) => v === undefined)) return bad('give at least one of monthlyCapUsd, memberDailyClipCap, models');
  const ids = [...new Set((list as { id: string }[]).map((m) => m.id))];
  if ((await pool.query('select 1 from model_configs where id = any($1::text[])', [ids])).rowCount !== ids.length) return bad('unknown model', 404);
  const actorId = g.session.user.id;

  try {
    return await withTransaction(pool, async (tx): Promise<Response> => {
      const old = (await tx.query('select monthly_cap_usd::text as usd, member_daily_clip_cap as daily from settings where id = 1 for update')).rows[0];
      const next = { usd: monthlyCapUsd === undefined ? old.usd : usd.toFixed(4), daily: (memberDailyClipCap as number | undefined) ?? old.daily };
      if (Number(next.usd) !== Number(old.usd) || next.daily !== old.daily) {
        await tx.query('update settings set monthly_cap_usd = $1, member_daily_clip_cap = $2, updated_at = now() where id = 1', [next.usd, next.daily]);
        await audit(tx, {
          actorId, action: 'settings.update', target: 'settings:1',
          oldValue: { monthlyCapUsd: old.usd, memberDailyClipCap: old.daily }, newValue: { monthlyCapUsd: next.usd, memberDailyClipCap: next.daily },
        });
      }
      for (const m of list as { id: string; enabled: boolean }[]) {
        const model = (await tx.query('select enabled from model_configs where id = $1 for update', [m.id])).rows[0];
        if (model.enabled === m.enabled) continue;
        await tx.query('update model_configs set enabled = $2, updated_at = now() where id = $1', [m.id, m.enabled]);
        await audit(tx, { actorId, action: 'model.set_enabled', target: `model:${m.id}`, oldValue: { enabled: model.enabled }, newValue: { enabled: m.enabled } });
      }
      return Response.json({ ok: true });
    });
  } catch (e) {
    if (pgCode(e) === '23514') return bad('a model without recorded limits and price cannot be enabled');
    throw e;
  }
}
