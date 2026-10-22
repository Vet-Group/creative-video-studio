// The run manifest: the single source of truth of the autonomous run (plan A.0). Only the conductor writes it.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PREAPPROVAL_DAYS } from './preapproval.ts';
import type { ItemResult } from './preflight.ts';
import { STEPS } from './steps.ts';

export type StepStatus = 'pending' | 'doing' | 'done' | 'stuck' | 'skipped';
export type Evidence =
  | { kind: 'ci'; repo: string; sha: string }
  | { kind: 'file'; path: string; sha256: string }
  | { kind: 'log'; path: string; exitCode: number }
  | { kind: 'note'; text: string };

export interface Step {
  id: string;
  title: string;
  deps: string[];
  soft: string[];
  worktree: string;
  status: StepStatus;
  attempts: number;
  evidence: Evidence[];
  reason?: string;
  agent?: string;
  spendUsd: number;
  startedAt?: string;
  timeoutMin: number;
}

export interface Criterion {
  id: string;
  text: string;
  status: 'open' | 'done' | 'skipped' | 'stuck' | 'partial';
  evidence: Evidence[];
  reason?: string;
}

export interface Manifest {
  version: 1;
  preapproval?: { sentence: string; at: string; expiresAt: string };
  preflight?: { checkedAt: string; results: ItemResult[] };
  ownerOpenId?: string;
  runLogIssue?: number;
  heartbeat?: string;
  guardHashes: Record<string, string>;
  steps: Step[];
  criteria: Criterion[];
  agentLog: { at: string; step: string; agent: string; model: string; worktree: string }[];
}

export const MAX_ATTEMPTS = 3;
const HISTORY_KEEP = 20;

/** The 71 evidence rows: AC lines of the three specs, read at init. */
export function parseCriteria(prefix: string, markdown: string): Criterion[] {
  return [...markdown.matchAll(/^- \[ \] (\d+)\. (.+)$/gm)].map((m) => ({ id: `${prefix}-${m[1]}`, text: m[2]!.trim(), status: 'open' as const, evidence: [] }));
}

export function initManifest(opts: { preflight: { checkedAt: string; results: ItemResult[] }; skipped: Map<string, string>; criteria: Criterion[] }): Manifest {
  const steps: Step[] = [];
  for (const d of STEPS) {
    const soft = d.soft ?? [];
    const hardSkip = d.deps.find((dep) => !soft.includes(dep) && steps.find((s) => s.id === dep)?.status === 'skipped');
    const reason = opts.skipped.get(d.id) ?? (hardSkip ? `dependency ${hardSkip} skipped` : undefined);
    steps.push({ id: d.id, title: d.title, deps: d.deps, soft, worktree: d.worktree, status: reason ? 'skipped' : 'pending', attempts: 0, evidence: [], reason, spendUsd: 0, timeoutMin: d.timeoutMin ?? 60 });
  }
  return { version: 1, preflight: opts.preflight, guardHashes: {}, steps, criteria: opts.criteria, agentLog: [] };
}

/** Schema and evidence rules. An empty list means valid. */
export function validate(m: Manifest): string[] {
  const errors: string[] = [];
  const ids = new Set(m.steps.map((s) => s.id));
  for (const s of m.steps) {
    for (const d of s.deps) if (!ids.has(d)) errors.push(`${s.id}: unknown dependency ${d}`);
    if (s.status === 'done' && !s.evidence.some((e) => e.kind !== 'note')) errors.push(`${s.id}: done without evidence`);
    if ((s.status === 'skipped' || s.status === 'stuck') && !s.reason) errors.push(`${s.id}: ${s.status} without a reason`);
    if (s.attempts > MAX_ATTEMPTS) errors.push(`${s.id}: ${s.attempts} attempts exceeds ${MAX_ATTEMPTS}`);
  }
  for (const c of m.criteria) {
    if (c.status === 'done' && !c.evidence.some((e) => e.kind !== 'note')) errors.push(`${c.id}: done without evidence`);
    if (c.status !== 'done' && c.status !== 'open' && !c.reason) errors.push(`${c.id}: ${c.status} without a reason`);
  }
  return errors;
}

const resolved = (s: Step | undefined) => s?.status === 'done' || s?.status === 'skipped';

/** Steps the conductor may start now. */
export function readySteps(m: Manifest): Step[] {
  return m.steps.filter((s) => s.status === 'pending' && s.deps.every((d) => resolved(m.steps.find((x) => x.id === d))));
}

/** `doing` steps past their timeout become `stuck` (plan A.0: heartbeat is separate from progress). */
export function expireSteps(m: Manifest, now: Date): string[] {
  const expired: string[] = [];
  for (const s of m.steps) {
    if (s.status === 'doing' && s.startedAt && now.getTime() - Date.parse(s.startedAt) > s.timeoutMin * 60_000) {
      s.status = 'stuck';
      s.reason = `no progress for ${s.timeoutMin} min`;
      expired.push(s.id);
    }
  }
  return expired;
}

/** Record a failed attempt; the 4th failure is refused and the step is stuck instead (plan A.1, 3-attempt rule). */
export function recordFailure(s: Step, reason: string): void {
  s.attempts += 1;
  if (s.attempts >= MAX_ATTEMPTS) {
    s.status = 'stuck';
    s.reason = `${MAX_ATTEMPTS} attempts failed: ${reason}`;
  } else {
    s.status = 'pending';
    s.reason = reason;
  }
}

