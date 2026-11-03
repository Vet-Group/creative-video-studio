import { AUDIO_USD_PER_SECOND } from '@cvs/core/models';
import { serviceAccountToken } from '@cvs/core/providers/vertex';
import { type CreditRow, creditState, vertexAccounts } from '@cvs/core/providers/vertex-accounts';
import { catalogUsdPrices, readVertexBilling } from '@cvs/core/providers/vertex-billing';
import { bad, isMonth } from '@/lib/admin';
import { pool } from '@/lib/auth';
import { guard } from '@/lib/session';

const CACHE_MS = 5 * 60_000;
const cache = new Map<string, { at: number; body: unknown }>();

/** The app's Vertex prices next to the Cloud Billing Catalog's; only Veo 3.1 maps one app price to one SKU (Gemini image SKUs are per token). */
const PRICE_CHECKS = [
  { label: 'Veo 3.1 (Vertex), không tiếng', sku: '4D50-275D-FC3F', app: (silentUsd: number | null) => silentUsd },
  { label: 'Veo 3.1 (Vertex), có tiếng', sku: 'F64B-2A78-7BAE', app: () => AUDIO_USD_PER_SECOND['veo-3.1-generate-001'] ?? null },
];

const sum = (xs: number[]) => xs.reduce((a, x) => a + x, 0);

/**
 * Admin: what Google billed each Vertex account (read live from its billing export, kept 5 minutes per month): the month's Vertex cost and credits in
 * USD by SKU, the account's credits (Admin total minus used), whether it is the active one, and the app's Veo prices against the Catalog's, `red`
 * when they differ by more than 1%. An account Google refuses carries `error` instead of figures. `{ configured: false }` without any Vertex key.
 */
export async function GET(request: Request) {
  const g = await guard(request, 'admin');
  if (g.error) return g.error;
  const month = new URL(request.url).searchParams.get('month');
  if (!isMonth(month)) return bad('month must look like 2026-09');
  const accounts = vertexAccounts(process.env);
  if (!accounts.length) return Response.json({ configured: false });
  const hit = cache.get(month);
  if (hit && Date.now() - hit.at < CACHE_MS) return Response.json(hit.body);

  const [rows, settings, veo] = await Promise.all([
    pool.query(`select project_id, credit_total::text as "creditTotal", credit_currency as "creditCurrency", credit_expires_on::text as "creditExpiresOn",
                       stop_when_credits_end as "stopWhenCreditsEnd" from vertex_accounts`),
    pool.query('select vertex_active_project as p from settings where id = 1'),
    pool.query(`select usd_per_second::text as usd from model_configs where id = 'veo-3.1-vertex'`),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const tokens = accounts.map((a) => serviceAccountToken(a.key));
  const results = await Promise.all(
    accounts.map((a, i) =>
      readVertexBilling({ project: a.project, token: tokens[i]! }).catch((e: unknown): { ok: false; reason: 'failed'; error: string } => ({ ok: false, reason: 'failed', error: e instanceof Error ? e.message : String(e) })),
    ),
  );
  const perAccount = accounts.map((a, i) => {
    const r = results[i]!;
    const skus = r.ok ? r.rows.filter((x) => x.month === month) : [];
    const { usable: _, ...credit } = creditState(rows.rows.find((x) => x.project_id === a.project) as CreditRow | undefined, r.ok ? r : undefined, today);
    return {
      projectId: a.project,
      active: settings.rows[0]?.p === a.project,
      ...(!r.ok && { error: { reason: r.reason, message: r.error } }),
      monthUsd: sum(skus.map((x) => x.costUsd)),
      monthCreditsUsd: sum(skus.map((x) => x.creditsUsd)),
      skus,
      credit,
    };
  });
  // Any account's key may read the public Catalog; a failure leaves the Google column empty rather than the page.
  const google = await catalogUsdPrices({ skuIds: PRICE_CHECKS.map((p) => p.sku), token: tokens[0]! }).catch(() => ({}) as Record<string, number>);
  const silent = veo.rows[0]?.usd == null ? null : Number(veo.rows[0].usd);
  const prices = PRICE_CHECKS.map((p) => {
    const appUsd = p.app(silent);
    const googleUsd = google[p.sku] ?? null;
    return { label: p.label, appUsd, googleUsd, red: appUsd !== null && googleUsd !== null && Math.abs(appUsd - googleUsd) > 0.01 * googleUsd };
  });
  const body = { configured: true, month, accounts: perAccount, totalMonthUsd: sum(perAccount.map((a) => a.monthUsd)), prices };
  cache.set(month, { at: Date.now(), body });
  return Response.json(body);
}
