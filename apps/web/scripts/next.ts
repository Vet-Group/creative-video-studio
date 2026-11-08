// Runs `next dev|start` with this checkout's .env loaded, so each worktree's CVS_WEB_PORT and app settings reach Next.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

try {
  process.loadEnvFile('../../.env');
} catch {
  // No .env file; the settings come from the environment.
}
const next = createRequire(import.meta.url).resolve('next/dist/bin/next');
// CVS_WEB_HOST (the prod unit sets 127.0.0.1) keeps the app off the LAN: only the tunnel reaches it, so cf-connecting-ip cannot be forged.
const host = process.env.CVS_WEB_HOST ? ['--hostname', process.env.CVS_WEB_HOST] : [];
const r = spawnSync(process.execPath, [next, process.argv[2] ?? 'dev', '--port', process.env.CVS_WEB_PORT ?? '3400', ...host], { stdio: 'inherit' });
process.exit(r.status ?? 1);
