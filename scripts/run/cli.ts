// Run-manifest commands for the owner, the conductor, the watchdog and the relay (plan A.0).
//   approve "<sentence>"           owner: record the pre-approval, create or refresh the manifest from preflight
//   heartbeat | ready | render     conductor: alive signal, steps it may start, regenerate reports
//   start <step> --agent a --model m | done <step> --evidence '<json[]>' | fail <step> "<reason>" | skip <step> "<reason>"
//                                   (an ownerDone step such as M.7b also needs --owner "<the owner's words>" for done and skip)
//   verify                          anyone: machine check of all evidence (exit 1 on any error)
//   notify "<headline>"             conductor: Lark DM to the owner plus the Run log issue
//   guard-check                     vet.sh and the watchdog: exit 3 when a guard file changed (hard stop 2)
//   lease-write --pid N --started ISO [--force] | should-relaunch --proc-started ISO|none   launcher and watchdog
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readLease, shouldRelaunch, writeLease } from './lease.ts';
import {
  approve, changedGuards, expireSteps, guardFiles, initManifest, parseCriteria, preapprovalValid, readManifest, readySteps, recordFailure,
  renderEvidence, renewManifest, renderLark, renderProgress, renderRunLog, sha256, writeManifest, type Evidence, type Manifest,
} from './manifest.ts';
import { sendLark, updateRunLog, type Run } from './notify.ts';
import { matchesPreapproval, PREAPPROVAL_SENTENCE } from './preapproval.ts';
import { ownerOpenId, type ItemResult } from './preflight.ts';
import { STEPS } from './steps.ts';
import { verify, type CiStatus } from './verify.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
// CVS_RUN_DIR lets the watchdog dry-run test use a throwaway run directory.
const RUN = process.env.CVS_RUN_DIR ?? join(ROOT, '.omc', 'run');
const MANIFEST = join(RUN, 'manifest.json');
const REPO = 'Vet-Group/creative-video-studio';

const run: Run = (cmd, args, stdin) =>
  new Promise((resolve) => {
    // lark-cli is an npm .cmd shim on Windows, which only resolves through a shell; no argument here contains spaces.
    const p = spawn(cmd, args, { stdio: [stdin ? 'pipe' : 'ignore', 'ignore', 'inherit'], shell: process.platform === 'win32' });
    p.on('error', () => resolve({ code: 127 }));
    p.on('close', (code) => resolve({ code: code ?? 1 }));
    if (stdin) p.stdin?.end(stdin);
  });

const ci = async (repo: string, sha: string): Promise<CiStatus> => {
  const r = spawnSync('gh', ['api', `repos/${repo}/commits/${sha}/check-runs`, '--jq', '[.check_runs[].conclusion]'], { encoding: 'utf8' });
  if (r.status !== 0) return 'missing';
  const c = JSON.parse(r.stdout || '[]') as (string | null)[];
  if (!c.length) return 'missing';
  if (c.some((x) => x === null)) return 'pending';
  return c.every((x) => x === 'success' || x === 'skipped') ? 'success' : 'failure';
};

function step(m: Manifest, id: string | undefined) {
  const s = m.steps.find((x) => x.id === id);
  if (!s) throw new Error(`unknown step ${id}`);
  return s;
}

function render(m: Manifest): void {
  writeFileSync(join(RUN, 'progress.md'), renderProgress(m));
  writeFileSync(join(RUN, 'runlog.md'), renderRunLog(m));
  writeFileSync(join(RUN, 'evidence.md'), renderEvidence(m));
}

function save(m: Manifest): void {
  writeManifest(MANIFEST, m);
  render(m);
}

function haltOnGuardChange(m: Manifest): void {
  const changed = changedGuards(m, ROOT);
  if (changed.length) {
    console.error(`HARD STOP 2: guard files changed: ${changed.join(', ')}`);
    process.exit(3);
  }
}

const [cmd, ...rest] = process.argv.slice(2);
const { values, positionals } = parseArgs({
  args: rest,
  allowPositionals: true,
  options: { agent: { type: 'string' }, model: { type: 'string' }, evidence: { type: 'string' }, pid: { type: 'string' }, started: { type: 'string' }, force: { type: 'boolean' }, 'proc-started': { type: 'string' }, owner: { type: 'string' } },
});
const now = new Date();

/** A step the owner closes (M.7b, C4) needs `--owner "<the owner's words>"`, which is kept as a note. */
function ownerOnly(id: string): void {
  if (!STEPS.find((d) => d.id === id)?.ownerDone) return;
  if (!values.owner) {
    console.error(`${id} is closed only on the owner's word (C4 sign-off): leave it doing and notify the owner.`);
    process.exit(2);
  }
  values.evidence = JSON.stringify([...(JSON.parse(values.evidence ?? '[]') as Evidence[]), { kind: 'note', text: `owner: ${values.owner}` }]);
}

