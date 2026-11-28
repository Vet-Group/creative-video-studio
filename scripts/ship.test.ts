import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { canSkipCi, checkPr, ciVerdict, IN_FLIGHT_SQL, parseInFlight, parseStatus, prsFromLog, ship, ShipError, summaryLine, TERMINAL, type Deps, type Options } from './ship-logic.ts';

const HEAD = 'a'.repeat(40);
const MERGE = 'b'.repeat(40);
const MAIN = 'c'.repeat(40);
const T1 = '1'.repeat(40);
const T2 = '2'.repeat(40);
const pr = (over: Record<string, unknown> = {}, checks: unknown[] = [{ __typename: 'CheckRun', name: 'CI', status: 'COMPLETED', conclusion: 'SUCCESS' }]) =>
  JSON.stringify({ state: 'OPEN', isDraft: false, mergeable: 'MERGEABLE', headRefOid: HEAD, headRefName: 'feat/x', statusCheckRollup: checks, ...over });

describe('checkPr', () => {
  test('accepts green and skipped checks', () => {
    const checks = [
      { __typename: 'CheckRun', name: 'CI', status: 'COMPLETED', conclusion: 'SUCCESS' },
      { __typename: 'CheckRun', name: 'E2E shard', status: 'COMPLETED', conclusion: 'SKIPPED' },
      { __typename: 'StatusContext', context: 'legacy', state: 'SUCCESS' },
    ];
    expect(checkPr(pr({}, checks))).toEqual({ ok: true, head: HEAD, branch: 'feat/x' });
  });

  test.each([
    ['closed', { state: 'MERGED' }, undefined, true],
    ['draft', { isDraft: true }, undefined, false],
    ['conflicting', { mergeable: 'CONFLICTING' }, undefined, true],
    ['mergeability unknown', { mergeable: 'UNKNOWN' }, undefined, false],
    ['a failed check', {}, [{ __typename: 'CheckRun', name: 'CI', status: 'COMPLETED', conclusion: 'FAILURE' }], true],
    ['a cancelled check', {}, [{ __typename: 'CheckRun', name: 'CI', status: 'COMPLETED', conclusion: 'CANCELLED' }], true],
    ['a running check', {}, [{ __typename: 'CheckRun', name: 'CI', status: 'IN_PROGRESS', conclusion: '' }], false],
    ['a pending status', {}, [{ __typename: 'StatusContext', context: 's', state: 'PENDING' }], false],
    ['no checks', {}, [], false],
  ])('refuses %s (fatal: %s)', (_name, over, checks, fatal) => {
    const v = checkPr(checks === undefined ? pr(over) : pr(over, checks));
    expect(v).toMatchObject({ ok: false, fatal });
  });

  test('refuses output that is not JSON', () => {
    expect(checkPr('nope')).toMatchObject({ ok: false, fatal: true });
  });
});

describe('ciVerdict', () => {
  const run = (name: string, status: string, conclusion = '') => ({ name, status, conclusion });
  test.each([
    [[run('CI', 'completed', 'success'), run('E2E', 'completed', 'skipped')], 'success'],
    [[run('CI', 'completed', 'success'), run('E2E', 'in_progress')], 'pending'],
    [[run('CI', 'completed', 'success')], 'pending'],
    [[run('CI', 'completed', 'failure'), run('E2E', 'in_progress')], 'failure'],
    [[run('CI', 'completed', 'success'), run('E2E', 'completed', 'cancelled')], 'failure'],
    [[run('lockfile', 'completed', 'failure'), run('CI', 'completed', 'success'), run('E2E', 'completed', 'success')], 'success'],
  ])('%j is %s', (runs, state) => {
    expect(ciVerdict(JSON.stringify(runs)).state).toBe(state);
  });
});

