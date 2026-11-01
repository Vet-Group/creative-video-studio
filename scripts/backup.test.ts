import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const root = join(import.meta.dirname, '..');
const fwd = (p: string) => p.replaceAll('\\', '/');
const script = fwd(join(root, 'deploy/linux/cvs-backup'));

const bash =
  process.env.CVS_TEST_BASH ??
  (process.platform === 'win32'
    ? [join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'bin', 'bash.exe')].find(existsSync) ?? 'bash'
    : 'bash');
const hasBash = spawnSync(bash, ['-c', 'exit 0']).status === 0;

// The compose project comes from this worktree's .env (for example creative-video-studio-m); the production name is never used.
const envFile = existsSync(join(root, '.env')) ? readFileSync(join(root, '.env'), 'utf8') : '';
const project = /^COMPOSE_PROJECT_NAME=(\S+)/m.exec(envFile)?.[1] ?? '';
const composeFile = fwd(join(root, 'docker-compose.yml'));
const dc = (args: string[]) =>
  spawnSync('docker', ['compose', '-p', project, '-f', composeFile, ...args], { cwd: root, encoding: 'utf8' });

function stackSkipReason(): string | null {
  if (!hasBash) return 'bash is not available';
  if (!project || project === 'creative-video-studio') return 'worktree .env does not set a non-production COMPOSE_PROJECT_NAME';
  const ps = dc(['ps', '-q', 'minio']);
  if (ps.error || ps.status !== 0) return 'docker is not usable';
  const pg = dc(['ps', '-q', 'postgres']);
  return ps.stdout.trim() && pg.stdout.trim() ? null : `compose project ${project} is not running`;
}

const state = fwd(mkdtempSync(join(tmpdir(), 'cvs-backup-state-')));
const backupDir = fwd(mkdtempSync(join(tmpdir(), 'cvs-backup-repo-')));
const id = `${process.pid}`;
const testDb = `cvs_bk_test_${id}`;
const bucket = `cvs-bk-test-${id}`;
const r2Bucket = `cvs-bk-r2-${id}`;
const cacheVolume = `${project || 'cvs'}_restic-cache-test-${id}`;

const baseEnv = {
  CVS_COMPOSE_PROJECT: project,
  CVS_BACKUP_DIR: backupDir,
  CVS_STATE_DIR: state,
  CVS_DB_NAME: testDb,
  CVS_S3_BUCKET: bucket,
  CVS_RESTIC_PASSWORD: 'test-only-restic-password',
  CVS_RESTIC_CACHE_VOLUME: cacheVolume,
  CVS_ALLOW_NO_FLOCK: '1',
  CVS_R2_REPOSITORY: '',
  CVS_R2_ACCESS_KEY_ID: '',
  CVS_R2_SECRET_ACCESS_KEY: '',
};

