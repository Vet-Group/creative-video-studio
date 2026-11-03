// Vertex accounts, used in order (docs/ops/vertex-accounts.md): which keys are configured, whether an account's credits still allow it, and the
// providers that send each new job to the active account while a job already sent keeps polling the account that took it.
import { readFileSync } from 'node:fs';
import { ImageReadError } from './http';
import type { VertexBilling } from './vertex-billing';
import type { ServiceAccountKey } from './vertex';

export interface VertexAccount {
  project: string;
  key: ServiceAccountKey;
}

/**
 * Account 1 is GOOGLE_APPLICATION_CREDENTIALS (its project GOOGLE_CLOUD_PROJECT, else the key's project_id); account 2 is the optional
 * GOOGLE_APPLICATION_CREDENTIALS_NEXT, named by its key's project_id. An account is identified by its project.
 */
export function vertexAccounts(env: NodeJS.ProcessEnv, read: (path: string) => string = (p) => readFileSync(p, 'utf8')): VertexAccount[] {
  const accounts: VertexAccount[] = [];
  if (env.GOOGLE_APPLICATION_CREDENTIALS) {
    const key = JSON.parse(read(env.GOOGLE_APPLICATION_CREDENTIALS)) as ServiceAccountKey & { project_id?: string };
    const project = env.GOOGLE_CLOUD_PROJECT || key.project_id;
    if (!project) throw new Error('GOOGLE_CLOUD_PROJECT is not set and the key file has no project_id');
    accounts.push({ project, key });
  }
  // Account 2 is optional: a key that is missing, unreadable or wrong is logged and left out, so it never stops account 1 or the worker.
  if (env.GOOGLE_APPLICATION_CREDENTIALS_NEXT) {
    try {
      const key = JSON.parse(read(env.GOOGLE_APPLICATION_CREDENTIALS_NEXT)) as ServiceAccountKey & { project_id?: string };
      if (!key.project_id) throw new Error('the key file has no project_id');
      if (accounts.some((a) => a.project === key.project_id)) throw new Error(`both Vertex keys name project ${key.project_id}`);
      accounts.push({ project: key.project_id, key });
    } catch (e) {
      console.error('vertex: GOOGLE_APPLICATION_CREDENTIALS_NEXT is left out:', e instanceof Error ? e.message : e);
    }
  }
  return accounts;
}

/** The Admin-entered credits of one account (a vertex_accounts row). */
export interface CreditRow {
  creditTotal: string | null;
  creditCurrency: string;
  creditExpiresOn: string | null;
  stopWhenCreditsEnd: boolean;
}

export interface CreditState {
  total: number | null;
  currency: string;
  /** Credits used so far in `currency`; null when the export could not be read or is in another currency. */
  used: number | null;
  remaining: number | null;
  remainingUsd: number | null;
  expiresOn: string | null;
  stopWhenCreditsEnd: boolean;
  /** The export could not tell how much credit is used. */
  unverified: boolean;
  usable: boolean;
}

/** An account set to stop is no longer used below this many USD of credit, or from the day before its credits expire. */
export const LOW_CREDIT_USD = 15;

const dayBefore = (date: string): string => new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

/**
 * Google has no API for the credit balance, so remaining = the Admin's total - |credits used| from the export, in the total's currency (USD at the
 * latest rate for the threshold). An unreadable export (`billing` undefined or not ok) flags the account unverified; one set to stop is then not
 * usable (fail closed: its card must never be charged), one that is not keeps being used. `today` is a UTC date.
 */
export function creditState(row: CreditRow | undefined, billing: VertexBilling | undefined, today: string): CreditState {
  const currency = row?.creditCurrency ?? 'USD';
  const total = row?.creditTotal == null ? null : Number(row.creditTotal);
  const read = billing?.ok ? billing : undefined;
  const used = !read ? null : currency === 'USD' ? Math.abs(read.creditsAllTimeUsd) : currency === read.currency || read.currency === null ? Math.abs(read.creditsAllTime) : null;
  const remaining = total !== null && used !== null ? total - used : null;
  const remainingUsd = remaining === null ? null : currency === 'USD' ? remaining : read?.rate ? remaining / read.rate : null;
  const expiresOn = row?.creditExpiresOn ?? null;
  const stopWhenCreditsEnd = row?.stopWhenCreditsEnd ?? false;
  const ended = !read || (remainingUsd !== null && remainingUsd < LOW_CREDIT_USD) || (expiresOn !== null && today >= dayBefore(expiresOn));
  return { total, currency, used, remaining, remainingUsd, expiresOn, stopWhenCreditsEnd, unverified: used === null, usable: !(stopWhenCreditsEnd && ended) };
}

/** The first usable account in order, or null when none is. */
export const activeAccount = (accounts: { project: string; state: CreditState }[]): string | null => accounts.find((a) => a.state.usable)?.project ?? null;

interface Pinnable<R, J extends { providerJobId: string }, S> {
  submit(req: R): Promise<{ providerJobId: string }>;
  status(job: J): Promise<S>;
  cancel(job: J): Promise<{ supported: boolean }>;
}

const PIN = /^acct:([^|]+)\|/;

/**
 * One provider over the accounts' providers (in account order): submit goes to `active()` and prefixes the id with `acct:<project>|`; status and
 * cancel go to the account the prefix names. An id without the prefix was sent before accounts existed and belongs to account 1. With no active
 * account a submit fails before any call to Google (ImageReadError, so the worker releases the estimate).
 */
export function pinToAccounts<R, J extends { providerJobId: string }, S>(byProject: [project: string, provider: Pinnable<R, J, S>][], active: () => Promise<string | null>): Pinnable<R, J, S> {
  const route = (job: J): [Pinnable<R, J, S>, J] => {
    const m = PIN.exec(job.providerJobId);
    if (!m) return [byProject[0]![1], job];
    const found = byProject.find(([p]) => p === m[1]);
    if (!found) throw new Error(`the job was sent to Vertex account ${m[1]}, which is no longer configured`);
    return [found[1], { ...job, providerJobId: job.providerJobId.slice(m[0].length) }];
  };
  return {
    async submit(req) {
      const project = await active();
      const found = byProject.find(([p]) => p === project);
      if (!found) throw new ImageReadError(project ? `Vertex account ${project} is not configured on this worker` : 'no Vertex account is usable (credits ended or expiring); see Admin Settings');
      const { providerJobId } = await found[1].submit(req);
      return { providerJobId: `acct:${project}|${providerJobId}` };
    },
    async status(job) {
      const [provider, inner] = route(job);
      return provider.status(inner);
    },
    async cancel(job) {
      const [provider, inner] = route(job);
      return provider.cancel(inner);
    },
  };
}
