// Billing teams (docs/BILLING.md, owner decisions 2026-11-20): a member of a billing team runs company jobs only for that team's stores, and each
// ledger row of a month is billed to a team, a partner workspace or the company. Money stays numeric text, summed in whole 1/10000 USD as BigInt.
import { audit } from '@cvs/core/audit';
import { larkApp, larkFileSender, larkRecipients, larkSender, sendEach } from '@cvs/core/lark';
import { type Queryable, withTransaction } from '@cvs/core/ledger';
import type { Fetch } from '@cvs/core/providers/http';
import { COMPANY_WORKSPACE_ID } from '@cvs/db';
import { pool } from '@/lib/auth';
import { csvResponse, text } from '@/lib/csv';
import { forecastUsd } from '@/lib/forecast';

/** The `code` of the API's refusal of another team's store; lib/api.ts errorText shows it to the member in Vietnamese. */
export const STORE_TEAM_CODE = 'store_not_in_team';

/**
 * SQL that is true when the store under alias `s` may take a job of the user in parameter `user`: always, unless the user is in a billing team
 * (Admins too) and it is a company store of another team or of none. A partner workspace's store has no team, and its jobs are the partner's.
 */
export const storeAllowed = (s: string, user: string) =>
  `not exists (select 1 from users bu join teams bt on bt.id = bu.team_id
                where bu.id = ${user} and bt.billable and ${s}.workspace_id = '${COMPANY_WORKSPACE_ID}' and ${s}.team_id is distinct from bu.team_id)`;

/** The first month billed to teams and partners: every row of an earlier month is company cost. */
export const BILLING_START_MONTH = '2026-11';

/** Why a row is company cost, with the words the Admin reads, in the order the attribution tests them. */
export const COMPANY_REASONS: Record<string, string> = {
  before_start: 'Trước tháng tính phí (11/2026)',
  shared: 'Chi phí chung',
  system: 'Tài khoản hệ thống',
  non_billing: 'Nhóm không tính phí',
};

/**
 * The attribution, the one SQL source of truth every billing reader uses (docs/BILLING.md): each ledger row of the month in `month` (an SQL
 * expression) with its bucket, `team:<id>`, `partner:<workspaceId>` or `company:<reason>`. It reads today's users, teams and stores, so an open month
 * follows today's mapping; a closed month is read from its snapshot instead (billing_month_closes).
 */
export const billedRows = (month: string) => `
  select ce.id, ce.kind, ce.usd, ce.model, ce.user_id, ce.store_id, ce.job_id,
         case
           when ce.month < '${BILLING_START_MONTH}' then 'company:before_start'
           when ce.workspace_id <> '${COMPANY_WORKSPACE_ID}' then 'partner:' || ce.workspace_id
           when ce.user_id is null then 'company:shared'
           when bu.system then 'company:system'
           when not but.billable then 'company:non_billing'
           when bst.billable then 'team:' || bst.id
           else 'team:' || but.id
         end as bucket
    from cost_entries ce
    left join users bu on bu.id = ce.user_id
    left join teams but on but.id = bu.team_id
    left join stores bs on bs.id = ce.store_id
    left join teams bst on bst.id = bs.team_id
   where ce.month = ${month}`;

/** The ICT month now, as SQL. */
const THIS_MONTH = `to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM')`;