test('prsFromLog lists the PR numbers oldest first and skips other subjects', () => {
  const log = ['Add b (#12)', 'Direct push without a number', 'Add a (#10) ', 'Fix (#7) (#9)'].join('\n');
  expect(prsFromLog(log)).toEqual([9, 10, 12]);
  expect(prsFromLog('')).toEqual([]);
  expect(summaryLine(MERGE, [10, 12])).toBe(`deployed ${'b'.repeat(8)} (#10, #12), verified`);
  expect(summaryLine(MERGE, [])).toBe(`deployed ${'b'.repeat(8)} (no PRs), verified`);
});

test('parseInFlight reads psql output', () => {
  expect(parseInFlight('2|0|1\n')).toEqual({ jobs: 2, analyses: 0, remakes: 1, total: 3 });
  expect(parseInFlight('0|0|0')?.total).toBe(0);
  expect(parseInFlight('psql: error')).toBeNull();
});

test('parseStatus reads the commit and the unit states', () => {
  const out = [
    'commit 1a2b3c4',
    'web build .next-1; on disk: .next-1',
    'cvs-web.service loaded active running CVS web',
    'cvs-tunnel.service loaded active running tunnel',
    'cvs-worker.service loaded failed failed CVS worker',
  ].join('\n');
  expect(parseStatus(out)).toEqual({ commit: '1a2b3c4', active: { 'cvs-web.service': true, 'cvs-worker.service': false } });
  expect(parseStatus('commit ?').commit).toBeNull();
});

test('canSkipCi only when both trees are the same real tree', () => {
  const tree = 'd'.repeat(40);
  expect(canSkipCi(tree, tree)).toBe(true);
  expect(canSkipCi(tree, 'e'.repeat(40))).toBe(false);
  expect(canSkipCi('', '')).toBe(false);
});

describe('terminal statuses', () => {
  const schema = readFileSync(join(import.meta.dirname, '../packages/db/src/schema.ts'), 'utf8');
  const list = (name: string) => [...new RegExp(`${name} = \\[([^\\]]*)\\]`).exec(schema)![1]!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);
  // A status the code adds later must not silently count as finished: every non-terminal one is a known in-flight state.
  test('match the schema', () => {
    expect(list('JOB_STATUSES').filter((s) => !TERMINAL.jobs.includes(s))).toEqual(['queued', 'submitting', 'running']);
    expect(list('ANALYSIS_STATUSES').filter((s) => !TERMINAL.analyses.includes(s))).toEqual(['queued', 'running']);
    expect(list('REMAKE_STATUSES').filter((s) => !TERMINAL.remakes.includes(s))).toEqual(['queued', 'running']);
    for (const [k, v] of Object.entries(TERMINAL)) for (const s of v) expect(list(`${k === 'jobs' ? 'JOB' : k === 'analyses' ? 'ANALYSIS' : 'REMAKE'}_STATUSES`)).toContain(s);
  });
});

