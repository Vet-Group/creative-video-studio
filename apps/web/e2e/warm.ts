// Global setup: `next dev` compiles a route on its first request, which can take longer than a spec's timeouts.
// Request every page and route once, signed out, so the specs run against compiled routes. The accounts and data are made by serve.ts.
const PAGES = ['/login', '/create', '/library'];
const ROUTES = [
  '/api/jobs?mine',
  '/api/jobs/warm-up',
  '/api/jobs/warm-up/verdict',
  '/api/library',
  '/api/models?ratio=9:16&durationSec=5',
  '/api/stores',
  '/api/assets',
  '/api/assets/warm-up',
  '/api/assets/warm-up/content',
  '/api/assets/warm-up/download',
];

export default async function warm(): Promise<void> {
  const base = process.env.APP_URL ?? 'http://localhost:3400';
  await fetch(`${base}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'nobody@e2e.test', password: 'warm-up-only' }),
  }).catch(() => null);
  for (const path of [...PAGES, ...ROUTES]) await fetch(`${base}${path}`, { redirect: 'manual' }).catch(() => null);
}