/** One sum behind a bucket: its rows per user, store, kind and model. */
export interface BillingLine {
  bucket: string;
  userId: string | null;
  userName: string | null;
  storeId: string | null;
  storeName: string | null;
  kind: string;
  model: string | null;
  usd: string;
}
export interface BillingTeam {
  bucket: string;
  id: string;
  name: string;
  totalUsd: string;
  freeUsd: string;
  /** The part of the allowance used: the total up to the allowance. */
  usedUsd: string;
  /** What the team pays: max(0, total − free). */
  payableUsd: string;
  members: string[];
  stores: string[];
}
export interface BillingPartner {
  bucket: string;
  id: string;
  name: string;
  totalUsd: string;
  freeUsd: string;
  payableUsd: string;
}
export interface CompanyReason {
  bucket: string;
  id: string;
  name: string;
  totalUsd: string;
  freeUsd: string;
  payableUsd: string;
}
export interface BillingTotals {
  ledgerUsd: string;
  teamsUsd: string;
  partnersUsd: string;
  companyUsd: string;
  payableUsd: string;
  /** Teams + partners + company equal the ledger's month, compared unrounded. */
  reconciled: boolean;
}
export interface BillingMonth {
  month: string;
  /** The largest ledger id the figures include. */
  asOf: number;
  /** A job of the month has no closing row yet (an open month only). */
  provisional: boolean;
  /** Set once accounting has closed the month: its figures are the snapshot. */
  closed: { at: string; by: string | null } | null;
  /** A past month that is not closed yet. */
  canClose: boolean;
  /** This month at its pace so far (lib/forecast.ts), the ledger's and each billing team's by team id; null for any other month. An estimate, never billed. */
  forecast: { ledgerUsd: string; teams: Record<string, string> } | null;
  teams: BillingTeam[];
  partners: BillingPartner[];
  company: { totalUsd: string; reasons: CompanyReason[] };
  totals: BillingTotals;
  lines: BillingLine[];
}

const units = (usd: string): bigint => {
  const [whole = '0', fraction = ''] = usd.replace('-', '').split('.');
  const n = BigInt(whole) * 10_000n + BigInt(fraction.padEnd(4, '0').slice(0, 4));
  return usd.startsWith('-') ? -n : n;
};
const fmt = (n: bigint): string => {
  const a = n < 0n ? -n : n;
  return `${n < 0n ? '-' : ''}${a / 10_000n}.${String(a % 10_000n).padStart(4, '0')}`;
};
const sum = (xs: bigint[]) => xs.reduce((t, x) => t + x, 0n);
const max0 = (n: bigint) => (n > 0n ? n : 0n);

/**
 * The month's figures from the live ledger and today's mapping, up to the ledger id it reads first. Run it inside a transaction that set its
 * isolation first (REPEATABLE READ), so every query reads one set of rows.
 */
