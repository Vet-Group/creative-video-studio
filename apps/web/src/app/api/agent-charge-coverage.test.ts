// Every route that spends money calls agentPrecheck + agentCharge (lib/agent-access.ts), and the guard's confirm exemptions name only paid routes or
// the named non-money ones, so a new paid route or a new exemption cannot be added silently.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { CONFIRM_EXEMPT } from '@/lib/agent-access';

const API = fileURLToPath(new URL('.', import.meta.url));
const routes = (readdirSync(API, { recursive: true }) as string[]).filter((f) => f.endsWith(`${sep}route.ts`) || f === 'route.ts');
/** The URL pattern of a route file, e.g. `jobs/[id]/cancel/route.ts` -> `/api/jobs/[id]/cancel`. */
const patternOf = (file: string) => `/api/${relative(API, join(API, file)).split(sep).slice(0, -1).join('/')}`.replace(/\/$/, '');
const source = (pattern: string) => readFileSync(join(API, ...pattern.replace(/^\/api\/?/, '').split('/').filter(Boolean), 'route.ts'), 'utf8');
const SPENDS = /\breserve\(|\bcheckCaps\(|\bbookLlm\(|insert into (jobs|remakes|analyses|suggestion_runs)\b/;
const charges = (code: string) => /\bagentPrecheck\(/.test(code) && /\bagentCharge\(/.test(code);
/** The one route that spends through another: it builds a request to /api/jobs, whose helpers confirm and charge it. */
const DELEGATES: Record<string, string> = { '/api/custom-apps/[id]/run': "import { POST as createJob } from '@/app/api/jobs/route';" };

test('every spending route calls agentPrecheck and agentCharge', () => {
  const spending = routes.map(patternOf).filter((p) => SPENDS.test(source(p)));
  expect(spending.sort()).toEqual(['/api/analyses', '/api/jobs', '/api/remakes', '/api/suggestions']);
  for (const p of spending) expect([p, charges(source(p))]).toEqual([p, true]);
});

test('every confirm exemption is a paid route, the delegating custom app Run, or a named non-money write', () => {
  const known = new Set(routes.map(patternOf));
  for (const e of CONFIRM_EXEMPT) {
    expect([e.route, known.has(e.route)]).toEqual([e.route, true]);
    const code = source(e.route);
    expect([e.route, new RegExp(`export async function ${e.method}\\b`).test(code)]).toEqual([e.route, true]);
    if (e.reason === 'paid') expect([e.route, charges(code)]).toEqual([e.route, true]);
    else if (e.reason === 'delegates') expect([e.route, code.includes(DELEGATES[e.route] ?? '\0')]).toEqual([e.route, true]);
    else expect([e.route, e.reason, SPENDS.test(code)]).toEqual([e.route, e.reason, false]);
  }
  expect(CONFIRM_EXEMPT.map((e) => `${e.method} ${e.route} ${e.reason}`)).toEqual([
    'POST /api/assets upload',
    'POST /api/assets/presign-video upload',
    'POST /api/assets/finalize-video upload',
    'POST /api/jobs/[id]/cancel cancel',
    'POST /api/library/zip read',
    'POST /api/library/lookbook read',
    'POST /api/jobs paid',
    'POST /api/remakes paid',
    'POST /api/analyses paid',
    'POST /api/suggestions paid',
    'POST /api/custom-apps/[id]/run delegates',
  ]);
});
