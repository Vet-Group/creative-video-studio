import { audit } from '@cvs/core/audit';
import { withTransaction } from '@cvs/core/ledger';
import { bad, money, pgCode, readBody } from '@/lib/admin';
import { pool } from '@/lib/auth';
import { guard } from '@/lib/session';

const MEMBER_CAPS = ['featuresMonthlyCapUsd', 'memberDailyUsdCap', 'memberMonthlyUsdCap'] as const;
const CAP_COLUMNS: Record<(typeof MEMBER_CAPS)[number], string> = {
  featuresMonthlyCapUsd: 'features_monthly_cap_usd',
  memberDailyUsdCap: 'member_daily_usd_cap',
  memberMonthlyUsdCap: 'member_monthly_usd_cap',
};

/** Admin: the caps (video month, daily clips, the image and apps month, each member's USD day and month), the soft per-feature caps, and every model. */
export async function GET(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const caps = (
    await pool.query(
      `select monthly_cap_usd::text as "monthlyCapUsd", member_daily_clip_cap as "memberDailyClipCap", features_monthly_cap_usd::text as "featuresMonthlyCapUsd",
              member_daily_usd_cap::text as "memberDailyUsdCap", member_monthly_usd_cap::text as "memberMonthlyUsdCap" from settings where id = 1`,
    )
  ).rows[0];
  const models = await pool.query('select id, label, provider, enabled, (usd_per_second is not null or image_prices is not null) as priced from model_configs order by provider, id');
  const featureCaps = await pool.query('select feature, monthly_usd::text as "monthlyUsd" from feature_caps order by feature');
  return Response.json({ ...caps, featureCaps: featureCaps.rows, models: models.rows });
}

/**
 * Admin: change `monthlyCapUsd`, `memberDailyClipCap`, `featuresMonthlyCapUsd`, `memberDailyUsdCap`, `memberMonthlyUsdCap`, `featureCaps` (a list of
 * `{ feature, monthlyUsd }`) and/or `models` (a list of `{ id, enabled }`). All or nothing. Changed caps are audited as settings.update, each changed
 * soft cap as feature_cap.update and each changed model as model.set_enabled. A real video model without a bake-off record that clears 70% (`pass_seed_passes`
 * / `pass_seed_total`) cannot be enabled, and the database refuses to enable a model whose limits and price are not recorded; both are 400 and nothing is changed.
 */