export function approve(m: Manifest, sentence: string, now: Date): void {
  m.preapproval = { sentence, at: now.toISOString(), expiresAt: new Date(now.getTime() + PREAPPROVAL_DAYS * 86_400_000).toISOString() };
}

export function preapprovalValid(m: Manifest, now: Date): boolean {
  return !!m.preapproval && now.getTime() < Date.parse(m.preapproval.expiresAt);
}

export function readManifest(path: string): Manifest {
  return JSON.parse(readFileSync(path, 'utf8')) as Manifest;
}

/** Atomic write (temp file, then rename) that keeps the last 20 versions in history/. Refuses an invalid manifest. */
export function writeManifest(path: string, m: Manifest, now = new Date()): void {
  const errors = validate(m);
  if (errors.length) throw new Error(`invalid manifest:\n${errors.join('\n')}`);
  const dir = dirname(path);
  const history = join(dir, 'history');
  mkdirSync(history, { recursive: true });
  if (existsSync(path)) {
    writeFileSync(join(history, `manifest-${now.toISOString().replace(/[:.]/g, '-')}.json`), readFileSync(path));
    const old = readdirSync(history).filter((f) => f.startsWith('manifest-')).sort();
    for (const f of old.slice(0, Math.max(0, old.length - HISTORY_KEEP))) rmSync(join(history, f));
  }
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(m, null, 2)}\n`);
  renameSync(tmp, path);
}

export function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** Guard files are immutable during the run (plan A.0); returns the files whose hash changed. */
export function changedGuards(m: Manifest, root: string): string[] {
  return Object.entries(m.guardHashes)
    .filter(([f, h]) => !existsSync(join(root, f)) || sha256(join(root, f)) !== h)
    .map(([f]) => f);
}

/** Committed guard files. Local-only ones (agent settings and launcher) are listed in LOCAL_GUARD_LIST, which guards itself. */
export const LOCAL_GUARD_LIST = 'scripts/run/local-guards.txt';
export const GUARD_FILES = [
  LOCAL_GUARD_LIST,
  'scripts/run/vet.sh',
  'scripts/run/install-gate-key.sh',
  'scripts/run/remove-gate-key.sh',
  'scripts/run/relay.ps1',
  'scripts/run/watchdog.ps1',
  'deploy/linux/cvs-run-gate',
  '.githooks/pre-push',
  '.gitleaks.toml',
  'package.json',
];

/** Committed guards plus the local list's entries, skipping files that do not exist. */
export function guardFiles(root: string): string[] {
  const list = join(root, LOCAL_GUARD_LIST);
  const local = existsSync(list) ? readFileSync(list, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')) : [];
  return [...new Set([...GUARD_FILES, ...local])].filter((f) => existsSync(join(root, f)));
}

export function counts(m: Manifest): Record<string, number> {
  const c: Record<string, number> = {};
  for (const x of m.criteria) c[x.status] = (c[x.status] ?? 0) + 1;
  return c;
}

const icon: Record<string, string> = { pending: '·', doing: '▶', done: '✓', stuck: '✗', skipped: '–', open: '·', partial: '~' };

export function renderProgress(m: Manifest): string {
  const rows = m.steps.map((s) => `| ${icon[s.status]} ${s.id} | ${s.title} | ${s.status} | ${s.attempts} | ${s.reason ?? ''} |`);
  return ['# Run progress', '', `Heartbeat: ${m.heartbeat ?? 'none'}`, '', '| Step | Title | Status | Attempts | Note |', '|---|---|---|---|---|', ...rows, ''].join('\n');
}

const evidenceText = (e: Evidence) =>
  e.kind === 'ci' ? `CI ${e.repo}@${e.sha.slice(0, 7)}` : e.kind === 'file' ? `${e.path} (sha256 ${e.sha256.slice(0, 10)})` : e.kind === 'log' ? `${e.path} (exit ${e.exitCode})` : e.text;

export function renderEvidence(m: Manifest): string {
  const c = counts(m);
  const rows = m.criteria.map((x) => `| ${x.id} | ${x.text.replace(/\|/g, '\\|').slice(0, 140)} | ${x.status} | ${x.evidence.map(evidenceText).join('; ') || x.reason || ''} |`);
  return [
    '# Evidence table',
    '',
    `Rows: ${m.criteria.length}. Done ${c.done ?? 0}, partial ${c.partial ?? 0}, skipped ${c.skipped ?? 0}, stuck ${c.stuck ?? 0}, open ${c.open ?? 0}.`,
    '',
    '| Criterion | Text | Status | Evidence or reason |',
    '|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}

export function renderRunLog(m: Manifest): string {
  const stuck = m.steps.filter((s) => s.status === 'stuck');
  const spend = m.steps.reduce((t, s) => t + s.spendUsd, 0);
  return [
    renderProgress(m),
    `Provider spend so far: $${spend.toFixed(2)} of $40.`,
    '',
    stuck.length ? `Stuck: ${stuck.map((s) => `${s.id} (${s.reason})`).join(', ')}` : 'Stuck: none',
    '',
  ].join('\n');
}

/** Short Vietnamese status for the owner's Lark message. */
export function renderLark(m: Manifest, headline: string): string {
  const n = (st: StepStatus) => m.steps.filter((s) => s.status === st).length;
  return `Creative Video Studio — ${headline}\nXong ${n('done')}/${m.steps.length} bước, đang làm ${n('doing')}, kẹt ${n('stuck')}, bỏ qua ${n('skipped')}.`;
}