async function liveMonth(db: Queryable, month: string): Promise<Omit<BillingMonth, 'closed' | 'canClose' | 'forecast'>> {
  const asOf = (await db.query('select coalesce(max(id), 0)::int as n from cost_entries')).rows[0].n as number;
  const rows = (
    await db.query(
      `select b.bucket, b.user_id as "userId", u.name as "userName", b.store_id as "storeId", s.name as "storeName", b.kind, b.model,
              sum(b.usd)::numeric(14, 4)::text as usd, coalesce(bool_or(not jc.is_final), false) as provisional
         from (${billedRows('$1')}) b
         left join users u on u.id = b.user_id
         left join stores s on s.id = b.store_id
         left join job_costs jc on jc.job_id = b.job_id
        where b.id <= $2
        group by b.bucket, b.user_id, u.name, b.store_id, s.name, b.kind, b.model
        order by b.bucket, u.name nulls first, s.name nulls first, b.kind, b.model nulls first`,
      [month, asOf],
    )
  ).rows as (BillingLine & { provisional: boolean })[];
  const ledger = (await db.query('select coalesce(sum(usd), 0)::numeric(14, 4)::text as usd from cost_entries where month = $1 and id <= $2', [month, asOf])).rows[0].usd as string;
  const teams = (
    await db.query(
      `select t.id, t.name, t.free_monthly_usd::text as free,
              array(select u.name from users u where u.team_id = t.id order by u.name) as members,
              array(select s.name from stores s where s.team_id = t.id and s.workspace_id = $1 order by s.name) as stores
         from teams t where t.billable order by t.name, t.id`,
      [COMPANY_WORKSPACE_ID],
    )
  ).rows as { id: string; name: string; free: string; members: string[]; stores: string[] }[];
  const partners = (await db.query('select id, name from workspaces where id <> $1 order by name, id', [COMPANY_WORKSPACE_ID])).rows as { id: string; name: string }[];

  const byBucket = new Map<string, bigint>();
  for (const r of rows) byBucket.set(r.bucket, (byBucket.get(r.bucket) ?? 0n) + units(r.usd));
  const of = (bucket: string) => byBucket.get(bucket) ?? 0n;
  const team = teams.map((t) => {
    const total = of(`team:${t.id}`);
    const free = units(t.free);
    const used = total < free ? max0(total) : free;
    return { bucket: `team:${t.id}`, id: t.id, name: t.name, total, free, used, payable: max0(total - free), members: t.members, stores: t.stores };
  });
  const partner = partners.map((p) => ({ bucket: `partner:${p.id}`, id: p.id, name: p.name, total: of(`partner:${p.id}`) }));
  const reasons = Object.entries(COMPANY_REASONS).map(([id, name]) => ({ bucket: `company:${id}`, id, name, total: of(`company:${id}`) }));
  const [teamsUsd, partnersUsd, companyUsd] = [sum(team.map((t) => t.total)), sum(partner.map((p) => p.total)), sum(reasons.map((r) => r.total))];
  return {
    month,
    asOf,
    provisional: rows.some((r) => r.provisional),
    teams: team.map((t) => ({ bucket: t.bucket, id: t.id, name: t.name, totalUsd: fmt(t.total), freeUsd: fmt(t.free), usedUsd: fmt(t.used), payableUsd: fmt(t.payable), members: t.members, stores: t.stores })),
    // A partner pays all of its costs: its payable is its total.
    partners: partner.map((p) => ({ bucket: p.bucket, id: p.id, name: p.name, totalUsd: fmt(p.total), freeUsd: fmt(0n), payableUsd: fmt(p.total) })),
    company: { totalUsd: fmt(companyUsd), reasons: reasons.map((r) => ({ bucket: r.bucket, id: r.id, name: r.name, totalUsd: fmt(r.total), freeUsd: fmt(0n), payableUsd: fmt(0n) })) },
    totals: {
      ledgerUsd: ledger,
      teamsUsd: fmt(teamsUsd),
      partnersUsd: fmt(partnersUsd),
      companyUsd: fmt(companyUsd),
      payableUsd: fmt(sum(team.map((t) => t.payable)) + partnersUsd),
      reconciled: teamsUsd + partnersUsd + companyUsd === units(ledger),
    },
    lines: rows.map(({ provisional: _, ...l }) => l),
  };
}

interface CloseRow {
  month: string;
  as_of: string;
  buckets: (BillingTeam | BillingPartner | CompanyReason)[];
  lines: BillingLine[];
  totals: BillingTotals;
  closed_at: Date;
  closed_by: string | null;
}

/** A closed month from its snapshot. */
function fromClose(c: CloseRow): BillingMonth {
  const kind = (k: string) => c.buckets.filter((b) => b.bucket.startsWith(`${k}:`));
  return {
    month: c.month,
    asOf: Number(c.as_of),
    provisional: false,
    closed: { at: c.closed_at.toISOString(), by: c.closed_by },
    canClose: false,
    forecast: null,
    teams: kind('team') as BillingTeam[],
    partners: kind('partner') as BillingPartner[],
    company: { totalUsd: c.totals.companyUsd, reasons: kind('company') as CompanyReason[] },
    totals: c.totals,
    lines: c.lines,
  };
}

/** The billing figures of `month` (null: this ICT month): its snapshot once closed, else the live ledger with today's teams and stores. */
export async function billingMonth(requested: string | null): Promise<BillingMonth> {
  return withTransaction(pool, async (tx) => {
    await tx.query('set transaction isolation level repeatable read read only');
    const { m: now, t } = (await tx.query(`select ${THIS_MONTH} as m, now() as t`)).rows[0] as { m: string; t: Date };
    const month = requested ?? now;
    const closed = (
      await tx.query(`select c.month, c.as_of, c.buckets, c.lines, c.totals, c.closed_at, u.name as closed_by from billing_month_closes c left join users u on u.id = c.closed_by where c.month = $1`, [month])
    ).rows[0] as CloseRow | undefined;
    if (closed) return fromClose(closed);
    const live = await liveMonth(tx, month);
    const forecast = month === now ? { ledgerUsd: forecastUsd(live.totals.ledgerUsd, month, t), teams: Object.fromEntries(live.teams.map((x) => [x.id, forecastUsd(x.totalUsd, month, t)])) } : null;
    return { ...live, closed: null, canClose: month < now, forecast };
  });
}

