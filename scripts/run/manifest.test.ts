import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { shouldRelaunch, writeLease } from './lease.ts';
import {
  approve, changedGuards, expireSteps, guardFiles, initManifest, parseCriteria, preapprovalValid, readManifest, readySteps, recordFailure,
  sha256, validate, writeManifest, type Manifest,
} from './manifest.ts';
import { sendLark } from './notify.ts';
import { skippedSteps } from './preflight.ts';
import { STEPS } from './steps.ts';
import { verify } from './verify.ts';

const SPECS = join(import.meta.dirname, '..', '..', '.omc', 'specs');
const pf = { checkedAt: '2026-10-23T00:00:00Z', results: [] };
const fresh = (skipped = new Map<string, string>()) => initManifest({ preflight: pf, skipped, criteria: [] });
const get = (m: Manifest, id: string) => m.steps.find((s) => s.id === id)!;
const tmp = () => mkdtempSync(join(tmpdir(), 'cvs-run-'));

describe('steps', () => {
  test('are topologically ordered with known deps', () => {
    const seen = new Set<string>();
    for (const s of STEPS) {
      for (const d of s.deps) expect(seen.has(d), `${s.id} -> ${d}`).toBe(true);
      seen.add(s.id);
    }
  });
});

describe('manifest', () => {
  test('a missing ssh item skips its steps and their hard dependents, not soft ones', () => {
    const m = fresh(skippedSteps([{ id: 'ssh', status: 'SAI', note: '' }]));
    expect(get(m, 'D.5').status).toBe('skipped');
    expect(get(m, 'D.5-hostname').reason).toBe('dependency D.5 skipped');
    expect(get(m, 'M.6').status).toBe('pending'); // B.6 is a soft dep: M.6 ships models disabled
    expect(get(m, 'D.4').status).toBe('pending');
    expect(get(m, 'P.1').status).toBe('pending');
  });

  test('done without evidence, or skipped without a reason, is invalid', () => {
    const m = fresh();
    get(m, 'A.0').status = 'done';
    get(m, 'P.0').status = 'skipped';
    expect(validate(m)).toEqual(['A.0: done without evidence', 'P.0: skipped without a reason']);
    get(m, 'A.0').evidence.push({ kind: 'note', text: 'trust me' });
    expect(validate(m)[0]).toBe('A.0: done without evidence');
  });

  test('ready steps need all deps done or skipped', () => {
    const m = fresh();
    expect(readySteps(m).map((s) => s.id)).toEqual(['A.0', 'P.0']);
    get(m, 'A.0').status = 'done';
    get(m, 'P.0').status = 'skipped';
    expect(readySteps(m).map((s) => s.id)).toEqual(['R.1']);
  });

  test('the third failure makes the step stuck', () => {
    const s = get(fresh(), 'R.2');
    recordFailure(s, 'a');
    recordFailure(s, 'b');
    expect(s.status).toBe('pending');
    recordFailure(s, 'c');
    expect(s.status).toBe('stuck');
    expect(s.attempts).toBe(3);
  });

  test('a doing step past its timeout becomes stuck', () => {
    const m = fresh();
    Object.assign(get(m, 'A.0'), { status: 'doing', startedAt: '2026-10-23T00:00:00Z' });
    expect(expireSteps(m, new Date('2026-10-23T00:59:00Z'))).toEqual([]);
    expect(expireSteps(m, new Date('2026-10-23T01:01:00Z'))).toEqual(['A.0']);
  });

  test('pre-approval expires after 14 days', () => {
    const m = fresh();
    approve(m, 'x', new Date('2026-10-23T00:00:00Z'));
    expect(preapprovalValid(m, new Date('2026-11-05T23:00:00Z'))).toBe(true);
    expect(preapprovalValid(m, new Date('2026-11-06T00:00:01Z'))).toBe(false);
  });

  test('writes atomically, keeps 20 history versions and refuses an invalid manifest', () => {
    const dir = tmp();
    const path = join(dir, 'manifest.json');
    const m = fresh();
    for (let i = 0; i < 25; i++) writeManifest(path, m, new Date(Date.UTC(2026, 9, 23, 0, 0, i)));
    expect(readdirSync(join(dir, 'history'))).toHaveLength(20);
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
    get(m, 'A.0').status = 'done';
    expect(() => writeManifest(path, m)).toThrow(/done without evidence/);
    expect(readManifest(path).steps[0]!.status).toBe('pending');
  });

  test('criteria parse from unchecked numbered items only', () => {
    const md = '- [ ] 1. First.
- [x] 2. Done already.
- [ ] 3. Third.
not a criterion
';
    expect(parseCriteria('base', md).map((c) => c.id)).toEqual(['base-1', 'base-3']);
  });

  // The specs live in the local planning folder, which is not in Git, so CI skips this one.
  test.skipIf(!existsSync(SPECS))('the three specs yield 71 criteria', () => {
    const n = ['deep-interview-creative-video-studio.md', 'deep-interview-cvs-cost-attribution.md', 'deep-interview-cvs-autonomous-run.md'].map(
      (f) => parseCriteria('x', readFileSync(join(SPECS, f), 'utf8')).length,
    );
    expect(n).toEqual([33, 18, 20]);
  });

  test('a changed guard file is detected', () => {
    const dir = tmp();
    writeFileSync(join(dir, 'g'), 'a');
    const m = { ...fresh(), guardHashes: { g: sha256(join(dir, 'g')) } };
    expect(changedGuards(m, dir)).toEqual([]);
    writeFileSync(join(dir, 'g'), 'b');
    expect(changedGuards(m, dir)).toEqual(['g']);
  });
});