switch (cmd) {
  case 'approve': {
    if (!matchesPreapproval(positionals.join(' '))) {
      console.error('Câu duyệt không khớp. Chép nguyên văn câu mà `pnpm preflight` in ra.');
      process.exit(2);
    }
    const pf = join(RUN, 'preflight.json');
    if (!existsSync(pf)) throw new Error('run `pnpm preflight` first');
    const preflight = JSON.parse(readFileSync(pf, 'utf8')) as { checkedAt: string; results: ItemResult[]; skipped: Record<string, string> };
    const skipped = new Map(Object.entries(preflight.skipped));
    const specs = join(ROOT, '.omc', 'specs');
    const criteria = [
      ...parseCriteria('base', readFileSync(join(specs, 'deep-interview-creative-video-studio.md'), 'utf8')),
      ...parseCriteria('cost', readFileSync(join(specs, 'deep-interview-cvs-cost-attribution.md'), 'utf8')),
      ...parseCriteria('auto', readFileSync(join(specs, 'deep-interview-cvs-autonomous-run.md'), 'utf8')),
    ];
    let m: Manifest;
    if (existsSync(MANIFEST)) {
      m = readManifest(MANIFEST);
      renewManifest(m, initManifest({ preflight: { checkedAt: preflight.checkedAt, results: preflight.results }, skipped, criteria }));
    } else {
      m = initManifest({ preflight, skipped, criteria });
    }
    approve(m, PREAPPROVAL_SENTENCE, now);
    m.ownerOpenId = ownerOpenId(process.env);
    m.guardHashes = Object.fromEntries(guardFiles(ROOT).map((f) => [f, sha256(join(ROOT, f))]));
    save(m);
    console.log(`Đã ghi câu duyệt (hết hạn ${m.preapproval!.expiresAt}). ${m.steps.filter((s) => s.status === 'skipped').length} bước bị bỏ qua.`);
    break;
  }
  case 'heartbeat': {
    const m = readManifest(MANIFEST);
    haltOnGuardChange(m);
    m.heartbeat = now.toISOString();
    const expired = expireSteps(m, now);
    save(m);
    if (expired.length) console.log(`stuck by timeout: ${expired.join(', ')}`);
    break;
  }
  case 'ready':
    console.log(JSON.stringify(readySteps(readManifest(MANIFEST)).map((s) => ({ id: s.id, worktree: s.worktree, title: s.title }))));
    break;
  case 'start': {
    const m = readManifest(MANIFEST);
    const s = step(m, positionals[0]);
    if (!readySteps(m).includes(s)) throw new Error(`${s.id} is not ready`);
    s.status = 'doing';
    s.startedAt = now.toISOString();
    m.agentLog.push({ at: s.startedAt, step: s.id, agent: values.agent ?? 'unknown', model: values.model ?? 'unknown', worktree: s.worktree });
    save(m);
    break;
  }
  case 'done': {
    const m = readManifest(MANIFEST);
    const s = step(m, positionals[0]);
    ownerOnly(s.id);
    s.evidence.push(...(JSON.parse(values.evidence ?? '[]') as Evidence[]));
    s.status = 'done';
    s.reason = undefined;
    save(m);
    break;
  }
  case 'fail':
  case 'skip': {
    const m = readManifest(MANIFEST);
    const s = step(m, positionals[0]);
    const reason = positionals.slice(1).join(' ');
    if (!reason) throw new Error('a reason is required');
    if (cmd === 'fail') recordFailure(s, reason);
    else {
      ownerOnly(s.id);
      s.evidence.push(...(JSON.parse(values.evidence ?? '[]') as Evidence[]));
      Object.assign(s, { status: 'skipped', reason });
    }
    save(m);
    console.log(`${s.id}: ${s.status}${s.status === 'stuck' ? ' (3 attempts used)' : ''}`);
    break;
  }
  case 'render':
    render(readManifest(MANIFEST));
    break;
  case 'verify': {
    const { errors, summary } = await verify(readManifest(MANIFEST), ROOT, ci);
    console.log(summary);
    for (const e of errors) console.log(`  ✗ ${e}`);
    process.exit(errors.length ? 1 : 0);
  }
  case 'notify': {
    const m = readManifest(MANIFEST);
    render(m);
    const lark = await sendLark(m, renderLark(m, positionals.join(' ') || 'cập nhật'), run);
    const issue = await updateRunLog(m, REPO, join(RUN, 'runlog.md'), run);
    console.log(`lark ${lark ? 'sent' : 'failed'}, run log ${issue ? 'updated' : 'not updated'}`);
    break;
  }
  case 'guard-check': {
    if (!existsSync(MANIFEST)) {
      console.error('no run manifest: the run has not been approved');
      process.exit(3);
    }
    const m = readManifest(MANIFEST);
    haltOnGuardChange(m);
    if (!preapprovalValid(m, now)) {
      console.error('pre-approval missing or expired: spend, deploy and VET steps are blocked');
      process.exit(4);
    }
    break;
  }
  case 'lease-write':
    writeLease(join(RUN, 'conductor.lock'), { pid: Number(values.pid), startedAt: values.started ?? '' }, values.force);
    break;
  case 'should-relaunch': {
    if (!existsSync(MANIFEST)) {
      console.log('run not approved');
      process.exit(1);
    }
    const m = readManifest(MANIFEST);
    const ps = values['proc-started'];
    const d = shouldRelaunch({ heartbeat: m.heartbeat, lease: readLease(join(RUN, 'conductor.lock')), procStartedAt: ps && ps !== 'none' ? ps : null, now, finished: m.steps.find((s) => s.id === 'A.2')?.status === 'done' });
    console.log(d.why);
    process.exit(d.relaunch ? 0 : 1);
  }
  default:
    console.error('usage: see the header of scripts/run/cli.ts');
    process.exit(2);
}
