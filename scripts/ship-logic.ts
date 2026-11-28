// pnpm ship: the logic behind scripts/ship.ts, kept free of process and filesystem access so it can be tested with an injected runner.
export const REPO = 'Vet-Group/creative-video-studio';
export const PUBLIC_LOGIN = 'https://video.vetgroup.net/login';
export const LOCAL_LOGIN = 'http://127.0.0.1:3400/login';
const CI_WORKFLOWS = ['CI', 'E2E'];
const POLL_MS = 30_000;
const CI_TIMEOUT_MS = 40 * 60_000;
const WATCH_POLL_MS = 60_000;
const WATCH_TIMEOUT_MS = 90 * 60_000;

// Terminal states per table (packages/db/src/schema.ts; ship.test.ts checks these against it). A status not listed counts as busy.
export const TERMINAL = {
  jobs: ['succeeded', 'failed', 'failed_unknown', 'timed_out'],
  analyses: ['succeeded', 'failed'],
  remakes: ['succeeded', 'partial', 'failed'],
};

export type RunResult = { code: number; stdout: string; stderr: string };
export type Deps = {
  /** `stream` shows the command's output live and returns only the exit code. */
  run: (cmd: string, args: string[], opts?: { stream?: boolean }) => RunResult;
  sleep: (ms: number) => Promise<void>;
  now: () => Date;
  log: (line: string) => void;
  env: Record<string, string | undefined>;
  /** Repository root, where scripts/run/vet.sh lives. */
  root: string;
};
export type Options = { pr: number | null; dryRun: boolean; waitIdleMin: number; watch: boolean };

export class ShipError extends Error {}

type Check = { __typename?: string; name?: string; status?: string; conclusion?: string; context?: string; state?: string };
/** `fatal` marks a verdict that waiting cannot fix (closed, conflicting, a failed check); `pnpm ship --watch` keeps polling on the rest. */
export type PrVerdict = { ok: true; head: string; branch: string } | { ok: false; reason: string; fatal: boolean };

/** The green/red decision on `gh pr view --json state,isDraft,mergeable,headRefOid,headRefName,statusCheckRollup`. */
export function checkPr(raw: string): PrVerdict {
  let pr: { state?: string; isDraft?: boolean; mergeable?: string; headRefOid?: string; headRefName?: string; statusCheckRollup?: Check[] };
  try {
    pr = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'gh returned something that is not JSON', fatal: true };
  }
  if (pr.state !== 'OPEN') return { ok: false, reason: `the PR is ${pr.state ?? 'in an unknown state'}, not OPEN`, fatal: true };
  if (pr.isDraft) return { ok: false, reason: 'the PR is a draft', fatal: false };
  const checks = pr.statusCheckRollup ?? [];
  const failed: string[] = [];
  const pending: string[] = [];
  for (const c of checks) {
    const name = c.name ?? c.context ?? 'unnamed check';
    if (c.__typename === 'StatusContext') {
      if (c.state === 'SUCCESS') continue;
      (c.state === 'PENDING' || c.state === 'EXPECTED' ? pending : failed).push(`${name} (${c.state})`);
    } else if (c.status !== 'COMPLETED') pending.push(`${name} (${c.status ?? 'pending'})`);
    else if (c.conclusion !== 'SUCCESS' && c.conclusion !== 'SKIPPED') failed.push(`${name} (${c.conclusion})`);
  }
  if (failed.length) return { ok: false, reason: `checks failed: ${failed.join(', ')}`, fatal: true };
  if (checks.length === 0) return { ok: false, reason: 'the PR head has no checks yet', fatal: false };
  if (pending.length) return { ok: false, reason: `checks not green yet: ${pending.join(', ')}`, fatal: false };
  if (pr.mergeable !== 'MERGEABLE') return { ok: false, reason: `the PR is not mergeable (${pr.mergeable ?? 'unknown'})`, fatal: pr.mergeable === 'CONFLICTING' };
  if (!pr.headRefOid || !/^[0-9a-f]{40}$/.test(pr.headRefOid)) return { ok: false, reason: 'the PR head SHA is missing', fatal: true };
  if (!pr.headRefName) return { ok: false, reason: 'the PR head branch is missing', fatal: true };
  return { ok: true, head: pr.headRefOid, branch: pr.headRefName };
}

