// Reads what Google billed a Vertex account, with the account's own service-account token. Docs read 2026-11-03:
//   standard billing export schema (invoice.month, cost, currency, currency_conversion_rate, credits[].amount/type, usage.*_pricing_*):
//   https://cloud.google.com/billing/docs/how-to/export-data-bigquery-tables/standard-usage
//   tables.list: https://cloud.google.com/bigquery/docs/reference/rest/v2/tables/list; jobs.query (maximumBytesBilled, timeoutMs, jobComplete):
//   https://cloud.google.com/bigquery/docs/reference/rest/v2/jobs/query; Cloud Billing Catalog services.skus.list (currencyCode, pageToken):
//   https://cloud.google.com/billing/docs/reference/rest/v1/services.skus/list
import { ProviderHttpError, timeout, type Fetch } from './http';

/** The Vertex AI service in the Cloud Billing Catalog. */
export const VERTEX_SERVICE = 'services/C7E2-9256-1C43';
const BIGQUERY = 'https://bigquery.googleapis.com/bigquery/v2/projects';
const MAX_BYTES = 4 * 1024 * 1024;

/** One SKU of Vertex AI in one invoice month ('YYYY-MM'); costs in the billing currency and in USD, credits negative. */
export interface SkuMonth {
  month: string;
  skuId: string;
  sku: string;
  usage: number;
  unit: string;
  cost: number;
  costUsd: number;
  credits: number;
  creditsUsd: number;
}

export type VertexBilling =
  | {
      ok: true;
      /** The billing currency and its latest rate to USD (null while the export is empty). */
      currency: string | null;
      rate: number | null;
      /** FreeTrial and promotion credits used on every service since the export began, negative, in the billing currency and in USD. */
      creditsAllTime: number;
      creditsAllTimeUsd: number;
      rows: SkuMonth[];
    }
  | { ok: false; reason: 'no_access' | 'no_export'; error: string };