/** Freezes a past month's figures (audited `billing.close`). `open` for this month or a later one, `closed` when it already is. */
export async function closeMonth(month: string, actorId: string): Promise<'ok' | 'open' | 'closed'> {
  return withTransaction(pool, async (tx) => {
    await tx.query('set transaction isolation level repeatable read');
    if (!((await tx.query(`select $1 < ${THIS_MONTH} as past`, [month])).rows[0].past as boolean)) return 'open';
    const m = await liveMonth(tx, month);
    const buckets = [...m.teams, ...m.partners, ...m.company.reasons];
    const { rowCount } = await tx.query(
      `insert into billing_month_closes (month, as_of, buckets, lines, totals, closed_by) values ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6) on conflict (month) do nothing`,
      [month, m.asOf, JSON.stringify(buckets), JSON.stringify(m.lines), JSON.stringify(m.totals), actorId],
    );
    if (!rowCount) return 'closed';
    await audit(tx, { actorId, action: 'billing.close', target: `billing:${month}`, newValue: { asOf: m.asOf, totals: m.totals } });
    return 'ok';
  });
}

/** Reopens a closed month (audited `billing.reopen`): its figures are live again. False when it was not closed. */
export async function reopenMonth(month: string, actorId: string): Promise<boolean> {
  return withTransaction(pool, async (tx) => {
    const old = (await tx.query('delete from billing_month_closes where month = $1 returning as_of, totals, closed_at', [month])).rows[0];
    if (!old) return false;
    await audit(tx, { actorId, action: 'billing.reopen', target: `billing:${month}`, oldValue: { asOf: Number(old.as_of), totals: old.totals, closedAt: old.closed_at }, newValue: null });
    return true;
  });
}

/**
 * This ICT month for the user's team when it is a billing team (null otherwise): its name, its month total so far by the attribution, its free
 * allowance, what is billed past it, its forecast for the month's end (lib/forecast.ts), and whether a job of it is still unsettled. The team's figure only, never another team's.
 */
export async function teamMonth(
  db: Queryable,
  userId: string,
): Promise<{ name: string; monthUsd: string; freeUsd: string; payableUsd: string; forecastUsd: string; provisional: boolean } | null> {
  const { rows } = await db.query(
    `select t.name, coalesce(x.usd, 0)::numeric(14, 4)::text as "monthUsd", t.free_monthly_usd::text as "freeUsd",
            greatest(coalesce(x.usd, 0) - t.free_monthly_usd, 0)::numeric(14, 4)::text as "payableUsd", coalesce(x.provisional, false) as provisional,
            ${THIS_MONTH} as month, now() as now
       from users u join teams t on t.id = u.team_id
       left join lateral (
         select sum(b.usd) as usd, bool_or(not jc.is_final) as provisional
           from (${billedRows(THIS_MONTH)}) b left join job_costs jc on jc.job_id = b.job_id
          where b.bucket = 'team:' || t.id
       ) x on true
      where u.id = $1 and t.billable`,
    [userId],
  );
  if (!rows[0]) return null;
  const { month, now, ...team } = rows[0] as { month: string; now: Date; name: string; monthUsd: string; freeUsd: string; payableUsd: string; provisional: boolean };
  return { ...team, forecastUsd: forecastUsd(team.monthUsd, month, now) };
}

/** The bucket's name for the CSV: its team's or partner's name, or the company reason's words. */
function bucketName(m: BillingMonth, bucket: string): string {
  return [...m.teams, ...m.partners, ...m.company.reasons].find((b) => b.bucket === bucket)?.name ?? bucket;
}