// A scripted command runner: the first handler whose pattern matches "cmd args" answers; every call is recorded.
function harness(handlers: [RegExp, (call: string) => Partial<{ code: number; stdout: string; stderr: string }>][], opts: Partial<Options> = {}) {
  const calls: string[] = [];
  const logs: string[] = [];
  let clock = Date.parse('2026-11-28T10:00:00Z');
  const deps: Deps = {
    run: (cmd, args) => {
      const call = `${cmd} ${args.join(' ')}`;
      calls.push(call);
      const h = handlers.find(([re]) => re.test(call));
      return { code: 0, stdout: '', stderr: '', ...(h ? h[1](call) : { code: 1, stderr: `unscripted: ${call}` }) };
    },
    sleep: async (ms) => void (clock += ms),
    now: () => new Date(clock),
    log: (l) => logs.push(l),
    env: {},
    root: '/repo',
  };
  const options: Options = { pr: null, dryRun: false, waitIdleMin: 20, watch: false, ...opts };
  return { calls, logs, run: () => ship(options, deps) };
}
const ok = (stdout = '') => () => ({ stdout });
const green = [{ name: 'CI', status: 'completed', conclusion: 'success' }, { name: 'E2E', status: 'completed', conclusion: 'skipped' }];
const statusOut = (sha: string) => `commit ${sha}\ncvs-web.service loaded active running web\ncvs-worker.service loaded active running worker\n`;
const statusSeq = () => {
  let n = 0;
  return () => ({ stdout: statusOut(n++ ? MERGE.slice(0, 7) : '1234567') });
};
const prod = [
  [/ssh .*psql/, ok('0|0|0')],
  [/vet\.sh status/, ok(statusOut('1234567'))],
  [/git -C \/repo log/, ok('Add b (#12)\nAdd a (#11)\n')],
] as [RegExp, () => object][];
const readback = [
  [/vet\.sh (backup|deploy)/, ok()],
  [/^curl .*\/login/, ok('200')],
  [/ssh .*curl/, ok('200')],
  [/ssh .*journalctl/, ok('3\n')],
] as [RegExp, () => object][];
const merged = (head = HEAD, mergeTree = T1, headTree = T1) =>
  [
    [/gh pr view 5 .*statusCheckRollup/, ok(pr({ headRefOid: head }))],
    [/gh pr merge 5/, ok()],
    [/gh api -X DELETE/, ok()],
    [/gh pr view 5 .*mergeCommit/, ok(JSON.stringify({ mergeCommit: { oid: MERGE } }))],
    [/git -C \/repo fetch/, ok()],
    [/rev-parse origin\/main/, ok(MAIN)],
    [new RegExp(`rev-parse ${MERGE}\\^\\{tree\\}`), ok(mergeTree)],
    [new RegExp(`rev-parse ${head}\\^\\{tree\\}`), ok(headTree)],
  ] as [RegExp, () => object][];
const names = (calls: string[]) => calls.filter((c) => /gh pr merge|vet\.sh (backup|deploy)/.test(c));

