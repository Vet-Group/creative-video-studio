// The billing export and Catalog readers against fixtures shaped like the BigQuery and Cloud Billing REST answers. No network, no key.
import { describe, expect, test } from 'vitest';
import { catalogUsdPrices, readVertexBilling } from './vertex-billing';

type Call = { url: string; method: string; body?: any };
function fakeFetch(...answers: [number, unknown][]) {
  const calls: Call[] = [];
  const fn = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, method: init.method ?? 'GET', ...(init.body && { body: JSON.parse(init.body as string) }) });
    const [status, body] = answers.shift() ?? [500, {}];
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fn, calls };
}
const token = async () => 'tok';

const TABLES = { tables: [{ tableReference: { tableId: 'gcp_billing_export_resource_v1_01F104_C9738B_959059' } }, { tableReference: { tableId: 'gcp_billing_export_v1_01F104_C9738B_959059' } }] };
const FIELDS = ['credits_all_time', 'credits_all_time_usd', 'currency', 'rate', 'month', 'sku_id', 'sku', 'usage', 'unit', 'cost', 'cost_usd', 'credits', 'credits_usd'];
const row = (...v: (string | null)[]) => ({ f: v.map((x) => ({ v: x })) });
const answer = (rows: ReturnType<typeof row>[]) => ({ jobComplete: true, schema: { fields: FIELDS.map((name) => ({ name })) }, rows, totalRows: String(rows.length) });

describe('readVertexBilling', () => {
  test('finds the standard export table, queries it within 100 MB and parses months, SKUs, USD costs and credits', async () => {
    const { fn, calls } = fakeFetch(
      [200, TABLES],
      [200, answer([
        row('-200000', '-7.68', 'VND', '26050', '202610', '4D50-275D-FC3F', 'Veo 3.1 Video Generation 720p', '8', 'count', '41680', '1.6', '-41680', '-1.6'),
        row('-200000', '-7.68', 'VND', '26050', '202611', 'F64B-2A78-7BAE', 'Veo 3.1 Video+Audio Generation 720p', '8', 'count', '83360', '3.2', '-83360', '-3.2'),
      ])],
    );
    const out = await readVertexBilling({ project: 'cvs-vertex', token, fetch: fn });
    expect(calls[0]).toEqual({ url: 'https://bigquery.googleapis.com/bigquery/v2/projects/cvs-vertex/datasets/billing_export/tables?maxResults=1000', method: 'GET' });
    expect(calls[1]!.url).toBe('https://bigquery.googleapis.com/bigquery/v2/projects/cvs-vertex/queries');
    expect(calls[1]!.body).toMatchObject({ useLegacySql: false, maximumBytesBilled: '100000000' });
    expect(calls[1]!.body.query).toContain('`cvs-vertex.billing_export.gcp_billing_export_v1_01F104_C9738B_959059`');
    expect(calls[1]!.body.query).toContain("service.description = 'Vertex AI'");
    expect(calls[1]!.body.query).toContain('cost / currency_conversion_rate');
    expect(out).toEqual({
      ok: true, currency: 'VND', rate: 26050, creditsAllTime: -200000, creditsAllTimeUsd: -7.68,
      rows: [
        { month: '2026-10', skuId: '4D50-275D-FC3F', sku: 'Veo 3.1 Video Generation 720p', usage: 8, unit: 'count', cost: 41680, costUsd: 1.6, credits: -41680, creditsUsd: -1.6 },
        { month: '2026-11', skuId: 'F64B-2A78-7BAE', sku: 'Veo 3.1 Video+Audio Generation 720p', usage: 8, unit: 'count', cost: 83360, costUsd: 3.2, credits: -83360, creditsUsd: -3.2 },
      ],
    });
  });

  test('an export with no Vertex rows still answers its credits and rate, and an empty export has no rate', async () => {
    const { fn } = fakeFetch([200, TABLES], [200, answer([row('-1000', '-0.04', 'VND', '25000', null, null, null, null, null, null, null, null, null)])], [200, TABLES], [200, answer([row('0', '0', null, null, null, null, null, null, null, null, null, null, null)])]);
    expect(await readVertexBilling({ project: 'p-1', token, fetch: fn })).toEqual({ ok: true, currency: 'VND', rate: 25000, creditsAllTime: -1000, creditsAllTimeUsd: -0.04, rows: [] });
    expect(await readVertexBilling({ project: 'p-1', token, fetch: fn })).toEqual({ ok: true, currency: null, rate: null, creditsAllTime: 0, creditsAllTimeUsd: 0, rows: [] });
  });

  test('maps a 403 to no_access and a 404 or a dataset without the standard table to no_export, without throwing', async () => {
    expect(await readVertexBilling({ project: 'p-1', token, fetch: fakeFetch([403, { error: { message: 'Access Denied' } }]).fn })).toMatchObject({ ok: false, reason: 'no_access' });
    expect(await readVertexBilling({ project: 'p-1', token, fetch: fakeFetch([200, TABLES], [403, { error: {} }]).fn })).toMatchObject({ ok: false, reason: 'no_access' });
    expect(await readVertexBilling({ project: 'p-1', token, fetch: fakeFetch([404, { error: { message: 'Not found: Dataset' } }]).fn })).toMatchObject({ ok: false, reason: 'no_export' });
    expect(await readVertexBilling({ project: 'p-1', token, fetch: fakeFetch([200, { tables: [TABLES.tables[0]] }]).fn })).toMatchObject({ ok: false, reason: 'no_export' });
    expect(await readVertexBilling({ project: 'p-1', token, fetch: fakeFetch([200, {}]).fn })).toMatchObject({ ok: false, reason: 'no_export' });
  });

  test('throws on another error, an unfinished query, a second page or a project id that is not one', async () => {
    await expect(readVertexBilling({ project: 'p-1', token, fetch: fakeFetch([500, {}]).fn })).rejects.toThrow('HTTP 500');
    await expect(readVertexBilling({ project: 'p-1', token, fetch: fakeFetch([200, TABLES], [200, { jobComplete: false }]).fn })).rejects.toThrow('did not finish');
    await expect(readVertexBilling({ project: 'p-1', token, fetch: fakeFetch([200, TABLES], [200, { ...answer([]), pageToken: 'x' }]).fn })).rejects.toThrow('more rows');
    await expect(readVertexBilling({ project: 'p`; drop', token, fetch: fakeFetch().fn })).rejects.toThrow('not a project id');
  });
});