function run(args: string[], env: Record<string, string> = {}) {
  const r = spawnSync(bash, [script, ...args], {
    cwd: root,
    env: { ...process.env, ...baseEnv, ...env },
    encoding: 'utf8',
    timeout: 280_000,
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

const sql = (db: string, text: string) => dc(['exec', '-T', 'postgres', 'psql', '-U', 'cvs', '-d', db, '-AtX', '-v', 'ON_ERROR_STOP=1', '-c', text]);
const mc = (cmd: string) => dc(['exec', '-T', 'minio', 'sh', '-c', `export MC_HOST_ih=http://$MINIO_ROOT_USER:$MINIO_ROOT_PASSWORD@127.0.0.1:9000; ${cmd}`]);
const snapshotCount = () => readdirSync(join(backupDir, 'restic', 'snapshots')).length;

afterAll(() => {
  rmSync(state, { recursive: true, force: true });
  rmSync(backupDir, { recursive: true, force: true });
});

// Each case starts the script through Git Bash, which takes seconds on Windows.
describe.skipIf(!hasBash)('cvs-backup (needs bash only)', { timeout: 30_000 }, () => {
  test('bash -n finds no syntax error', () => {
    const r = spawnSync(bash, ['-n', script], { encoding: 'utf8' });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });

  test('--help succeeds and an unknown argument exits 2', () => {
    const help = run(['--help']);
    expect(help.status).toBe(0);
    expect(help.out).toContain('--drill');
    expect(run(['--nope']).status).toBe(2);
  });

  test('the disk check refuses when the threshold is above the free space', () => {
    const r = run([], { CVS_MIN_FREE_PERCENT: '101' });
    expect(r.status).not.toBe(0);
    expect(r.out).toMatch(/failed at disk: only [\d.]+% free/);
  });

  test('the weekly copy refuses with a clear message while R2 is not configured', () => {
    const r = run(['--weekly-copy']);
    expect(r.status).not.toBe(0);
    expect(r.out).toContain('weekly copy needs CVS_R2_REPOSITORY');
  });

  test('the last line is in backup.log when the script exits, even if its process group is killed right then', () => {
    // systemd kills the unit's cgroup when the script exits; a slow tee first on PATH makes the old race certain.
    const own = fwd(mkdtempSync(join(tmpdir(), 'cvs-backup-race-')));
    const sh = [
      'set -m',
      `real=$(command -v tee); printf '#!/bin/bash\\nsleep 0.5\\nexec %s "$@"\\n' "$real" > "${own}/tee"; chmod +x "${own}/tee"`,
      `PATH="${own}:$PATH" CVS_STATE_DIR="${own}/state" bash "${script}" --weekly-copy > /dev/null 2>&1 & p=$!`,
      'wait $p; kill -9 -- -$p 2> /dev/null; sleep 1',
      `cat "${own}/state/backup.log"`,
    ].join('\n');
    const r = spawnSync(bash, ['-c', sh], { env: { ...process.env, ...baseEnv }, encoding: 'utf8' });
    rmSync(own, { recursive: true, force: true });
    expect(r.stdout).toContain('weekly copy needs CVS_R2_REPOSITORY');
  });

  test('a missing restic password is refused and never echoed', () => {
    const r = run([], { CVS_RESTIC_PASSWORD: '', CVS_BACKUP_ENV: '/nonexistent/backup.env' });
    expect(r.status).not.toBe(0);
    expect(r.out).toContain('failed at config');
    // Stop at the disk check: past it, restic runs in Docker and leaves root-owned files on a Linux runner.
    expect(run([], { CVS_MIN_FREE_PERCENT: '101' }).out).not.toContain(baseEnv.CVS_RESTIC_PASSWORD);
  });
});

describe.skipIf(!hasBash)('cvs-backup reads backup.env (needs bash only)', { timeout: 30_000 }, () => {
  test('a run outside systemd takes the password from backup.env, never echoes it, and a set variable wins', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cvs-backup-env-'));
    const file = join(dir, 'backup.env');
    writeFileSync(file, 'CVS_RESTIC_PASSWORD=from-backup-env-6d1f\n', { mode: 0o600 });
    // The password check passes, so the run reaches the disk check, which stops it before Docker.
    const r = run([], { CVS_RESTIC_PASSWORD: '', CVS_BACKUP_ENV: file, CVS_MIN_FREE_PERCENT: '101' });
    expect(r.out).not.toContain('failed at config');
    expect(r.out).toMatch(/failed at disk/);
    expect(r.out).not.toContain('from-backup-env-6d1f');
    expect(run([], { CVS_RESTIC_PASSWORD: '', CVS_BACKUP_ENV: join(dir, 'missing.env') }).out).toContain('failed at config');
    rmSync(dir, { recursive: true, force: true });
  });
});

const skipReason = stackSkipReason();

describe.skipIf(skipReason !== null)(`cvs-backup against compose ${skipReason ? `(skipped: ${skipReason})` : project}`, () => {
  beforeAll(() => {
    expect(dc(['exec', '-T', 'postgres', 'createdb', '-U', 'cvs', testDb]).status).toBe(0);
    expect(
      sql(
        testDb,
        "create table users (id text primary key); create table assets (id text primary key, bytes int); insert into users values ('u1'), ('u2'); insert into assets values ('a1', 10)",
      ).status,
    ).toBe(0);
    expect(mc(`mc mb ih/${bucket} && echo hello | mc pipe ih/${bucket}/a.txt && echo world | mc pipe ih/${bucket}/b.txt`).status).toBe(0);
  }, 120_000);

  afterAll(() => {
    dc(['exec', '-T', 'postgres', 'dropdb', '-U', 'cvs', '--if-exists', '--force', testDb]);
    mc(`mc rb --force ih/${bucket}`);
    mc(`mc rb --force ih/${r2Bucket}`);
    spawnSync('docker', ['volume', 'rm', '-f', cacheVolume]);
  }, 120_000);

  const scratchLeftovers = () => {
    const names = (r: { stdout: string }) => r.stdout.trim();
    return [
      names(spawnSync('docker', ['ps', '-a', '-q', '--filter', `name=^/${project}-drill-minio$`], { encoding: 'utf8' })),
      names(spawnSync('docker', ['volume', 'ls', '-q', '--filter', `name=^${project}_drill-minio$`], { encoding: 'utf8' })),
      names(sql('postgres', `select datname from pg_database where datname = '${testDb}_restore_check'`)),
    ];
  };

  test('1. a backup runs and creates a snapshot', { timeout: 300_000 }, () => {
    const r = run([]);
    expect(r.out).toContain('backup done');
    expect(r.status).toBe(0);
    expect(snapshotCount()).toBe(1);
    expect(r.out).not.toContain(baseEnv.CVS_RESTIC_PASSWORD);
  });

  test('2. the drill passes; jobs and cost_entries are absent on both sides; scratch resources are removed', { timeout: 300_000 }, () => {
    const r = run(['--drill']);
    expect(r.out).toContain('ok   rows public.users 2');
    expect(r.out).toContain('ok   rows public.assets 1');
    expect(r.out).toMatch(new RegExp(`ok   objects ${bucket} 2 \\d+`));
    expect(r.out).toContain('ok   presence jobs absent');
    expect(r.out).toContain('ok   presence cost_entries absent');
    expect(r.out).not.toContain('DIFF');
    expect(r.status).toBe(0);
    expect(scratchLeftovers()).toEqual(['', '', '']);
  });

  test('3. a corrupted count makes the drill fail', { timeout: 300_000 }, () => {
    const r = run(['--drill'], { CVS_DRILL_FAULT_SQL: "insert into users values ('ghost')" });
    expect(r.out).toContain('DIFF rows public.users restored 3, snapshot 2');
    expect(r.status).not.toBe(0);
    expect(scratchLeftovers()).toEqual(['', '', '']);
  });

  test('3b. with jobs and cost_entries present, rows, sum(usd) and presence are compared', { timeout: 600_000 }, () => {
    expect(
      sql(
        testDb,
        "create table jobs (id text primary key); create table cost_entries (id text primary key, usd numeric(12, 6) not null); insert into jobs values ('j1'); insert into cost_entries values ('c1', 1.25), ('c2', 2.5)",
      ).status,
    ).toBe(0);
    expect(run([]).status).toBe(0);
    expect(snapshotCount()).toBe(2);
    const ok = run(['--drill']);
    expect(ok.out).toContain('ok   rows public.cost_entries 2');
    expect(ok.out).toContain('ok   sum public.cost_entries 3.750000');
    expect(ok.out).toContain('ok   presence jobs present');
    expect(ok.status).toBe(0);
    const bad = run(['--drill'], { CVS_DRILL_FAULT_SQL: 'update cost_entries set usd = usd + 1' });
    expect(bad.out).toContain('DIFF sum public.cost_entries restored 5.750000, snapshot 3.750000');
    expect(bad.status).not.toBe(0);
  });

  // Stands in for R2: a restic s3: repository on the compose MinIO, reached by service name over the compose network.
  test('4. the weekly copy lands a snapshot in an S3 repository, hides the secrets and is idempotent', { timeout: 600_000 }, () => {
    const minioEnv = (name: string) => mc(`printf %s "$${name}"`).stdout;
    const secret = minioEnv('MINIO_ROOT_PASSWORD');
    expect(secret).not.toBe('');
    expect(mc(`mc mb ih/${r2Bucket}`).status).toBe(0);
    const r2 = {
      CVS_RESTIC_NETWORK: `${project}_default`,
      CVS_R2_REPOSITORY: `s3:http://minio:9000/${r2Bucket}`,
      CVS_R2_ACCESS_KEY_ID: minioEnv('MINIO_ROOT_USER'),
      CVS_R2_SECRET_ACCESS_KEY: secret,
    };
    const snapshotObjects = () => mc(`mc ls ih/${r2Bucket}/snapshots/`).stdout.split('\n').filter((l) => l.trim()).length;
    for (const pass of [1, 2]) {
      const r = run(['--weekly-copy'], r2);
      expect(r.out, `pass ${pass}`).toContain('weekly copy of snapshot');
      expect(r.status).toBe(0);
      expect(r.out).not.toContain(baseEnv.CVS_RESTIC_PASSWORD);
      expect(r.out).not.toContain(secret);
      expect(snapshotObjects(), `pass ${pass}`).toBe(1);
    }
    // The weekly forget must prune the R2 repo only; the local dailies stay.
    expect(snapshotCount()).toBe(2);
  });
});
