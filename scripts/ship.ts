// pnpm ship [<PR number>] [--watch] [--dry-run] [--wait-idle <min>]: merge (optional), wait for CI, check prod is idle, back up, deploy and read back.
// See docs/ops/deploy.md, "Deploy when green". The steps live in ship-logic.ts.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { ship, ShipError } from './ship-logic.ts';

const root = fileURLToPath(new URL('../', import.meta.url)).replace(/[\\/]$/, '');

function parse() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { 'dry-run': { type: 'boolean', default: false }, watch: { type: 'boolean', default: false }, 'wait-idle': { type: 'string', default: '20' } },
  });
  const pr = positionals[0];
  if (positionals.length > 1 || (pr !== undefined && !/^[1-9]\d*$/.test(pr))) throw new ShipError('usage: pnpm ship [<PR number>] [--watch] [--dry-run] [--wait-idle <min>]');
  if (values.watch && pr === undefined) throw new ShipError('--watch needs a PR number');
  const waitIdleMin = Number(values['wait-idle']);
  if (!(waitIdleMin >= 0)) throw new ShipError('--wait-idle needs a number of minutes');
  return { pr: pr === undefined ? null : Number(pr), dryRun: values['dry-run'], watch: values.watch, waitIdleMin };
}

try {
  await ship(parse(), {
    run: (cmd, args, opts) => {
      const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', stdio: opts?.stream ? 'inherit' : 'pipe', timeout: opts?.stream ? undefined : 180_000 });
      return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? r.error?.message ?? '' };
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => new Date(),
    log: (line) => console.log(line),
    env: process.env,
    root,
  });
} catch (e) {
  if (!(e instanceof ShipError)) throw e;
  console.error(`[${new Date().toISOString()}] FAILED: ${e.message}`);
  process.exit(1);
}
