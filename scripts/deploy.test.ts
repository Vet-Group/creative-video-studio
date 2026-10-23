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

function sandbox(listen = 'LISTEN 0 4096 127.0.0.1:631 0.0.0.0:*\n', dotEnv?: string) {
  const dir = fwd(mkdtempSync(join(tmpdir(), 'cvs-deploy-test-')));
  dirs.push(dir);
  for (const d of ['app', 'home']) mkdirSync(join(dir, d));
  writeFileSync(join(dir, 'listen.txt'), listen);
  writeFileSync(join(dir, 'deploy-key'), `-----BEGIN FAKE KEY-----\n${secrets.key}\n-----END FAKE KEY-----\n`);
  if (dotEnv !== undefined) writeFileSync(join(dir, 'app', '.env'), dotEnv);
  const app = posix(join(dir, 'app'));
  const home = posix(join(dir, 'home'));
  const env = {
    HOME: home,
    XDG_CONFIG_HOME: '',
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
  const left = () => [...readdirSync(join(dir, 'app')), ...readdirSync(join(dir, 'home'))].filter((f) => f !== '.env');
  return { dir, app, home, env, left };
}

function run(script: string, args: string[], env: Record<string, string>) {
  const r = spawnSync(bash, [script, ...args], { cwd: root, env: { ...process.env, ...env }, encoding: 'utf8', timeout: 25_000 });
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
    writeFileSync(join(s.dir, 'app', 'install.state'), fixture(s.app));
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
    expect(existsSync(join(s.dir, 'app', 'install.state'))).toBe(true);
  });

  test('c2. a state file naming a non-cvs unit, a foreign file or a bad id is refused before any command', () => {
    for (const bad of ['unit=ideashub-web.service', 'unit=cvs-web.service; rm', 'file=/etc/passwd', 'tunnel_id=../../x', 'zone_id=not-hex']) {
      const s = sandbox();
      writeFileSync(join(s.dir, 'app', 'install.state'), fixture(s.app, bad));
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
    writeFileSync(join(s.dir, 'app', 'install.state'), fixture(s.app));
    for (const [script, env] of [
      [installSh, s.env],
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
