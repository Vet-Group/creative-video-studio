// Global setup: `next dev` compiles a route on its first request, which can take longer than a spec's timeouts.
// Request every page and route once, signed out, so the specs run against compiled routes. The accounts and data are made by serve.ts.
const PAGES = ['/login', '/create', '/library', ...['users', 'teams', 'stores', 'settings', 'presets', 'report', 'costs', 'audit'].map((p) => `/admin/${p}`)];
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
  ...['users', 'teams', 'stores', 'settings', 'presets', 'report', 'report/csv', 'costs', 'costs/detail', 'costs/summary', 'costs/adjustments', 'invoices', 'rates/2026-01', 'audit'].map((p) => `/api/admin/${p}`),
  '/api/admin/users/warm-up',
  '/api/admin/teams/warm-up',
  '/api/admin/stores/warm-up',
  '/api/admin/presets/warm-up',
  '/api/admin/jobs/warm-up/store',
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
