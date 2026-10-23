import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';

const root = join(import.meta.dirname, '..');
const fwd = (p: string) => p.replaceAll('\\', '/');
const installSh = fwd(join(root, 'deploy/linux/install.sh'));
const uninstallSh = fwd(join(root, 'deploy/linux/uninstall.sh'));

const bash =
  process.env.CVS_TEST_BASH ??
  (process.platform === 'win32'
    ? [join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'bin', 'bash.exe')].find(existsSync) ?? 'bash'
    : 'bash');
const hasBash = spawnSync(bash, ['-c', 'exit 0']).status === 0;

// Fake values: none of them may ever appear in a script's output.
const secrets = {
  token: 'cf-fake-token-8f3a1c9d',
  key: 'FAKE-PRIVATE-KEY-BODY-77d2e1',
  r2: 'fake-r2-secret-5b9e03',
  restic: 'fake-restic-pass-31c0aa',
  auth: 'fake-auth-secret-a1b2c3',
};

const dirs: string[] = [];
/** Bash's own view of a path (Git Bash turns C:/x into /c/x), so values handed to the scripts match what they compare. */
const posix = (p: string) => spawnSync(bash, ['-c', 'cd "$1" && pwd', '_', p], { encoding: 'utf8' }).stdout.trim();

// Tiny stand-ins for the commands the scripts call, first on PATH: each logs its argv to $STUB_LOG and answers from STUB_* variables,
// so the read-only preconditions (root, tools, file mode, ...) pass anywhere and the real paths run without Docker, systemd or Cloudflare.
const stubBody = `#!/usr/bin/env bash
n="$(basename "$0")"
printf '%s %s\\n' "$n" "$*" >> "$STUB_LOG"
case "$n" in
  id) if [ "\${1:-}" = -un ]; then echo root; else echo "\${STUB_UID:-0}"; fi ;;
  stat) echo "\${STUB_STAT_MODE:-600}" ;;
  curl)
    case " $* " in *" --config - "*) cat >> "$STUB_LOG.stdin" ;; esac
    case "\${!#}" in
      */dns_records/*) printf '%s' "\${STUB_DNS_CODE:-200}" ;;
      */cfd_tunnel/*) printf '%s' "\${STUB_TUNNEL_CODE:-200}" ;;
    esac ;;
  docker) case " $* " in *" ps -q "*) printf '%s' "\${STUB_PS_Q:-}" ;; esac ;;
  systemctl) case " $* " in *" is-active "*) exit "\${STUB_WEB_ACTIVE:-3}" ;; esac ;;
  git) case " $* " in *" remote get-url "*) printf '%s\\n' "\${STUB_GIT_REMOTE:-}" ;; esac ;;
esac
exit 0
`;
const stubNames = ['id', 'stat', 'curl', 'docker', 'systemctl', 'loginctl', 'git', 'tar', 'xz', 'sha256sum', 'base64', 'mktemp', 'flock', 'cloudflared'];
const defaultRepo = 'git@github.com:anhtahaylove/creative-video-studio.git';