export async function PUT(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const body = (await readBody(request)) ?? {};
  const { monthlyCapUsd, memberDailyClipCap, models, featureCaps } = body;
  const usd = money(monthlyCapUsd);
  const memberCaps: Partial<Record<(typeof MEMBER_CAPS)[number], string>> = {};
  for (const k of MEMBER_CAPS) {
    if (body[k] === undefined) continue;
    const v = money(body[k]);
    if (v === null) return bad(`${k} must be an amount of 0 or more with at most 4 decimals`);
    memberCaps[k] = v;
  }
  const softCaps = featureCaps === undefined ? [] : featureCaps;
  if (!Array.isArray(softCaps) || softCaps.some((c) => typeof c?.feature !== 'string' || money(c?.monthlyUsd) === null)) {
    return bad('featureCaps must be a list of { feature, monthlyUsd }');
  }
  if (monthlyCapUsd !== undefined && usd === null) return bad('monthlyCapUsd must be an amount of 0 or more with at most 4 decimals');
  if (memberDailyClipCap !== undefined && !(Number.isInteger(memberDailyClipCap) && (memberDailyClipCap as number) >= 0 && (memberDailyClipCap as number) <= 100_000)) {
    return bad('memberDailyClipCap must be a whole number of 0 or more');
  }
  const list = models === undefined ? [] : models;
  if (!Array.isArray(list) || list.some((m) => typeof m?.id !== 'string' || typeof m?.enabled !== 'boolean')) return bad('models must be a list of { id, enabled }');
  if ([monthlyCapUsd, memberDailyClipCap, models, featureCaps, ...MEMBER_CAPS.map((k) => body[k])].every((v) => v === undefined)) {
    return bad(`give at least one of monthlyCapUsd, memberDailyClipCap, ${MEMBER_CAPS.join(', ')}, featureCaps, models`);
  }
  const features = [...new Set((softCaps as { feature: string }[]).map((c) => c.feature))];
  if (features.length !== softCaps.length) return bad('featureCaps must name each feature once');
  if ((await pool.query('select 1 from feature_caps where feature = any($1::text[])', [features])).rowCount !== features.length) return bad('unknown feature', 404);
  const ids = [...new Set((list as { id: string }[]).map((m) => m.id))];
  if ((await pool.query('select 1 from model_configs where id = any($1::text[])', [ids])).rowCount !== ids.length) return bad('unknown model', 404);
  // A real video model needs a bake-off record that clears the 70% bar (AC 22): the seeded passes and total of its mini bake-off, see
  // docs/ops/adding-a-model.md. Seedance 2.5 keeps its 6/9 record but cannot be enabled. Image and mock models have none.
  const noRecord = await pool.query(
    `select id from model_configs where id = any($1::text[]) and not enabled and kind = 'video' and provider <> 'mock'
       and (coalesce(pass_seed_total, 0) = 0 or pass_seed_passes < 0.7 * pass_seed_total) order by id`,
    [(list as { id: string; enabled: boolean }[]).filter((m) => m.enabled).map((m) => m.id)],
  );
  if (noRecord.rowCount) return bad(`no passing bake-off record (at least 70%) for ${noRecord.rows.map((r) => r.id).join(', ')}; run the mini bake-off in docs/ops/adding-a-model.md first`);
  const actorId = g.session.user.id;

  try {
    return await withTransaction(pool, async (tx): Promise<Response> => {
      const old = (await tx.query('select monthly_cap_usd::text as usd, member_daily_clip_cap as daily from settings where id = 1 for update')).rows[0];
      const next = { usd: usd ?? old.usd, daily: (memberDailyClipCap as number | undefined) ?? old.daily };
      if (Number(next.usd) !== Number(old.usd) || next.daily !== old.daily) {
        await tx.query('update settings set monthly_cap_usd = $1, member_daily_clip_cap = $2, updated_at = now() where id = 1', [next.usd, next.daily]);
        await audit(tx, {
          actorId, action: 'settings.update', target: 'settings:1',
          oldValue: { monthlyCapUsd: old.usd, memberDailyClipCap: old.daily }, newValue: { monthlyCapUsd: next.usd, memberDailyClipCap: next.daily },
        });
      }
      const oldCaps = (
        await tx.query(
          'select features_monthly_cap_usd::text as "featuresMonthlyCapUsd", member_daily_usd_cap::text as "memberDailyUsdCap", member_monthly_usd_cap::text as "memberMonthlyUsdCap" from settings where id = 1 for update',
        )
      ).rows[0] as Record<(typeof MEMBER_CAPS)[number], string>;
      const changed = MEMBER_CAPS.filter((k) => memberCaps[k] !== undefined && Number(memberCaps[k]) !== Number(oldCaps[k]));
      if (changed.length) {
        for (const k of changed) await tx.query(`update settings set ${CAP_COLUMNS[k]} = $1, updated_at = now() where id = 1`, [memberCaps[k]]);
        await audit(tx, {
          actorId, action: 'settings.update', target: 'settings:1',
          oldValue: Object.fromEntries(changed.map((k) => [k, oldCaps[k]])), newValue: Object.fromEntries(changed.map((k) => [k, memberCaps[k]])),
        });
      }
      for (const c of softCaps as { feature: string; monthlyUsd: unknown }[]) {
        const old = (await tx.query('select monthly_usd::text as usd from feature_caps where feature = $1 for update', [c.feature])).rows[0];
        const usdNew = money(c.monthlyUsd)!;
        if (Number(old.usd) === Number(usdNew)) continue;
        await tx.query('update feature_caps set monthly_usd = $2, updated_at = now() where feature = $1', [c.feature, usdNew]);
        await audit(tx, { actorId, action: 'feature_cap.update', target: `feature:${c.feature}`, oldValue: { monthlyUsd: old.usd }, newValue: { monthlyUsd: usdNew } });
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