/** A Google API call with a bounded wait and a bounded answer; a non-2xx is a ProviderHttpError. */
async function googleJson(f: Fetch, what: string, url: string, token: () => Promise<string>, body?: unknown): Promise<any> {
  const res = await f(url, {
    method: body === undefined ? 'GET' : 'POST',
    signal: timeout(),
    headers: { Authorization: `Bearer ${await token()}`, ...(body !== undefined && { 'Content-Type': 'application/json' }) },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  const reader = res.body?.getReader();
  if (!reader) throw new Error(`${what} returned an empty response`);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw new Error(`${what} response exceeds ${MAX_BYTES} bytes`);
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!res.ok) throw new ProviderHttpError(res.status, text, `${what}: HTTP ${res.status} ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

/** The query over the standard export: Vertex AI per invoice month and SKU, and the account's credits used and latest rate (one row even when Vertex has none). */
const billingSql = (table: string) => `
with t as (
  select ifnull(sum((select sum(c.amount) from unnest(credits) c where c.type in ('FREE_TRIAL', 'PROMOTION'))), 0) as credits_all_time,
         ifnull(sum((select sum(c.amount) from unnest(credits) c where c.type in ('FREE_TRIAL', 'PROMOTION')) / currency_conversion_rate), 0) as credits_all_time_usd,
         array_agg(struct(currency, currency_conversion_rate as rate) order by export_time desc limit 1)[safe_offset(0)] as latest
    from \`${table}\`
), v as (
  select invoice.month as month, sku.id as sku_id, sku.description as sku, sum(usage.amount_in_pricing_units) as usage, any_value(usage.pricing_unit) as unit,
         sum(cost) as cost, sum(cost / currency_conversion_rate) as cost_usd,
         sum(ifnull((select sum(c.amount) from unnest(credits) c), 0)) as credits,
         sum(ifnull((select sum(c.amount) from unnest(credits) c), 0) / currency_conversion_rate) as credits_usd
    from \`${table}\` where service.description = 'Vertex AI' group by month, sku_id, sku
)
select t.credits_all_time, t.credits_all_time_usd, t.latest.currency as currency, t.latest.rate as rate, v.* from t left join v on true order by v.month, v.sku_id`;

/**
 * The account's Vertex AI costs from its project's standard billing export (dataset `billing_export`, the table named gcp_billing_export_v1_*).
 * A 403 (the key lacks BigQuery Data Viewer or Job User) or a 404 (no dataset or table yet) is a result, not a throw; anything else throws.
 */
export async function readVertexBilling(o: { project: string; token: () => Promise<string>; fetch?: Fetch }): Promise<VertexBilling> {
  const f = o.fetch ?? fetch;
  if (!/^[a-z][a-z0-9-]*$/.test(o.project)) throw new Error(`not a project id: ${o.project}`);
  try {
    const list = await googleJson(f, 'bigquery tables', `${BIGQUERY}/${o.project}/datasets/billing_export/tables?maxResults=1000`, o.token);
    const tableId = (list.tables as { tableReference?: { tableId?: string } }[] | undefined)
      ?.map((t) => t.tableReference?.tableId ?? '')
      .find((id) => /^gcp_billing_export_v1_[A-Za-z0-9_]+$/.test(id));
    if (!tableId) return { ok: false, reason: 'no_export', error: `no gcp_billing_export_v1_ table in ${o.project}.billing_export` };
    const answer = await googleJson(f, 'bigquery query', `${BIGQUERY}/${o.project}/queries`, o.token, {
      query: billingSql(`${o.project}.billing_export.${tableId}`),
      useLegacySql: false,
      maximumBytesBilled: String(100 * 1000 * 1000),
      timeoutMs: 20_000,
      maxResults: 5_000,
    });
    if (answer.jobComplete !== true) throw new Error('bigquery query: the billing query did not finish in 20 s');
    if (answer.pageToken) throw new Error('bigquery query: more rows than one page');
    const names = ((answer.schema?.fields ?? []) as { name: string }[]).map((x) => x.name);
    const rows = ((answer.rows ?? []) as { f: { v: unknown }[] }[]).map((r) => Object.fromEntries(names.map((n, i) => [n, r.f[i]?.v ?? null])) as Record<string, any>);
    const first = rows[0] ?? {};
    return {
      ok: true,
      currency: first.currency ?? null,
      rate: first.rate == null ? null : Number(first.rate),
      creditsAllTime: num(first.credits_all_time),
      creditsAllTimeUsd: num(first.credits_all_time_usd),
      rows: rows
        .filter((r) => r.month !== null)
        .map((r) => ({
          month: `${String(r.month).slice(0, 4)}-${String(r.month).slice(4, 6)}`,
          skuId: r.sku_id, sku: r.sku, usage: num(r.usage), unit: r.unit ?? '',
          cost: num(r.cost), costUsd: num(r.cost_usd), credits: num(r.credits), creditsUsd: num(r.credits_usd),
        })),
    };
  } catch (e) {
    if (e instanceof ProviderHttpError && (e.status === 403 || e.status === 404)) return { ok: false, reason: e.status === 403 ? 'no_access' : 'no_export', error: e.message };
    throw e;
  }
}

interface CatalogSku {
  skuId: string;
  pricingInfo?: { pricingExpression?: { tieredRates?: { unitPrice?: { units?: string; nanos?: number } }[] } }[];
}

/** The USD unit price of each asked-for Vertex SKU from the Cloud Billing Catalog (its current price, the first paid tier); SKUs it does not list are left out. */
export async function catalogUsdPrices(o: { skuIds: string[]; token: () => Promise<string>; fetch?: Fetch }): Promise<Record<string, number>> {
  const f = o.fetch ?? fetch;
  const want = new Set(o.skuIds);
  const out: Record<string, number> = {};
  let pageToken = '';
  // The Vertex catalog has ~10k SKUs: pages of 1000 stay under the 4 MiB response bound (a page of 5000 exceeded it on 2026-11-03), and the page bound stops a server that keeps answering with a page token.
  for (let page = 0; page < 20 && Object.keys(out).length < want.size; page++) {
    const url = `https://cloudbilling.googleapis.com/v1/${VERTEX_SERVICE}/skus?currencyCode=USD&pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const data = await googleJson(f, 'billing catalog', url, o.token);
    for (const sku of (data.skus ?? []) as CatalogSku[]) {
      if (!want.has(sku.skuId)) continue;
      const rate = sku.pricingInfo?.at(-1)?.pricingExpression?.tieredRates?.map((r) => num(r.unitPrice?.units) + num(r.unitPrice?.nanos) / 1e9).find((p) => p > 0);
      if (rate !== undefined) out[sku.skuId] = rate;
    }
    pageToken = data.nextPageToken ?? '';
    if (!pageToken) break;
  }
  return out;
}
