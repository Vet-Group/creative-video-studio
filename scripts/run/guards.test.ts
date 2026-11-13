import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { initManifest, writeManifest } from './manifest.ts';
import { scanText } from './scan-logs.ts';

const ROOT = join(import.meta.dirname, '..', '..');
const GATE = join(ROOT, 'deploy', 'linux', 'cvs-run-gate');
const tmp = () => mkdtempSync(join(tmpdir(), 'cvs-guard-'));
const bash = (args: string[], env: Record<string, string> = {}) =>
  spawnSync('bash', args, { encoding: 'utf8', env: { ...process.env, ...env } });
const gate = (cmd: string) => bash([GATE], { SSH_ORIGINAL_COMMAND: cmd, CVS_GATE_DRY_RUN: '1' });

describe('cvs-run-gate (server side)', () => {
  test.each([
    ['id'],
    ['rm -rf /'],
    ['check; id'],
    ['check extra'],
    ['deploy main'],
    ['fetch-inputs cat bucket/../etc/passwd.png'],
    ['fetch-inputs cat bucket/a.png;id'],
    ['fetch-inputs list bucket/$(id)'],
    ['status --force'],
    [''],
  ])('refuses %j', (cmd) => {
    const r = gate(cmd);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('refused');
  });

  test('deploy checks the commit is on main before it checks it out or runs its installer', () => {
    const sha = 'a'.repeat(40);
    const r = gate(`deploy ${sha}`);
    expect(r.status, r.stderr).toBe(0);
    const lines = r.stdout.split('\n');
    expect(r.stdout).toContain('fetch --quiet --no-tags origin');
    const onMain = lines.findIndex((l) => l.includes(`merge-base --is-ancestor ${sha} refs/remotes/origin/main`));
    const checkout = lines.findIndex((l) => l.includes(`checkout --quiet --detach ${sha}`));
    const install = lines.findIndex((l) => l.includes('deploy/linux/install.sh'));
    expect(onMain).toBeGreaterThan(-1);
    expect(onMain).toBeLessThan(checkout);
    expect(checkout).toBeLessThan(install);
  });

  test('why the gate names refs/remotes/origin/main: a tag called origin/main shadows the short name, never the full ref', () => {
    const dir = tmp();
    const git = (...a: string[]) => spawnSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' });
    git('init', '-q', '-b', 'main');
    git('commit', '-q', '--allow-empty', '-m', 'main');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    git('checkout', '-q', '-b', 'evil');
    git('commit', '-q', '--allow-empty', '-m', 'evil');
    const evil = git('rev-parse', 'HEAD').stdout.trim();
    git('tag', 'origin/main', evil);
    expect(git('merge-base', '--is-ancestor', evil, 'origin/main').status).toBe(0); // the trap
    expect(git('merge-base', '--is-ancestor', evil, 'refs/remotes/origin/main').status).toBe(1); // what the gate asks
  });

  test('runs an allowed verb (dry run prints the fixed commands)', () => {
    const r = gate('check');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('DRY-RUN: ss -ltnp');
    expect(r.stdout).not.toMatch(/DRY-RUN: (rm|docker (rm|stop|compose))/);
  });
});

describe('vet.sh (client side)', () => {
  test('refuses an unknown verb and a shell metacharacter before reaching ssh', () => {
    expect(bash([join(ROOT, 'scripts/run/vet.sh'), 'exec', 'id']).status).toBe(2);
    expect(bash([join(ROOT, 'scripts/run/vet.sh'), 'check;id']).status).toBe(2);
    expect(bash([join(ROOT, 'scripts/run/vet.sh'), 'fetch-inputs', 'list', 'a;id']).status).toBe(2);
  });
});

