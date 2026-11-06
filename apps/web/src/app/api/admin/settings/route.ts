import { audit } from '@cvs/core/audit';
import { withTransaction } from '@cvs/core/ledger';
import { vertexAccounts } from '@cvs/core/providers/vertex-accounts';
import { bad, money, pgCode, readBody } from '@/lib/admin';
import { pool } from '@/lib/auth';
import { guard } from '@/lib/session';

const MEMBER_CAPS = ['featuresMonthlyCapUsd', 'memberDailyUsdCap', 'memberMonthlyUsdCap', 'balanceWarningUsd'] as const;
const CAP_COLUMNS: Record<(typeof MEMBER_CAPS)[number], string> = {
  featuresMonthlyCapUsd: 'features_monthly_cap_usd',
  memberDailyUsdCap: 'member_daily_usd_cap',
  memberMonthlyUsdCap: 'member_monthly_usd_cap',
  balanceWarningUsd: 'balance_warning_usd',
};

interface VertexCredits {
  projectId: string;
  creditTotal: string | null;
  creditCurrency: string;
  creditExpiresOn: string | null;
  stopWhenCreditsEnd: boolean;
}
const VERTEX_COLUMNS = `project_id as "projectId", credit_total::text as "creditTotal", credit_currency as "creditCurrency", credit_expires_on::text as "creditExpiresOn",
  stop_when_credits_end as "stopWhenCreditsEnd"`;

/** One `{ projectId, creditTotal, creditCurrency, creditExpiresOn, stopWhenCreditsEnd }` as stored, or null when any field is malformed. */
function vertexCredits(v: unknown): VertexCredits | null {
  const a = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const total = a.creditTotal === null ? null : money(a.creditTotal);
  const expires = a.creditExpiresOn;
  // A real calendar day: an impossible one ('2026-02-30') fails to parse or rolls over, so the round trip must give the same text back.
  const validDate = typeof expires === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(expires) && new Date(Date.parse(`${expires}T00:00:00Z`) || 0).toISOString().startsWith(expires);
  if (typeof a.projectId !== 'string' || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(a.projectId) || (a.creditTotal !== null && total === null)) return null;
  if (typeof a.creditCurrency !== 'string' || !/^[A-Z]{3}$/.test(a.creditCurrency) || (expires !== null && !validDate) || typeof a.stopWhenCreditsEnd !== 'boolean') return null;
  return { projectId: a.projectId, creditTotal: total, creditCurrency: a.creditCurrency, creditExpiresOn: expires as string | null, stopWhenCreditsEnd: a.stopWhenCreditsEnd };
}

const sameCredits = (a: VertexCredits, b: VertexCredits) =>
  (a.creditTotal === null ? b.creditTotal === null : b.creditTotal !== null && Number(a.creditTotal) === Number(b.creditTotal)) &&
  a.creditCurrency === b.creditCurrency && a.creditExpiresOn === b.creditExpiresOn && a.stopWhenCreditsEnd === b.stopWhenCreditsEnd;

/**
 * Admin: the caps (video month, daily clips, the image and apps month, each member's USD day and month), the balance warning threshold, the
 * soft per-feature caps, every model but the dearer row of a pair of duplicates (`twin_of`, migration 0075: the owner keeps only the cheaper one on offer), and the Vertex accounts: the configured ones in order (`configured`), then any other with credits on record, and the active one.
 */
export async function GET(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const caps = (
    await pool.query(
      `select monthly_cap_usd::text as "monthlyCapUsd", member_daily_clip_cap as "memberDailyClipCap", features_monthly_cap_usd::text as "featuresMonthlyCapUsd",
              member_daily_usd_cap::text as "memberDailyUsdCap", member_monthly_usd_cap::text as "memberMonthlyUsdCap", vertex_active_project as "vertexActiveProject",
              balance_warning_usd::text as "balanceWarningUsd"
         from settings where id = 1`,
    )
  ).rows[0];
  // `priced` is what lets the Admin switch a row on: a recorded price.
  const models = await pool.query('select id, label, provider, enabled, (usd_per_second is not null or image_prices is not null) as priced from model_configs where twin_of is null order by provider, id');
  const featureCaps = await pool.query('select feature, monthly_usd::text as "monthlyUsd" from feature_caps order by feature');
  let configured: string[] = [];
  try {
    configured = vertexAccounts(process.env).map((a) => a.project);
  } catch (e) {
    // A key file the web cannot read must not take the caps page down; the account still shows if it has credits on record.
    console.error('settings: Vertex keys:', e instanceof Error ? e.message : e);
  }
  const rows = (await pool.query(`select ${VERTEX_COLUMNS} from vertex_accounts order by project_id`)).rows as VertexCredits[];
  const vertex = [
    ...configured.map((p) => rows.find((r) => r.projectId === p) ?? { projectId: p, creditTotal: null, creditCurrency: 'USD', creditExpiresOn: null, stopWhenCreditsEnd: false }),
    ...rows.filter((r) => !configured.includes(r.projectId)),
  ].map((a) => ({ ...a, configured: configured.includes(a.projectId) }));
  return Response.json({ ...caps, featureCaps: featureCaps.rows, models: models.rows, vertexAccounts: vertex });
}