/** The merge commit has the tree of the PR head whose checks were green, so CI on main would only repeat them. */
export function canSkipCi(mergeTree: string, headTree: string): boolean {
  return /^[0-9a-f]{40}$/.test(mergeTree) && mergeTree === headTree;
}

export type CiVerdict = { state: 'success' | 'failure' | 'pending'; detail: string };

/** `gh run list --commit <sha> --json name,status,conclusion` (newest run first): both workflows must be done, success or skipped. */
export function ciVerdict(raw: string): CiVerdict {
  let runs: { name: string; status: string; conclusion: string }[];
  try {
    runs = JSON.parse(raw);
  } catch {
    return { state: 'failure', detail: 'gh returned something that is not JSON' };
  }
  const pending: string[] = [];
  for (const name of CI_WORKFLOWS) {
    const run = runs.find((r) => r.name === name);
    if (!run) pending.push(`${name} not started`);
    else if (run.status !== 'completed') pending.push(`${name} ${run.status}`);
    else if (run.conclusion !== 'success' && run.conclusion !== 'skipped') return { state: 'failure', detail: `${name} ${run.conclusion}` };
  }
  return pending.length ? { state: 'pending', detail: pending.join(', ') } : { state: 'success', detail: 'CI and E2E done' };
}

/** PR numbers from subjects ending in `(#N)`, oldest first. `git log` lists the newest first. */
export function prsFromLog(subjects: string): number[] {
  return subjects
    .split('\n')
    .flatMap((s) => {
      const m = /\(#(\d+)\)\s*$/.exec(s);
      return m ? [Number(m[1])] : [];
    })
    .reverse();
}

const quoted = (list: string[]) => list.map((s) => `'${s}'`).join(', ');
export const IN_FLIGHT_SQL = `SELECT (SELECT count(*) FROM jobs WHERE status NOT IN (${quoted(TERMINAL.jobs)})), (SELECT count(*) FROM analyses WHERE status NOT IN (${quoted(TERMINAL.analyses)})), (SELECT count(*) FROM remakes WHERE status NOT IN (${quoted(TERMINAL.remakes)}))`;

/** Output of `psql -At` for IN_FLIGHT_SQL: `jobs|analyses|remakes`. */
export function parseInFlight(out: string): { jobs: number; analyses: number; remakes: number; total: number } | null {
  const m = /^(\d+)\|(\d+)\|(\d+)$/.exec(out.trim());
  if (!m) return null;
  const [jobs, analyses, remakes] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return { jobs, analyses, remakes, total: jobs + analyses + remakes };
}

/** What `vet.sh status` prints: `commit <short sha>` first, then the `systemctl list-units` lines. */
export function parseStatus(out: string): { commit: string | null; active: Record<string, boolean> } {
  const commit = /^commit ([0-9a-f]{7,40})\s*$/m.exec(out)?.[1] ?? null;
  const active: Record<string, boolean> = {};
  for (const line of out.split('\n')) {
    const f = line.trim().split(/\s+/);
    if (/^cvs-(web|worker)\.service$/.test(f[0] ?? '')) active[f[0]!] = f[2] === 'active';
  }
  return { commit, active };
}

export const shortList = (prs: number[]) => (prs.length ? prs.map((n) => `#${n}`).join(', ') : 'no PRs');
export const summaryLine = (sha: string, prs: number[]) => `deployed ${sha.slice(0, 8)} (${shortList(prs)}), verified`;

const shq = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`;

export async function ship(opts: Options, d: Deps): Promise<string> {
  const stamp = () => d.now().toISOString();
  const log = (m: string) => d.log(`[${stamp()}] ${m}`);
  const fail = (m: string): never => {
    throw new ShipError(m);
  };
  const sshHost = d.env.CVS_SSH_HOST || 'vet-linux';
  const ssh = (remote: string) => d.run('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', sshHost, remote]);
  const vet = (verb: string, ...args: string[]) => d.run('bash', [`${d.root}/scripts/run/vet.sh`, verb, ...args], { stream: verb !== 'status' });
  const gh = (...args: string[]) => d.run('gh', args);
  const git = (...args: string[]) => d.run('git', ['-C', d.root, ...args]);
  const mustGit = (what: string, ...args: string[]) => {
    const r = git(...args);
    if (r.code !== 0) fail(`${what} failed: ${r.stderr.trim()}`);
    return r.stdout.trim();
  };
  const dry = opts.dryRun;
  if (dry) log('dry run: read-only steps only, nothing is merged, backed up or deployed');

  let target: string | null = null;
  let extraPr: number | null = null;
  let prHead: string | null = null;
  let skipCi = false;
  if (opts.pr !== null) {
    log(`step 1: reading PR #${opts.pr}${opts.watch ? ' (watching until it is green)' : ''}`);
    const watchDeadline = d.now().getTime() + WATCH_TIMEOUT_MS;
    let seenHead = '';
    let v: PrVerdict;
    for (;;) {
      const view = gh('pr', 'view', String(opts.pr), '--repo', REPO, '--json', 'state,isDraft,mergeable,headRefOid,headRefName,statusCheckRollup');
      if (view.code !== 0) fail(`gh pr view failed: ${view.stderr.trim()}`);
      v = checkPr(view.stdout);
      if (v.ok) break;
      if (v.fatal || !opts.watch) return fail(`PR #${opts.pr} is not ready: ${v.reason}`);
      const head = (JSON.parse(view.stdout).headRefOid as string | undefined) ?? '';
      if (head !== seenHead) log(`PR head is ${head.slice(0, 8)}`);
      seenHead = head;
      if (dry) {
        log(`dry run: ${v.reason}; a real run would poll every 60 s for up to 90 minutes, then continue below`);
        break;
      }
      if (d.now().getTime() >= watchDeadline) return fail(`PR #${opts.pr} was not green within 90 minutes (${v.reason})`);
      log(`waiting: ${v.reason}`);
      await d.sleep(WATCH_POLL_MS);
    }
    if (v.ok) log(`PR #${opts.pr} is open, mergeable, head ${v.head.slice(0, 8)} on ${v.branch}, every check green`);
    if (dry || !v.ok) {
      log(`would merge: gh pr merge ${opts.pr} --squash --match-head-commit <head>, then delete the branch`);
      extraPr = opts.pr;
    } else {
      const merge = gh('pr', 'merge', String(opts.pr), '--repo', REPO, '--squash', '--match-head-commit', v.head);
      if (merge.code !== 0) fail(`gh pr merge failed (not retried): ${merge.stderr.trim()}`);
      log(`merged #${opts.pr}`);
      if (v.branch === 'main' || !/^[A-Za-z0-9._/-]+$/.test(v.branch)) log(`WARN: not deleting branch ${v.branch}`);
      else {
        const del = gh('api', '-X', 'DELETE', `repos/${REPO}/git/refs/heads/${v.branch}`);
        log(del.code === 0 ? `deleted remote branch ${v.branch}` : `WARN: could not delete remote branch ${v.branch}: ${del.stderr.trim()}`);
      }
      for (let i = 0; i < 6 && !target; i++) {
        const oid = /^[0-9a-f]{40}$/.exec(JSON.parse(gh('pr', 'view', String(opts.pr), '--repo', REPO, '--json', 'mergeCommit').stdout || '{}').mergeCommit?.oid ?? '');
        if (oid) target = oid[0];
        else await d.sleep(5000);
      }
      if (!target) fail(`#${opts.pr} merged but GitHub gave no merge commit; run pnpm ship without a PR number`);
      prHead = v.head;
    }
  } else log('step 1: no PR given');
  mustGit('git fetch', 'fetch', 'origin', '--quiet');
  const mainHead = mustGit('git rev-parse', 'rev-parse', 'origin/main');
  if (opts.pr === null) target = mainHead;
  const ciSha = target ?? mainHead;
  if (target && prHead) {
    // The PR ref outlives the deleted branch, so the green head commit is fetchable after the merge.
    const fetched = git('fetch', 'origin', '--quiet', `pull/${opts.pr}/head`);
    const mergeTree = git('rev-parse', `${target}^{tree}`);
    const headTree = git('rev-parse', `${prHead}^{tree}`);
    if (fetched.code === 0 && mergeTree.code === 0 && headTree.code === 0) skipCi = canSkipCi(mergeTree.stdout.trim(), headTree.stdout.trim());
    else log(`WARN: could not compare trees (${(fetched.stderr || mergeTree.stderr || headTree.stderr).trim()}); CI will be awaited`);
  }
  log(`target ${target ?? 'the merge commit of #' + opts.pr} (origin/main is ${mainHead.slice(0, 8)})`);

  if (skipCi) log(`step 3: skipped, the merge commit has the tree of PR head ${prHead!.slice(0, 8)} whose checks were green`);
  else if (target || opts.pr === null) {
    if (opts.pr !== null) log('the merge commit differs from the PR head tree (the PR was behind main), so CI on main is awaited');
    log(`step 3: waiting for CI and E2E on ${ciSha.slice(0, 8)}`);
    const deadline = d.now().getTime() + CI_TIMEOUT_MS;
    for (;;) {
      const r = gh('run', 'list', '--repo', REPO, '--commit', ciSha, '--json', 'name,status,conclusion', '--limit', '50');
      if (r.code !== 0) fail(`gh run list failed: ${r.stderr.trim()}`);
      const c = ciVerdict(r.stdout);
      if (c.state === 'success') {
        log(`CI is green on ${ciSha.slice(0, 8)}`);
        break;
      }
      if (c.state === 'failure') fail(`CI is red on ${ciSha.slice(0, 8)}: ${c.detail}`);
      if (dry) {
        log(`dry run: CI is not finished (${c.detail}); a real run would wait up to 40 minutes`);
        break;
      }
      if (d.now().getTime() >= deadline) fail(`CI did not finish on ${ciSha.slice(0, 8)} within 40 minutes (${c.detail})`);
      log(`CI pending (${c.detail})`);
      await d.sleep(POLL_MS);
    }
  } else log('step 3: skipped in a dry run with a PR; its checks were green above and the merge commit does not exist yet');

  log('step 4: counting jobs, analyses and remakes in flight on prod');
  const idleDeadline = d.now().getTime() + opts.waitIdleMin * 60_000;
  for (;;) {
    const r = ssh(`docker exec creative-video-studio-postgres-1 psql -U cvs -d cvs -Atc ${shq(IN_FLIGHT_SQL)}`);
    const n = r.code === 0 ? parseInFlight(r.stdout) : null;
    if (!n) return fail(`could not read the in-flight count over ssh ${sshHost}: ${(r.stderr || r.stdout).trim() || `exit ${r.code}`}`);
    const text = `jobs ${n.jobs}, analyses ${n.analyses}, remakes ${n.remakes}`;
    if (n.total === 0) {
      log(`nothing in flight (${text})`);
      break;
    }
    if (dry) {
      log(`dry run: ${n.total} in flight (${text}); a real run would wait up to ${opts.waitIdleMin} minutes`);
      break;
    }
    if (d.now().getTime() >= idleDeadline) fail(`prod is still busy after ${opts.waitIdleMin} minutes (${text}); nothing was backed up or deployed`);
    log(`busy (${text}), checking again in 30 s`);
    await d.sleep(POLL_MS);
  }

  log('reading the commit prod runs now (vet.sh status)');
  const before = vet('status');
  const prev = before.code === 0 ? parseStatus(before.stdout).commit : null;
  if (!prev) return fail(`could not read the current prod commit from vet.sh status (exit ${before.code}): ${before.stderr.trim()}`);
  log(`prod runs ${prev}`);
  // The gate deploys whatever main is at, so prod may run a descendant of the target: "contains" is an ancestor test, not equality.
  const contains = (ancestor: string, descendant: string) => git('merge-base', '--is-ancestor', ancestor, descendant).code === 0;
  const prevFull = git('rev-parse', '--verify', `${prev}^{commit}`);
  if (prevFull.code !== 0) log(`WARN: prod commit ${prev} is not in this checkout, so "already deployed" and the PR list cannot be checked`);
  else if (target && contains(target, prevFull.stdout.trim())) {
    log(`prod already contains ${target.slice(0, 8)}; nothing to ship`);
    return `nothing to ship, prod already runs ${prev}, which contains ${target.slice(0, 8)}`;
  }
  const prsBetween = (to: string) => {
    const range = git('log', '--format=%s', `${prev}..${to}`);
    if (range.code !== 0) log(`WARN: git log ${prev}..${to.slice(0, 8)} failed, so the PR list may be incomplete: ${range.stderr.trim()}`);
    return prsFromLog(range.stdout);
  };
  const prs = prsBetween(target ?? mainHead);
  if (extraPr !== null && !prs.includes(extraPr)) prs.push(extraPr);

  if (dry) {
    log(`plan: backup, then deploy ${target ?? 'the merge commit'}, then read back status, /login and the worker journal`);
    const line = `dry run, would ship (${shortList(prs)}) on top of prod ${prev}`;
    log(line);
    return line;
  }

  const sha = target!;
  if (!/^[0-9a-f]{40}$/.test(sha)) fail(`target ${sha} is not a full 40-hex SHA`);
  log('step 5: backup (vet.sh backup)');
  if (vet('backup').code !== 0) fail('backup failed; nothing was deployed');
  const startedAt = d.now();
  log(`step 6: deploy ${sha} (vet.sh deploy; concurrent deploys queue on ops.lock)`);
  if (vet('deploy', sha).code !== 0) fail('deploy failed (not retried); check vet.sh status before doing anything else');

  log('step 7: read-back');
  const st = vet('status');
  const parsed = st.code === 0 ? parseStatus(st.stdout) : null;
  if (!parsed?.commit) return fail(`vet.sh status shows no commit (exit ${st.code})`);
  mustGit('git fetch', 'fetch', 'origin', '--quiet');
  const actualRev = git('rev-parse', '--verify', `${parsed.commit}^{commit}`);
  const actual = actualRev.stdout.trim();
  if (actualRev.code !== 0 || !contains(sha, actual)) fail(`vet.sh status shows ${parsed.commit}, which is not ${sha.slice(0, 8)} or a descendant of it`);
  for (const unit of ['cvs-web.service', 'cvs-worker.service']) if (!parsed.active[unit]) fail(`${unit} is not active`);
  log(actual === sha ? `status shows ${sha.slice(0, 8)}, cvs-web and cvs-worker active` : `status shows ${actual.slice(0, 8)}, a descendant of ${sha.slice(0, 8)} (main moved); cvs-web and cvs-worker active`);
  prs.splice(0, prs.length, ...prsBetween(actual));
  const code = async (what: string, run: () => RunResult) => {
    let out = '';
    for (let i = 0; i < 6; i++) {
      const r = run();
      out = r.stdout.trim();
      if (r.code === 0 && out === '200') return log(`${what} answers 200`);
      await d.sleep(10_000);
    }
    return fail(`${what} answered ${out || 'nothing'}, expected 200`);
  };
  await code(PUBLIC_LOGIN, () => d.run('curl', ['-s', '-m', '20', '-o', '/dev/null', '-w', '%{http_code}', PUBLIC_LOGIN]));
  await code(`${LOCAL_LOGIN} on the host`, () => ssh(`curl -s -m 20 -o /dev/null -w '%{http_code}' ${LOCAL_LOGIN}`));
  const since = `${startedAt.toISOString().slice(0, 19).replace('T', ' ')} UTC`;
  const j = ssh(`journalctl -u cvs-worker --since ${shq(since)} --no-pager | grep -ciE 'error|fatal' || true`);
  const errors = Number(j.stdout.trim());
  log(j.code === 0 && Number.isInteger(errors) ? `worker journal: ${errors} error/fatal lines since ${since}${errors ? ' (WARN: read them)' : ''}` : `WARN: could not count worker journal errors: ${j.stderr.trim()}`);

  const line = summaryLine(actual, prs);
  log(line);
  return line;
}
