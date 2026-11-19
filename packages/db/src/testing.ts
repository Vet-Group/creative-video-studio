// A disposable database per test file: created next to DATABASE_URL, migrated, dropped afterwards.
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { databaseUrl } from './client';

const STALE_AFTER_MS = 6 * 60 * 60 * 1000;
// cvs_test_<base36 epoch seconds>_<12 hex>. Older names (cvs_test_<12 hex>, no timestamp) never match, so they are never swept.
const TIMED_NAME = /^cvs_test_([0-9a-z]+)_[0-9a-f]{12}$/;

/** The databases among `names` that a run killed before its teardown left behind: timestamped test databases more than 6 hours old. */
export function staleTestDatabases(names: string[], now = Date.now()): string[] {
  return names.filter((n) => {
    const seconds = parseInt(TIMED_NAME.exec(n)?.[1] ?? '', 36);
    return Number.isFinite(seconds) && now - seconds * 1000 > STALE_AFTER_MS;
  });
}

/** A random database name, or `fixedName` (replacing any database of that name left behind) when the caller must know the URL up front.
 * `migrationsFolder` lets a migration test start from the schema before its migration.
 * Once the workspaces exist, every user the test creates joins the company workspace (trigger `test_company_member`), as every company user is in
 * production; a test of a sign-up path, or of a user in another workspace, drops the trigger or the membership. */
export async function createTestDatabase(
  fixedName?: string,
  migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url)),
): Promise<{ url: string; drop: () => Promise<void> }> {
  const base = new URL(databaseUrl());
  const name = fixedName ?? `cvs_test_${Math.floor(Date.now() / 1000).toString(36)}_${randomBytes(6).toString('hex')}`;
  const run = async (q: string) => {
    const c = new pg.Client({ connectionString: base.toString() });
    await c.connect();
    try {
      return (await c.query(q)).rows as pg.QueryResultRow[];
    } finally {
      await c.end();
    }
  };
  const drop = async () => void (await run(`drop database if exists ${name} with (force)`));
  if (fixedName) {
    await drop();
  } else {
    // Other worktrees share this server, so only databases that no live run can still own are dropped; a failed drop must not fail this run.
    const rows = await run(`select datname from pg_database where datname ~ '^cvs_test_'`);
    for (const stale of staleTestDatabases(rows.map((r) => r.datname as string))) await run(`drop database if exists ${stale} with (force)`).catch(() => {});
  }
  await run(`create database ${name}`);
  const url = new URL(base);
  url.pathname = `/${name}`;
  const pool = new pg.Pool({ connectionString: url.toString(), max: 1 });
  try {
    try {
      await migrate(drizzle(pool), { migrationsFolder });
      if ((await pool.query(`select to_regclass('public.workspace_members') is not null as ok`)).rows[0].ok)
        await pool.query(`
          create function test_company_member() returns trigger language plpgsql as $$
          begin
            insert into workspace_members (workspace_id, user_id, role) values ('ws_vet', new.id, case when new.role = 'admin' then 'owner' else 'member' end)
              on conflict do nothing;
            return new;
          end $$;
          create trigger test_company_member after insert on users for each row execute function test_company_member();`);
    } finally {
      await pool.end();
    }
  } catch (e) {
    // The caller never gets a handle to drop, so a database that failed to migrate must not outlive the call.
    await drop().catch(() => {});
    throw e;
  }
  return { url: url.toString(), drop };
}