describe('ship', () => {
  test('dry run with no PR reads prod and changes nothing', async () => {
    const h = harness([[/rev-parse origin\/main/, ok(MAIN)], [/git -C \/repo fetch/, ok()], [/gh run list/, ok(JSON.stringify(green))], ...prod], { dryRun: true });
    expect(await h.run()).toContain('would ship (#11, #12)');
    expect(names(h.calls)).toEqual([]);
    expect(h.calls.some((c) => c.includes(IN_FLIGHT_SQL.slice(0, 40)))).toBe(true);
  });

  test('a PR whose merge tree equals its head tree skips CI and deploys', async () => {
    const h = harness([...merged(), ...prod.slice(0, 1), [/vet\.sh status/, statusSeq()], ...prod.slice(2), ...readback], { pr: 5 });
    expect(await h.run()).toBe(`deployed ${'b'.repeat(8)} (#11, #12), verified`);
    expect(names(h.calls)).toEqual(['gh pr merge 5 --repo Vet-Group/creative-video-studio --squash --match-head-commit ' + HEAD, 'bash /repo/scripts/run/vet.sh backup', `bash /repo/scripts/run/vet.sh deploy ${MERGE}`]);
    expect(h.calls.some((c) => c.startsWith('gh run list'))).toBe(false);
    expect(h.calls).toContain('gh api -X DELETE repos/Vet-Group/creative-video-studio/git/refs/heads/feat/x');
    expect(h.logs.join('\n')).toContain('step 3: skipped');
  });

  test('a PR that was behind main waits for CI on the merge commit', async () => {
    let polls = 0;
    const ci = () => ({ stdout: JSON.stringify(polls++ ? green : [{ name: 'CI', status: 'in_progress', conclusion: '' }]) });
    const h = harness([...merged(HEAD, T1, T2), [/gh run list/, ci], ...prod.slice(0, 1), [/vet\.sh status/, statusSeq()], ...prod.slice(2), ...readback], { pr: 5 });
    await h.run();
    expect(h.calls.filter((c) => c.startsWith('gh run list'))).toHaveLength(2);
    expect(h.logs.join('\n')).toContain('CI on main is awaited');
  });

  test('red CI stops before prod is touched', async () => {
    const red = [{ name: 'CI', status: 'completed', conclusion: 'failure' }];
    const h = harness([[/rev-parse origin\/main/, ok(MAIN)], [/git -C \/repo fetch/, ok()], [/gh run list/, ok(JSON.stringify(red))], ...prod, ...readback]);
    await expect(h.run()).rejects.toThrow(/CI is red/);
    expect(h.calls.some((c) => c.startsWith('ssh') || c.includes('vet.sh'))).toBe(false);
  });

  test('a busy prod aborts after the wait-idle timeout without a backup', async () => {
    const h = harness([[/rev-parse origin\/main/, ok(MAIN)], [/git -C \/repo fetch/, ok()], [/gh run list/, ok(JSON.stringify(green))], [/ssh .*psql/, ok('1|0|0')], ...prod, ...readback], { waitIdleMin: 2 });
    await expect(h.run()).rejects.toThrow(/still busy after 2 minutes/);
    expect(names(h.calls)).toEqual([]);
  });

  test('a failed deploy is not retried and the read-back is skipped', async () => {
    const h = harness([[/vet\.sh deploy/, () => ({ code: 1 })], [/rev-parse origin\/main/, ok(MAIN)], [/git -C \/repo fetch/, ok()], [/gh run list/, ok(JSON.stringify(green))], ...prod, ...readback]);
    await expect(h.run()).rejects.toBeInstanceOf(ShipError);
    expect(h.calls.filter((c) => c.includes('vet.sh deploy'))).toHaveLength(1);
    expect(h.calls.filter((c) => c.includes('vet.sh status'))).toHaveLength(1);
  });

  test('--watch polls until the checks are green, then merges', async () => {
    let polls = 0;
    const view = () => ({ stdout: pr({}, polls++ < 2 ? [{ __typename: 'CheckRun', name: 'CI', status: 'IN_PROGRESS', conclusion: '' }] : undefined) });
    const h = harness([[/gh pr view 5 .*statusCheckRollup/, view], ...merged().slice(1), ...prod.slice(0, 1), [/vet\.sh status/, statusSeq()], ...prod.slice(2), ...readback], { pr: 5, watch: true });
    await h.run();
    expect(polls).toBe(3);
    expect(h.calls.filter((c) => c.startsWith('gh pr merge'))).toHaveLength(1);
  });

  test('--watch stops when a check fails or the PR closes', async () => {
    const failing = [{ __typename: 'CheckRun', name: 'CI', status: 'COMPLETED', conclusion: 'FAILURE' }];
    const a = harness([[/gh pr view 5/, ok(pr({}, failing))]], { pr: 5, watch: true });
    await expect(a.run()).rejects.toThrow(/checks failed: CI \(FAILURE\)/);
    const b = harness([[/gh pr view 5/, ok(pr({ state: 'CLOSED' }))]], { pr: 5, watch: true });
    await expect(b.run()).rejects.toThrow(/CLOSED/);
    expect(names(a.calls)).toEqual([]);
  });

  test('--watch with --dry-run reports once and does not wait', async () => {
    const running = [{ __typename: 'CheckRun', name: 'CI', status: 'IN_PROGRESS', conclusion: '' }];
    const h = harness([[/gh pr view 5/, ok(pr({}, running))], [/git -C \/repo fetch/, ok()], [/rev-parse origin\/main/, ok(MAIN)], [/gh run list/, ok(JSON.stringify(green))], ...prod], { pr: 5, watch: true, dryRun: true });
    expect(await h.run()).toContain('would ship (#11, #12, #5)');
    expect(h.logs.join('\n')).toContain('would poll every 60 s');
    expect(names(h.calls)).toEqual([]);
  });
});
