// Owner notifications (plan A.0): Lark DM to the one owner open_id from preflight, and the GitHub "Run log" issue.
import type { Manifest } from './manifest.ts';

export type Run = (cmd: string, args: string[], stdin?: string) => Promise<{ code: number }>;

/** Throws for any recipient other than the owner recorded in the manifest. */
export async function sendLark(m: Manifest, text: string, run: Run, to = m.ownerOpenId): Promise<boolean> {
  if (!m.ownerOpenId) throw new Error('no owner open_id in the manifest');
  if (to !== m.ownerOpenId) throw new Error('Lark messages go to the owner only');
  const r = await run('lark-cli', ['im', '+messages-send', '--user-id', to, '--as', 'bot', '--markdown', '-'], text);
  return r.code === 0;
}

export async function updateRunLog(m: Manifest, repo: string, bodyFile: string, run: Run): Promise<boolean> {
  if (!m.runLogIssue) return false;
  const r = await run('gh', ['issue', 'edit', String(m.runLogIssue), '--repo', repo, '--body-file', bodyFile]);
  return r.code === 0;
}
