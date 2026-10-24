// pnpm run:verify — machine check of every evidence item (plan A.0, A.2). "Done" cannot be claimed past this.
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { changedGuards, counts, sha256, validate, type Evidence, type Manifest } from './manifest.ts';

export type CiStatus = 'success' | 'failure' | 'pending' | 'missing';

async function checkEvidence(e: Evidence, root: string, ci: (repo: string, sha: string) => Promise<CiStatus>): Promise<string | null> {
  switch (e.kind) {
    case 'ci': {
      const s = await ci(e.repo, e.sha);
      return s === 'success' ? null : `CI on ${e.sha.slice(0, 7)} is ${s}`;
    }
    case 'file': {
      // Bake-off inputs live outside the repo, so their evidence path is absolute.
      const p = isAbsolute(e.path) ? e.path : join(root, e.path);
      if (!existsSync(p)) return `${e.path} is missing`;
      return sha256(p) === e.sha256 ? null : `${e.path} changed since it was recorded`;
    }
    case 'log': {
      const p = isAbsolute(e.path) ? e.path : join(root, e.path);
      if (!existsSync(p)) return `${e.path} is missing`;
      // Logs written by the run end with "EXIT <code>".
      const last = readFileSync(p, 'utf8').trimEnd().split('\n').pop() ?? '';
      if (last !== `EXIT ${e.exitCode}`) return `${e.path} does not end with EXIT ${e.exitCode}`;
      return e.exitCode === 0 ? null : `${e.path} exited ${e.exitCode}`;
    }
    case 'note':
      return null;
  }
}

export async function verify(m: Manifest, root: string, ci: (repo: string, sha: string) => Promise<CiStatus>): Promise<{ errors: string[]; summary: string }> {
  const errors = validate(m);
  for (const f of changedGuards(m, root)) errors.push(`guard file changed: ${f}`);
  const items = [
    ...m.steps.filter((s) => s.status === 'done').map((s) => ({ id: s.id, evidence: s.evidence })),
    ...m.criteria.filter((c) => c.status === 'done' || c.status === 'partial').map((c) => ({ id: c.id, evidence: c.evidence })),
  ];
  for (const it of items) for (const e of it.evidence) {
    const err = await checkEvidence(e, root, ci);
    if (err) errors.push(`${it.id}: ${err}`);
  }
  for (const c of m.criteria) if (c.status === 'open') errors.push(`${c.id}: still open`);
  const n = counts(m);
  const summary = `criteria ${m.criteria.length}: done ${n.done ?? 0}, partial ${n.partial ?? 0}, skipped ${n.skipped ?? 0}, stuck ${n.stuck ?? 0}, open ${n.open ?? 0}`;
  return { errors, summary };
}
