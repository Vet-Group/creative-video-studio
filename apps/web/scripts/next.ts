// Runs `next dev|start` with this checkout's .env loaded, so each worktree's CVS_WEB_PORT and app settings reach Next.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

try {
  process.loadEnvFile('../../.env');
} catch {
  // No .env file; the settings come from the environment.
}
const next = createRequire(import.meta.url).resolve('next/dist/bin/next');
const r = spawnSync(process.execPath, [next, process.argv[2] ?? 'dev', '--port', process.env.CVS_WEB_PORT ?? '3400'], { stdio: 'inherit' });
process.exit(r.status ?? 1);