describe('catalogUsdPrices', () => {
  const sku = (skuId: string, ...rates: [string, number][]) => ({ skuId, pricingInfo: [{ pricingExpression: { tieredRates: rates.map(([units, nanos]) => ({ unitPrice: { currencyCode: 'USD', units, nanos } })) } }] });

  test('pages through the Vertex SKUs in USD until every asked SKU is found, taking the first paid tier', async () => {
    const { fn, calls } = fakeFetch(
      [200, { skus: [sku('OTHER', ['1', 0]), sku('4D50-275D-FC3F', ['0', 200_000_000])], nextPageToken: 'page 2' }],
      [200, { skus: [sku('F64B-2A78-7BAE', ['0', 0], ['0', 400_000_000])], nextPageToken: 'page 3' }],
    );
    expect(await catalogUsdPrices({ skuIds: ['4D50-275D-FC3F', 'F64B-2A78-7BAE'], token, fetch: fn })).toEqual({ '4D50-275D-FC3F': 0.2, 'F64B-2A78-7BAE': 0.4 });
    expect(calls.map((c) => c.url)).toEqual([
      'https://cloudbilling.googleapis.com/v1/services/C7E2-9256-1C43/skus?currencyCode=USD&pageSize=5000',
      'https://cloudbilling.googleapis.com/v1/services/C7E2-9256-1C43/skus?currencyCode=USD&pageSize=5000&pageToken=page%202',
    ]);
  });

  test('leaves out a SKU the catalog does not list, stopping on the last page', async () => {
    const { fn, calls } = fakeFetch([200, { skus: [sku('4D50-275D-FC3F', ['0', 200_000_000])] }]);
    expect(await catalogUsdPrices({ skuIds: ['4D50-275D-FC3F', 'GONE'], token, fetch: fn })).toEqual({ '4D50-275D-FC3F': 0.2 });
    expect(calls).toHaveLength(1);
  });
});