/**
 * The month's billing as CSV for accounting: one line per (bucket, user, store, kind), or with `summary` one line per team, partner and company reason
 * (total, free allowance, payable) and the ledger's total. Amounts are exact 4-decimal USD; the label line says whether the month is closed.
 */
export async function billingCsv(requested: string | null, summary: boolean): Promise<Response> {
  const m = await billingMonth(requested);
  const label = `Creative Video Studio billing ${m.month} as_of ${m.asOf} ${m.closed ? `closed ${m.closed.at.slice(0, 10)}` : 'open'}`;
  if (summary) {
    const rows = [...m.teams, ...m.partners, ...m.company.reasons].map((b) => [m.month, b.bucket, text(b.name), b.totalUsd, b.freeUsd, b.payableUsd]);
    return csvResponse(label, `cvs-billing-summary-${m.month}.csv`, ['month', 'bucket', 'name', 'total USD', 'free USD', 'payable USD'], [
      ...rows,
      [m.month, 'ledger', 'Tổng sổ cái', m.totals.ledgerUsd, null, m.totals.payableUsd],
    ]);
  }
  const sums = new Map<string, { line: BillingLine; usd: bigint }>();
  for (const l of m.lines) {
    const key = [l.bucket, l.userId, l.storeId, l.kind].join('\t');
    const s = sums.get(key) ?? sums.set(key, { line: l, usd: 0n }).get(key)!;
    s.usd += units(l.usd);
  }
  return csvResponse(
    label,
    `cvs-billing-${m.month}.csv`,
    ['month', 'bucket', 'team or partner', 'user', 'store', 'kind', 'USD'],
    [...sums.values()].map(({ line: l, usd }) => [m.month, l.bucket, text(bucketName(m, l.bucket)), text(l.userName), text(l.storeName), l.kind, fmt(usd)]),
  );
}

/** What the close mail reached: how many people got both messages and why the others did not, or `off` without the Lark app or recipients. */
export type CloseMail = { sent: number; failed: string[] } | 'off';

const dollars = (usd: string) => `$${Number(usd).toFixed(2)}`;

/** The short text of the close mail, for accounting to read before the CSV. */
function closeSummary(m: BillingMonth): string {
  const teamsPayable = fmt(sum(m.teams.map((t) => units(t.payableUsd))));
  return [
    `Creative Video Studio: đã chốt chi phí tháng ${m.month}.`,
    `Tổng sổ cái: ${dollars(m.totals.ledgerUsd)}`,
    `Team phải trả: ${dollars(teamsPayable)}`,
    `Đối tác phải trả: ${dollars(m.totals.partnersUsd)}`,
    `Phần của công ty: ${dollars(m.totals.companyUsd)}`,
    'Chi tiết trong tệp CSV gửi kèm.',
  ].join('\n');
}

/**
 * After a close has committed: sends the people in FAL_ALERT_LARK_TO, from the CVS Lark bot, the summary and the month's CSV (the same content as
 * `billingCsv`), and audits the outcome (`billing.send`). Best effort: nothing here throws, so the close stays whatever Lark does.
 */
export async function mailClose(month: string, actorId: string, env: NodeJS.ProcessEnv = process.env, f: Fetch = fetch): Promise<CloseMail> {
  const app = larkApp(env);
  const to = larkRecipients(env);
  let outcome: CloseMail = 'off';
  if (app && to.length > 0) {
    try {
      const summary = closeSummary(await billingMonth(month));
      const csv = `﻿${await (await billingCsv(month, false)).text()}`; // text() drops the route's BOM, which Excel needs to read UTF-8
      const [sendText, sendFile] = [larkSender(app, f), larkFileSender(app, f)];
      outcome = await sendEach(to, async (r) => {
        await sendText(r, summary);
        await sendFile(r, `cvs-chi-phi-${month}.csv`, csv);
      });
    } catch (e) {
      outcome = { sent: 0, failed: [e instanceof Error ? e.message : String(e)] };
    }
  }
  await audit(pool, { actorId, action: 'billing.send', target: `billing:${month}`, newValue: outcome }).catch((e) => console.error('billing: close mail audit:', e instanceof Error ? e.message : e));
  return outcome;
}
