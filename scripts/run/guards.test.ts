import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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

const pwsh = spawnSync('pwsh', ['-NoProfile', '-Command', 'exit 0']).status === 0;

describe.skipIf(!pwsh)('watchdog dry run', () => {
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
    expect(scanText('conductor.log', 'Plan step D.3 checks vet-linux read-only', [])).toEqual([]);
  });
});

