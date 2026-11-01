// node scripts/run/scan-logs.ts [dir] — scans run logs for leaked values and stray VET access (plan A.0, hard stops 2 and 4).
// Exit 1 on any finding; findings name the file and the rule, never the matched value.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { secretValues } from './preflight.ts';

const PATTERNS: [string, RegExp][] = [
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ['Replicate token', /\br8_[A-Za-z0-9]{30,}\b/],
  ['AWS-style key id', /\bAKIA[0-9A-Z]{16}\b/],
  ['Slack/Lark-style bearer', /\bBearer [A-Za-z0-9._-]{30,}/],
];

export function scanText(name: string, text: string, secrets: string[]): string[] {
  const findings: string[] = [];
  for (const [rule, re] of PATTERNS) if (re.test(text)) findings.push(`${name}: ${rule}`);
  if (secrets.some((s) => text.includes(s))) findings.push(`${name}: a value from .env`);
  // vet.sh writes vet-*.log; an ssh/scp command line to the host in any other log means VET was reached another way.
  if (!/^vet-/.test(name) && /\b(ssh|scp|sftp)\b[^\n]*(vet-linux|vet-server-new|auto-System-Product-Name)/.test(text)) findings.push(`${name}: VET access outside vet.sh`);
  return findings;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = process.argv[2] ?? join(fileURLToPath(new URL('../../', import.meta.url)), '.omc', 'run', 'logs');
  const secrets = secretValues(process.env);
  const findings = walk(dir).flatMap((p) => scanText(p.slice(dir.length + 1), readFileSync(p, 'utf8'), secrets));
  for (const f of findings) console.log(`✗ ${f}`);
  console.log(findings.length ? `${findings.length} finding(s)` : 'logs clean');
  process.exit(findings.length ? 1 : 0);
}