function sandbox(listen = 'LISTEN 0 4096 127.0.0.1:631 0.0.0.0:*\n', dotEnv = '') {
  const dir = fwd(mkdtempSync(join(tmpdir(), 'cvs-deploy-test-')));
  dirs.push(dir);
  for (const d of ['creative-video-studio', 'home', 'stubs']) mkdirSync(join(dir, d));
  const appDir = join(dir, 'creative-video-studio');
  writeFileSync(join(dir, 'listen.txt'), listen);
  writeFileSync(join(dir, 'deploy-key'), `-----BEGIN FAKE KEY-----\n${secrets.key}\n-----END FAKE KEY-----\n`);
  writeFileSync(join(appDir, '.env'), dotEnv);
  for (const n of stubNames) writeFileSync(join(dir, 'stubs', n), stubBody, { mode: 0o755 });
  const app = posix(appDir);
  const home = posix(join(dir, 'home'));
  const env = {
    HOME: home,
    CVS_ROOT_HOME: home,
    XDG_CONFIG_HOME: '',
    CVS_TEST_STUBS: posix(join(dir, 'stubs')),
    STUB_LOG: `${dir}/calls.log`,
    CVS_RETRY_SLEEP: '0',
    CVS_APP_DIR: app,
    CVS_LISTEN_FILE: posix(dir) + '/listen.txt',
    CVS_DEPLOY_KEY: posix(dir) + '/deploy-key',
    CLOUDFLARE_API_TOKEN: secrets.token,
    CVS_RESTIC_PASSWORD: '',
    CVS_R2_REPOSITORY: '',
    CVS_R2_ACCESS_KEY_ID: '',
    CVS_R2_SECRET_ACCESS_KEY: '',
    S3_BUCKET: '',
  };
  const left = () => [...readdirSync(appDir), ...readdirSync(join(dir, 'home'))].filter((f) => f !== '.env');
  const calls = () => (existsSync(`${dir}/calls.log`) ? readFileSync(`${dir}/calls.log`, 'utf8') : '');
  const stdin = () => (existsSync(`${dir}/calls.log.stdin`) ? readFileSync(`${dir}/calls.log.stdin`, 'utf8') : '');
  const stateFile = join(appDir, 'install.state');
  const state = () => (existsSync(stateFile) ? readFileSync(stateFile, 'utf8').split('\n').filter(Boolean) : null);
  return { dir, appDir, app, home, env, left, calls, stdin, stateFile, state };
}