describe('lease and watchdog', () => {
  const now = new Date('2026-10-23T02:00:00Z');
  const lease = { pid: 42, startedAt: '2026-10-23T00:00:00.000Z' };
  const stale = '2026-10-23T01:00:00Z';

  test('relaunch only on a stale heartbeat with a dead or reused lease', () => {
    expect(shouldRelaunch({ heartbeat: '2026-10-23T01:30:00Z', lease, procStartedAt: null, now, finished: false }).relaunch).toBe(false);
    expect(shouldRelaunch({ heartbeat: stale, lease, procStartedAt: null, now, finished: false })).toEqual({ relaunch: true, why: 'leased process gone' });
    expect(shouldRelaunch({ heartbeat: stale, lease, procStartedAt: lease.startedAt, now, finished: false }).relaunch).toBe(false);
    expect(shouldRelaunch({ heartbeat: stale, lease, procStartedAt: '2026-10-23T01:59:00Z', now, finished: false }).why).toBe('PID reused by another process');
    expect(shouldRelaunch({ heartbeat: stale, lease: null, procStartedAt: null, now, finished: true }).relaunch).toBe(false);
  });

  test('a second lease is refused unless the relay forces it', () => {
    const path = join(tmp(), 'conductor.lock');
    writeLease(path, lease);
    expect(() => writeLease(path, lease)).toThrow();
    writeLease(path, { ...lease, pid: 43 }, true);
    expect(JSON.parse(readFileSync(path, 'utf8')).pid).toBe(43);
  });
});

describe('notify and verify', () => {
  test('Lark goes to the owner only', async () => {
    const calls: string[][] = [];
    const m = { ...fresh(), ownerOpenId: 'ou_owner' };
    const run = async (_c: string, a: string[]) => (calls.push(a), { code: 0 });
    expect(await sendLark(m, 'hi', run)).toBe(true);
    await expect(sendLark(m, 'hi', run, 'ou_boss')).rejects.toThrow(/owner only/);
    expect(calls).toHaveLength(1);
  });

  test('verify rejects a failing CI link, a changed file, a bad log and open criteria', async () => {
    const dir = tmp();
    writeFileSync(join(dir, 'out.txt'), 'x');
    writeFileSync(join(dir, 'run.log'), 'ok\nEXIT 1\n');
    const m = fresh();
    m.criteria = [{ id: 'base-1', text: 't', status: 'open', evidence: [] }];
    Object.assign(get(m, 'A.0'), { status: 'done', evidence: [{ kind: 'ci', repo: 'r', sha: 'abcdef1' }] });
    Object.assign(get(m, 'P.0'), { status: 'done', evidence: [{ kind: 'file', path: 'out.txt', sha256: 'wrong' }] });
    Object.assign(get(m, 'R.1'), { status: 'done', evidence: [{ kind: 'log', path: 'run.log', exitCode: 0 }] });
    const { errors } = await verify(m, dir, async () => 'failure');
    expect(errors).toEqual([
      'A.0: CI on abcdef1 is failure',
      'P.0: out.txt changed since it was recorded',
      'R.1: run.log does not end with EXIT 0',
      'base-1: still open',
    ]);
  });
});

test('guard files: committed list plus the local list entries that exist', () => {
  const root = tmp();
  mkdirSync(join(root, 'scripts/run'), { recursive: true });
  writeFileSync(join(root, 'package.json'), '{}');
  writeFileSync(join(root, 'kit.json'), '{}');
  writeFileSync(join(root, 'scripts/run/local-guards.txt'), '# comment\nkit.json\nmissing.json\n');
  expect(guardFiles(root).sort()).toEqual(['kit.json', 'package.json', 'scripts/run/local-guards.txt']);
});