describe('gate key install and removal (dry run on a 3-key authorized_keys copy)', () => {
  const others = ['ssh-ed25519 AAAAone podstudio', 'ssh-ed25519 AAAAtwo ideashub_ro', 'ssh-rsa AAAAthree owner'].join('\n');

  test('uploads the gate through a temp file, never /dev/stdin, with mode 0755', () => {
    const src = readFileSync(join(ROOT, 'scripts/run/install-gate-key.sh'), 'utf8');
    expect(src).not.toContain('/dev/stdin');
    const cmd = src.match(/^GATE_INSTALL='(.*)'$/m)?.[1];
    expect(cmd).toBeDefined();
    const dest = join(tmp(), 'cvs-run-gate').replace(/\\/g, '/');
    const r = spawnSync('bash', ['-c', cmd!.replace('/usr/local/sbin/cvs-run-gate', dest)], { input: '#!/bin/bash\necho gate\n', encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    expect(readFileSync(dest, 'utf8')).toBe('#!/bin/bash\necho gate\n');
    if (process.platform !== 'win32') expect(statSync(dest).mode & 0o777).toBe(0o755);
  });

  test('adds exactly one forced-command line and removes exactly that line', () => {
    const dir = tmp();
    const keys = join(dir, 'authorized_keys');
    const pub = join(dir, 'gate.pub');
    writeFileSync(keys, others); // no trailing newline on purpose
    writeFileSync(pub, 'ssh-ed25519 AAAAgate cvs-run-gate\n');
    const orig = readFileSync(keys, 'utf8');

    expect(bash([join(ROOT, 'scripts/run/install-gate-key.sh'), '--file', keys, '--pubkey', pub]).status).toBe(0);
    const lines = readFileSync(keys, 'utf8').trimEnd().split('\n');
    expect(lines).toHaveLength(4);
    expect(lines.slice(0, 3).join('\n')).toBe(orig);
    expect(lines[3]).toMatch(/^command="\/usr\/local\/sbin\/cvs-run-gate",no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding ssh-ed25519 AAAAgate/);

    expect(bash([join(ROOT, 'scripts/run/remove-gate-key.sh'), '--file', keys, '--pubkey', pub]).status).toBe(0);
    expect(readFileSync(keys, 'utf8').trimEnd()).toBe(orig);
    // A second removal finds no gate line and changes nothing.
    expect(bash([join(ROOT, 'scripts/run/remove-gate-key.sh'), '--file', keys, '--pubkey', pub]).status).not.toBe(0);
    expect(readFileSync(keys, 'utf8').trimEnd()).toBe(orig);
  });
});

describe('provision-vet-env.sh (D.5 owner step)', () => {
  test('--dry-run keeps only the .env.example names, never FAL_ADMIN_KEY, and prints no value', () => {
    const env = join(tmp(), '.env');
    writeFileSync(env, 'FAL_KEY=fal-secret-value\nFAL_ADMIN_KEY=admin-secret-value\nAPP_URL=http://localhost:3400\nNOT_IN_EXAMPLE=x\n');
    const r = bash([join(ROOT, 'scripts/run/provision-vet-env.sh'), '--dry-run'], { CVS_ENV_FILE: env });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/names: .*FAL_KEY /);
    expect(r.stdout).not.toMatch(/FAL_ADMIN_KEY|NOT_IN_EXAMPLE|secret-value|localhost/);
    expect(r.stdout).toContain('dry run: nothing was sent');
  });

  test('an empty value keeps the one on VET, a set value wins, and only names are printed', () => {
    const dir = tmp();
    const [old, built] = [join(dir, 'old.env'), join(dir, 'new.env')];
    writeFileSync(old, 'KEEP_ME=vet-secret\nEMPTY_ON_VET=\nSET_LOCALLY=vet-old\nONLY_ON_VET=x\n');
    writeFileSync(built, 'KEEP_ME=\nEMPTY_ON_VET=\nSET_LOCALLY=local-new\nNEW_EMPTY=\n');
    const r = spawnSync('awk', ['-f', join(ROOT, 'scripts/run/keep-vet-values.awk'), old, built], { encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toBe('KEEP_ME=vet-secret\nEMPTY_ON_VET=\nSET_LOCALLY=local-new\nNEW_EMPTY=\n');
    expect(r.stderr.trim()).toBe('kept from VET: KEEP_ME');
  });

  test('the remote step runs the same awk file', () => {
    expect(readFileSync(join(ROOT, 'scripts/run/provision-vet-env.sh'), 'utf8')).toContain('keep-vet-values.awk');
  });
});

const pwsh = spawnSync('pwsh', ['-NoProfile', '-Command', 'exit 0']).status === 0;

// pwsh cold start on a CI runner can take several seconds per call.
describe.skipIf(!pwsh)('watchdog dry run', { timeout: 30_000 }, () => {
  function runDir(heartbeat: string, lease: object | null) {
    const dir = tmp();
    const m = initManifest({ preflight: { checkedAt: heartbeat, results: [] }, skipped: new Map(), criteria: [] });
    m.heartbeat = heartbeat;
    writeManifest(join(dir, 'manifest.json'), m);
    if (lease) writeFileSync(join(dir, 'conductor.lock'), JSON.stringify(lease));
    mkdirSync(join(dir, 'logs'), { recursive: true });
    return dir;
  }
  const watchdog = (dir: string) =>
    spawnSync('pwsh', ['-NoProfile', '-File', join(ROOT, 'scripts/run/watchdog.ps1'), '-DryRun', '-RunDir', dir], { encoding: 'utf8' }).stdout;
  const stale = new Date(Date.now() - 60 * 60_000).toISOString();

  test('stale heartbeat and a dead PID → relaunch', () => {
    expect(watchdog(runDir(stale, { pid: 999_999, startedAt: stale }))).toContain('WOULD RELAUNCH: leased process gone');
  });

  test('stale heartbeat but a live lease → no relaunch', () => {
    const me = spawnSync('pwsh', ['-NoProfile', '-Command', `(Get-Process -Id ${process.pid}).StartTime.ToUniversalTime().ToString('o')`], { encoding: 'utf8' }).stdout.trim();
    expect(watchdog(runDir(stale, { pid: process.pid, startedAt: me }))).toContain('relaunch=False');
  });

  test('a reused PID → relaunch', () => {
    expect(watchdog(runDir(stale, { pid: process.pid, startedAt: '2001-01-01T00:00:00.000Z' }))).toContain('WOULD RELAUNCH: PID reused');
  });
});

describe('log scan', () => {
  test('flags secrets, env values and ssh to VET outside vet.sh; ignores mentions', () => {
    expect(scanText('a.log', 'token r8_' + 'x'.repeat(32), [])).toEqual(['a.log: Replicate token']);
    expect(scanText('a.log', 'value s3cr3t-value here', ['s3cr3t-value'])).toEqual(['a.log: a value from .env']);
    expect(scanText('conductor.log', '$ ssh vet-linux id', [])).toEqual(['conductor.log: VET access outside vet.sh']);
    expect(scanText('vet-check.log', 'ssh root@auto-System-Product-Name.local check', [])).toEqual([]);
    expect(scanText('conductor.log', 'ssh root@vet-server-new.local id', [])).toEqual(['conductor.log: VET access outside vet.sh']);
    expect(scanText('conductor.log', 'Plan step D.3 checks vet-linux read-only', [])).toEqual([]);
  });
});