function run(script: string, args: string[], env: Record<string, string>) {
  // PATH is put in front inside bash: Git Bash puts /usr/bin ahead of the inherited PATH, which would hide the stubs.
  const r = spawnSync(bash, ['-c', 'PATH="$CVS_TEST_STUBS:$PATH"; exec "$BASH" "$@"', '_', script, ...args], {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 25_000,
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

const dryRunLines = (out: string) => out.split('\n').filter((l) => l.startsWith('[dry-run]'));

afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

// Each case starts the script through Git Bash, which takes seconds on Windows.
describe.skipIf(!hasBash)('deploy kit (needs bash only)', { timeout: 30_000 }, () => {
  test.each([installSh, uninstallSh])('bash -n finds no syntax error in %s', (script) => {
    const r = spawnSync(bash, ['-n', script], { encoding: 'utf8' });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });

  test.each([installSh, uninstallSh])('%s: --help succeeds and an unknown argument exits 2', (script) => {
    const s = sandbox();
    const help = run(script, ['--help'], s.env);
    expect(help.status).toBe(0);
    expect(help.out).toContain('--dry-run');
    expect(run(script, ['--nope'], s.env).status).toBe(2);
  });

  test('a. install --dry-run prints the expected steps in order and changes nothing', () => {
    const s = sandbox();
    const r = run(installSh, ['--dry-run'], s.env);
    expect(r.status).toBe(0);
    expect(r.out).not.toContain('==>');
    const steps = [
      'ports 3400 5435 9400 9401 are free',
      'git -C ' + s.app + ' init',
      'download https://nodejs.org/dist/v24.22.1/node-v24.22.1-linux-',
      'SHASUMS256.txt',
      'pnpm install --frozen-lockfile',
      'pnpm --filter @cvs/web build',
      'record compose=creative-video-studio',
      'docker compose -p creative-video-studio up -d --wait',
      'pnpm --filter @cvs/db migrate',
      'cloudflare POST /accounts/<account id>/cfd_tunnel',
      'cloudflare POST /zones/<zone id>/dns_records',
      '/.config/systemd/user/cvs-web.service',
      '/.config/systemd/user/cvs-worker.service',
      '/.config/systemd/user/cvs-backup.timer',
      '/.config/systemd/user/cvs-drill.timer',
      '/.config/systemd/user/cvs-tunnel.service',
      'systemctl --user enable --now cvs-web.service cvs-worker.service cvs-backup.timer cvs-drill.timer cvs-tunnel.service',
    ];
    let at = -1;
    for (const step of steps) {
      const next = r.out.indexOf(step, at + 1);
      expect(next, `missing or out of order: ${step}`).toBeGreaterThan(at);
      at = next;
    }
    expect(r.out.match(/^MemoryMax=768M$/gm)).toHaveLength(2);
    expect(r.out.match(/^Restart=on-failure$/gm)).toHaveLength(2);
    expect(readFileSync(join(root, 'deploy/linux/cvs-drill.timer'), 'utf8')).toContain('OnCalendar=*-*-01');
    expect(r.out).toContain('record unit=cvs-drill.timer');
    // Nothing was created or written.
    expect(s.left()).toEqual([]);
  });

  test('a2. the weekly R2 timer is installed only when R2 is configured (settings may come from .env)', () => {
    const without = run(installSh, ['--dry-run'], sandbox().env);
    expect(without.out).not.toContain('cvs-backup-weekly');
    expect(without.out).toContain('weekly off-host copy is skipped');
    const dotEnv = `CVS_R2_REPOSITORY=s3:https://x.r2.cloudflarestorage.com/b\nCVS_R2_ACCESS_KEY_ID=id\nCVS_R2_SECRET_ACCESS_KEY=${secrets.r2}\n`;
    const withR2 = run(installSh, ['--dry-run'], sandbox(undefined, dotEnv).env);
    expect(withR2.status).toBe(0);
    expect(withR2.out).toContain('/.config/systemd/user/cvs-backup-weekly.timer');
    expect(withR2.out).toContain('cvs-drill.timer cvs-backup-weekly.timer');
  });

  test.each([
    ['IPv4 any', 'LISTEN 0 4096 0.0.0.0:5435 0.0.0.0:*\n', '5435'],
    ['loopback', 'LISTEN 0 511 127.0.0.1:9401 0.0.0.0:*\n', '9401'],
    ['IPv6', 'LISTEN 0 511 [::]:3400 [::]:*\n', '3400'],
    ['wildcard', 'LISTEN 0 511 *:9400 *:*\n', '9400'],
  ])('b. a taken port (%s) refuses with a non-zero exit and nothing printed as done', (_name, listing, port) => {
    const s = sandbox(listing);
    const r = run(installSh, ['--dry-run'], s.env);
    expect(r.status).not.toBe(0);
    expect(r.out).toContain(`port(s) ${port} already in use`);
    expect(dryRunLines(r.out)).toEqual([]);
    expect(s.left()).toEqual([]);
  });

  test('b2. a port that merely ends in the same digits does not count as taken', () => {
    const r = run(installSh, ['--dry-run'], sandbox('LISTEN 0 511 127.0.0.1:13400 0.0.0.0:*\nLISTEN 0 511 127.0.0.1:34000 0.0.0.0:*\n').env);
    expect(r.status).toBe(0);
  });

  const fixture = (app: string, extra = '') =>
    [
      'unit=cvs-web.service',
      'unit=cvs-worker.service',
      'unit=cvs-backup.service',
      'unit=cvs-backup.timer',
      'unit=cvs-drill.service',
      'unit=cvs-drill.timer',
      'unit=cvs-tunnel.service',
      'tunnel_id=0123abcd-0123-4abc-8abc-0123456789ab',
      'account_id=aaaabbbbccccddddeeeeffff00001111',
      'zone_id=11112222333344445555666677778888',
      `file=${app}/cloudflared/0123abcd-0123-4abc-8abc-0123456789ab.json`,
      `file=${app}/cloudflared/cvs.yml`,
      'dns_record_id=99990000aaaabbbbccccddddeeeeffff',
      extra,
    ].join('\n') + '\n';

  test('c. uninstall --dry-run touches only cvs-* units, keeps the volumes and deletes by recorded ids', () => {
    const s = sandbox();
    writeFileSync(s.stateFile, fixture(s.app));
    const r = run(uninstallSh, ['--dry-run'], s.env);
    expect(r.status).toBe(0);
    expect(r.out).not.toContain('==>');
    const units = r.out.match(/[\w@.-]+\.(?:service|timer)/g) ?? [];
    expect(units.length).toBeGreaterThan(7);
    expect(units.filter((u) => !u.startsWith('cvs-'))).toEqual([]);
    expect(r.out).toContain('systemctl --user disable --now cvs-web.service');
    expect(r.out).toContain('[dry-run] docker compose -p creative-video-studio down\n');
    expect(r.out).not.toMatch(/(^|\s)(-v|--volumes|volume)(\s|$)/);
    expect(r.out.match(/docker compose -p (\S+)/g)).toEqual(['docker compose -p creative-video-studio']);
    expect(r.out).toContain('cloudflare DELETE /zones/11112222333344445555666677778888/dns_records/99990000aaaabbbbccccddddeeeeffff');
    expect(r.out).toContain('cloudflare DELETE /accounts/aaaabbbbccccddddeeeeffff00001111/cfd_tunnel/0123abcd-0123-4abc-8abc-0123456789ab');
    expect(r.out).toMatch(new RegExp(`rm -f \\S*/cloudflared/\\S+\\.json ${s.app}/cloudflared/cvs\\.yml`));
    expect(existsSync(s.stateFile)).toBe(true);
  });

  test('c2. a state file naming a non-cvs unit, a foreign file or a bad id is refused before any command', () => {
    for (const bad of ['unit=ideashub-web.service', 'unit=cvs-web.service; rm', 'file=/etc/passwd', 'tunnel_id=../../x', 'zone_id=not-hex']) {
      const s = sandbox();
      writeFileSync(s.stateFile, fixture(s.app, bad));
      const r = run(uninstallSh, ['--dry-run'], s.env);
      expect(r.status, bad).not.toBe(0);
      expect(dryRunLines(r.out), bad).toEqual([]);
    }
  });

  test('c3. uninstall without a state file refuses', () => {
    const r = run(uninstallSh, ['--dry-run'], sandbox().env);
    expect(r.status).not.toBe(0);
    expect(r.out).toContain('nothing is recorded');
  });

  test('c4. the scripts never pass -v or --volumes to compose', () => {
    for (const script of [installSh, uninstallSh]) {
      const code = readFileSync(script, 'utf8')
        .split('\n')
        .filter((l) => !l.trimStart().startsWith('#'))
        .join('\n');
      expect(code).not.toMatch(/docker compose[^\n]*(\s-v\b|--volumes|\sdown\s+-)/);
    }
  });

  test('d. no secret value appears in any output', () => {
    const dotEnv = [
      `BETTER_AUTH_SECRET=${secrets.auth}`,
      `CVS_RESTIC_PASSWORD=${secrets.restic}`,
      'CVS_R2_REPOSITORY=s3:https://x.r2.cloudflarestorage.com/b',
      'CVS_R2_ACCESS_KEY_ID=fake-id',
      `CVS_R2_SECRET_ACCESS_KEY=${secrets.r2}`,
      `CLOUDFLARE_API_TOKEN=${secrets.token}`,
    ].join('\n');
    const s = sandbox(undefined, dotEnv);
    writeFileSync(s.stateFile, fixture(s.app));
    for (const [script, env] of [
      [installSh, sandbox(undefined, dotEnv).env], // no state file: a state file with a tunnel would make this an update
      [uninstallSh, { ...s.env, CLOUDFLARE_API_TOKEN: '' }],
      [uninstallSh, s.env],
    ] as const) {
      const r = run(script, ['--dry-run'], env);
      expect(r.status).toBe(0);
      for (const value of Object.values(secrets)) expect(r.out).not.toContain(value);
    }
  });

  test('e. without CLOUDFLARE_API_TOKEN the tunnel and DNS step is skipped', () => {
    const r = run(installSh, ['--dry-run'], { ...sandbox().env, CLOUDFLARE_API_TOKEN: '' });
    expect(r.status).toBe(0);
    expect(r.out).toContain('skipping the tunnel and DNS step');
    expect(r.out).not.toContain('cfd_tunnel');
    expect(r.out).not.toContain('cvs-tunnel');
    expect(r.out).not.toContain('tunnel_id');
    expect(r.out).toContain('systemctl --user enable --now cvs-web.service cvs-worker.service cvs-backup.timer cvs-drill.timer\n');
  });

  const wouldFailLine = (r: { status: number | null; out: string }, reason: string) => {
    expect(r.status, r.out).toBe(1);
    expect(r.out).toContain(`[dry-run] would fail: `);
    expect(r.out).toContain(reason);
    expect(r.out).not.toContain('==>');
  };

  test('f. a dry run checks the read-only preconditions too and says it would fail', () => {
    wouldFailLine(run(installSh, ['--dry-run'], { ...sandbox().env, STUB_UID: '1000' }), 'not root');
    const noKey = sandbox();
    wouldFailLine(run(installSh, ['--dry-run'], { ...noKey.env, CVS_DEPLOY_KEY: `${posix(noKey.dir)}/nope` }), 'deploy key');
    const noEnv = sandbox();
    rmSync(join(noEnv.appDir, '.env'));
    wouldFailLine(run(installSh, ['--dry-run'], noEnv.env), '/.env is missing');
    wouldFailLine(run(installSh, ['--dry-run'], { ...sandbox().env, STUB_STAT_MODE: '644' }), 'must be mode 600');
  });

  test('f3. CVS_APP_DIR must be absolute and end in creative-video-studio, in both scripts', () => {
    for (const script of [installSh, uninstallSh]) {
      for (const bad of ['relative/creative-video-studio', `${posix(sandbox().dir)}/other`, `${sandbox().app}/../creative-video-studio`]) {
        const r = run(script, ['--dry-run'], { ...sandbox().env, CVS_APP_DIR: bad });
        expect(r.status, bad).toBe(1);
        expect(r.out, bad).toContain('CVS_APP_DIR must be an absolute path ending in /creative-video-studio');
      }
    }
  });

  test('f4. a checkout of another repository in the app directory is refused, the configured one is accepted', () => {
    const s = sandbox();
    mkdirSync(join(s.appDir, '.git'));
    wouldFailLine(run(installSh, ['--dry-run'], { ...s.env, STUB_GIT_REMOTE: 'git@github.com:someone/else.git' }), 'origin is not CVS_REPO_URL');
    const ok = run(installSh, ['--dry-run'], { ...s.env, STUB_GIT_REMOTE: defaultRepo });
    expect(ok.status).toBe(0);
    expect(ok.out).toContain('fetch --quiet origin main');
  });

  test('g. a repo URL with a user or password is refused; the SSH form is fine', () => {
    for (const url of ['https://user@github.com/x/y.git', 'https://user:pw@github.com/x/y.git', 'ssh://git@github.com/x/y.git']) {
      const r = run(installSh, ['--dry-run'], { ...sandbox().env, CVS_REPO_URL: url });
      expect(r.status, url).toBe(1);
      expect(r.out, url).toContain('must not carry a user or password');
    }
    expect(run(installSh, ['--dry-run'], { ...sandbox().env, CVS_REPO_URL: defaultRepo }).status).toBe(0);
  });

  test('h. pnpm install, build and migrate run without the Cloudflare, R2 and restic secrets; the lock is the ops lock', () => {
    const r = run(installSh, ['--dry-run'], sandbox().env);
    const secretVars = ['CLOUDFLARE_API_TOKEN', 'CVS_R2_REPOSITORY', 'CVS_R2_ACCESS_KEY_ID', 'CVS_R2_SECRET_ACCESS_KEY', 'CVS_RESTIC_PASSWORD'];
    for (const cmd of ['pnpm install --frozen-lockfile', 'pnpm --filter @cvs/web build', 'pnpm --filter @cvs/db migrate']) {
      const line = dryRunLines(r.out).find((l) => l.includes(cmd));
      expect(line, cmd).toBeDefined();
      for (const v of secretVars) expect(line, `${cmd} ${v}`).toContain(`-u ${v}`);
    }
    expect(r.out).toContain('flock');
    expect(r.out).toContain('/.local/state/creative-video-studio/ops.lock');
  });

  test('i. a re-run with a recorded tunnel keeps it only when it is complete', () => {
    const half = sandbox();
    writeFileSync(half.stateFile, 'compose=creative-video-studio\ntunnel_id=0123abcd-0123-4abc-8abc-0123456789ab\n');
    const bad = run(installSh, ['--dry-run'], { ...half.env, STUB_PS_Q: 'x', STUB_WEB_ACTIVE: '0' });
    expect(bad.status).toBe(1);
    expect(bad.out).toContain('uninstall.sh first');

    const full = sandbox();
    mkdirSync(join(full.appDir, 'cloudflared'));
    for (const f of ['0123abcd-0123-4abc-8abc-0123456789ab.json', 'cvs.yml']) writeFileSync(join(full.appDir, 'cloudflared', f), '');
    writeFileSync(full.stateFile, fixture(full.app));
    const ok = run(installSh, ['--dry-run'], { ...full.env, STUB_PS_Q: 'x', STUB_WEB_ACTIVE: '0' });
    expect(ok.status).toBe(0);
    expect(ok.out).toContain('a complete tunnel is already recorded');
  });

  test('j. an update re-run passes the port check when this install holds the ports, and only then', () => {
    const all = 'LISTEN 0 1 0.0.0.0:3400 0.0.0.0:*\nLISTEN 0 1 0.0.0.0:5435 0.0.0.0:*\nLISTEN 0 1 0.0.0.0:9400 0.0.0.0:*\nLISTEN 0 1 0.0.0.0:9401 0.0.0.0:*\n';
    const own = sandbox(all);
    writeFileSync(own.stateFile, 'compose=creative-video-studio\n');
    const ok = run(installSh, ['--dry-run'], { ...own.env, STUB_PS_Q: 'abc123', STUB_WEB_ACTIVE: '0' });
    expect(ok.status).toBe(0);
    expect(ok.out).toContain('held by this install');
    expect(own.calls()).toContain('docker compose -p creative-video-studio ps -q');
    expect(own.calls()).toContain('systemctl --user is-active --quiet cvs-web.service');

    const stranger = sandbox(all);
    writeFileSync(stranger.stateFile, 'compose=creative-video-studio\n');
    const refused = run(installSh, ['--dry-run'], stranger.env);
    expect(refused.status).toBe(1);
    expect(refused.out).toContain('port(s) 3400 5435 9400 9401 already in use');
    // Without a state file nothing is "ours", even when the stubs claim the project is up.
    const fresh = sandbox(all);
    expect(run(installSh, ['--dry-run'], { ...fresh.env, STUB_PS_Q: 'abc123', STUB_WEB_ACTIVE: '0' }).status).toBe(1);
  });

  test('k. real uninstall: the token goes over stdin only, state lines go as their resources go, compose keeps the volumes', () => {
    const s = sandbox();
    writeFileSync(s.stateFile, fixture(s.app));
    const r = run(uninstallSh, [], s.env);
    expect(r.status).toBe(0);
    expect(r.out).toContain('==> cloudflare DELETE /zones/');
    expect(r.out).not.toContain('dry run');
    for (const value of Object.values(secrets)) {
      expect(r.out).not.toContain(value);
      expect(s.calls()).not.toContain(value);
    }
    expect(s.stdin()).toContain(`Bearer ${secrets.token}`);
    expect(s.calls()).toContain('curl --config - --silent --show-error --max-time 30 --output /dev/null --write-out %{http_code} --request DELETE https://api.cloudflare.com/client/v4/zones/');
    expect(s.calls()).toContain('docker compose -p creative-video-studio down\n');
    expect(s.calls()).not.toMatch(/docker[^\n]*(\s-v\b|--volumes)/);
    expect(s.state()).toBeNull();
  });

  test('k2. a failed tunnel DELETE keeps only what is needed to retry; a re-run where Cloudflare says 404 finishes', () => {
    const s = sandbox();
    writeFileSync(s.stateFile, fixture(s.app));
    const first = run(uninstallSh, [], { ...s.env, STUB_TUNNEL_CODE: '500' });
    expect(first.status).toBe(1);
    expect(first.out).toContain('Cloudflare answered HTTP 500');
    expect(s.calls().match(/cfd_tunnel/g)).toHaveLength(4);
    expect(s.state()).toEqual(['tunnel_id=0123abcd-0123-4abc-8abc-0123456789ab', 'account_id=aaaabbbbccccddddeeeeffff00001111']);
    const again = run(uninstallSh, [], { ...s.env, STUB_TUNNEL_CODE: '404' });
    expect(again.status).toBe(0);
    expect(s.state()).toBeNull();
    // The same for the DNS record: 404 means it is already gone.
    const t = sandbox();
    writeFileSync(t.stateFile, fixture(t.app));
    expect(run(uninstallSh, [], { ...t.env, STUB_DNS_CODE: '404' }).status).toBe(0);
    expect(t.state()).toBeNull();
    // A refused DNS DELETE (403) keeps the DNS lines (and the zone id they need), not the tunnel's.
    const u = sandbox();
    writeFileSync(u.stateFile, fixture(u.app));
    expect(run(uninstallSh, [], { ...u.env, STUB_DNS_CODE: '403' }).status).toBe(1);
    expect(u.state()).toEqual(['zone_id=11112222333344445555666677778888', 'dns_record_id=99990000aaaabbbbccccddddeeeeffff']);
  });

  test('k3. a state with only the compose line runs compose down without -v; another project name is refused', () => {
    const s = sandbox();
    writeFileSync(s.stateFile, 'compose=creative-video-studio\n');
    const r = run(uninstallSh, [], s.env);
    expect(r.status).toBe(0);
    expect(s.calls()).toContain('docker compose -p creative-video-studio down\n');
    expect(s.calls()).not.toMatch(/\s-v\b|--volumes/);
    expect(s.calls()).not.toContain('curl');
    expect(s.state()).toBeNull();

    const other = sandbox();
    writeFileSync(other.stateFile, 'compose=ideas-hub\n');
    const refused = run(uninstallSh, [], other.env);
    expect(refused.status).toBe(1);
    expect(other.calls()).not.toContain('docker');
  });

  test('k4. uninstall --dry-run says it was a dry run', () => {
    const s = sandbox();
    writeFileSync(s.stateFile, fixture(s.app));
    const r = run(uninstallSh, ['--dry-run'], s.env);
    expect(r.status).toBe(0);
    expect(r.out).toContain('dry run: nothing was changed');
    expect(r.out).not.toContain('done:');
    expect(s.calls()).toBe('id -u\n');
  });

  test('the pinned Node satisfies the root engines range and its checksum is verified against SHASUMS256.txt', () => {
    const src = readFileSync(installSh, 'utf8');
    const [major, minor] = /^node_version=(\d+)\.(\d+)\.\d+$/m.exec(src)?.slice(1).map(Number) ?? [];
    const engines = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { engines: { node: string } }).engines.node;
    expect(engines).toBe('^22.12.0 || ^24 || >=26');
    expect(major === 24 || (major === 22 && minor! >= 12) || major! >= 26).toBe(true);
    expect(src).toContain('sha256sum -c -');
    expect(src).toContain('SHASUMS256.txt');
  });
});

// A unit's ExecStart fails with 203/EXEC when the script it names is not executable in the checkout.
test('every deploy/linux script a unit ExecStarts is mode 100755 in git', () => {
  const dir = join(root, 'deploy/linux');
  const scripts = readdirSync(dir)
    .filter((f) => f.endsWith('.service'))
    .flatMap((f) => [...readFileSync(join(dir, f), 'utf8').matchAll(/^ExecStart=(\S+)/gm)].map((m) => /deploy\/linux\/[\w.-]+$/.exec(m[1]!)?.[0]))
    .filter((p): p is string => p !== undefined);
  expect(scripts).toContain('deploy/linux/cvs-backup');
  for (const script of new Set(scripts)) {
    const r = spawnSync('git', ['ls-files', '-s', '--', script], { cwd: root, encoding: 'utf8' });
    expect(r.stdout.split(' ')[0], script).toBe('100755');
  }
});