/**
 * Admin: change `monthlyCapUsd`, `memberDailyClipCap`, `featuresMonthlyCapUsd`, `memberDailyUsdCap`, `memberMonthlyUsdCap`, `balanceWarningUsd`,
 * `featureCaps` (a list of `{ feature, monthlyUsd }`), `models` (a list of `{ id, enabled }`) and/or `vertexAccounts` (a list of `{ projectId, creditTotal, creditCurrency,
 * creditExpiresOn, stopWhenCreditsEnd }`, total and date nullable). All or nothing. Changed caps are audited as settings.update, each changed
 * soft cap as feature_cap.update, each changed model as model.set_enabled and each changed Vertex account as vertex_account.update. Any model can
 * be enabled (the owner opened them all on 2026-10-25; its bake-off record only feeds the recommendation score), but the database refuses one
 * whose limits and price are not recorded: 400 and nothing is changed. A duplicate's dearer row (`twin_of`) is not the Admin's to switch: 400.
 */
export async function PUT(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const body = (await readBody(request)) ?? {};
  const { monthlyCapUsd, memberDailyClipCap, models, featureCaps } = body;
  const vertexList = body.vertexAccounts === undefined ? [] : body.vertexAccounts;
  const credits = Array.isArray(vertexList) ? vertexList.map(vertexCredits) : [null];
  if (credits.some((c) => c === null)) {
    return bad('vertexAccounts must be a list of { projectId, creditTotal (amount or null), creditCurrency (3 letters), creditExpiresOn (YYYY-MM-DD or null), stopWhenCreditsEnd }');
  }
  if (new Set(credits.map((c) => c!.projectId)).size !== credits.length) return bad('vertexAccounts must name each project once');
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
  if ([monthlyCapUsd, memberDailyClipCap, models, featureCaps, body.vertexAccounts, ...MEMBER_CAPS.map((k) => body[k])].every((v) => v === undefined)) {
    return bad(`give at least one of monthlyCapUsd, memberDailyClipCap, ${MEMBER_CAPS.join(', ')}, featureCaps, models, vertexAccounts`);
  }
  const features = [...new Set((softCaps as { feature: string }[]).map((c) => c.feature))];
  if (features.length !== softCaps.length) return bad('featureCaps must name each feature once');
  if ((await pool.query('select 1 from feature_caps where feature = any($1::text[])', [features])).rowCount !== features.length) return bad('unknown feature', 404);
  const ids = [...new Set((list as { id: string }[]).map((m) => m.id))];
  if ((await pool.query('select 1 from model_configs where id = any($1::text[])', [ids])).rowCount !== ids.length) return bad('unknown model', 404);
  if ((await pool.query('select 1 from model_configs where id = any($1::text[]) and twin_of is not null', [ids])).rowCount) return bad('a duplicate model follows its twin and cannot be switched here');
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
          'select features_monthly_cap_usd::text as "featuresMonthlyCapUsd", member_daily_usd_cap::text as "memberDailyUsdCap", member_monthly_usd_cap::text as "memberMonthlyUsdCap", balance_warning_usd::text as "balanceWarningUsd" from settings where id = 1 for update',
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
      for (const { projectId, ...next } of credits as VertexCredits[]) {
        const found = (await tx.query(`select ${VERTEX_COLUMNS} from vertex_accounts where project_id = $1 for update`, [projectId])).rows[0] as VertexCredits | undefined;
        if (found && sameCredits(found, { projectId, ...next })) continue;
        await tx.query(
          `insert into vertex_accounts (project_id, credit_total, credit_currency, credit_expires_on, stop_when_credits_end) values ($1, $2, $3, $4, $5)
           on conflict (project_id) do update set credit_total = $2, credit_currency = $3, credit_expires_on = $4, stop_when_credits_end = $5, updated_at = now()`,
          [projectId, next.creditTotal, next.creditCurrency, next.creditExpiresOn, next.stopWhenCreditsEnd],
        );
        const oldValue = found && { creditTotal: found.creditTotal, creditCurrency: found.creditCurrency, creditExpiresOn: found.creditExpiresOn, stopWhenCreditsEnd: found.stopWhenCreditsEnd };
        await audit(tx, { actorId, action: 'vertex_account.update', target: `vertex_account:${projectId}`, oldValue, newValue: next });
      }
      return Response.json({ ok: true });
    });
  } catch (e) {
    if (pgCode(e) === '23514') return bad('a model without recorded limits and price cannot be enabled');
    throw e;
  }
}
