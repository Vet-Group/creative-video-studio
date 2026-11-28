import { type Browser, expect, test } from '@playwright/test';
import { signIn } from './support.test';
import { USERS } from './users';

// The composer bar of Image Generation holds still while the page loads: the rows that fill in late (the free-money line, the Recent button, the store picker)
// have their room from the first paint, and the phone layout is the first one a phone gets. Before, the page had the site's highest layout shift
// (0.056 at 1440, 0.039 at 390), every other page 0.006 or less.
const SHIFT_BUDGET = 0.01;
const RUNS = 3;
const PHONE_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

let joined: Promise<void> | undefined;
/** Moves the member into a billing team of its own (the Admin's API), so the page shows the free-money line as it does for a seller. */
function joinBillingTeam(browser: Browser): Promise<void> {
  joined ??= (async () => {
    const context = await browser.newContext();
    try {
      const admin = await context.newPage();
      await signIn(admin, 'admin');
      const { id } = (await (await admin.request.post('/api/admin/teams', { data: { name: `CLS E2E ${Date.now().toString(36)}` } })).json()) as { id: string };
      expect((await admin.request.patch(`/api/admin/teams/${id}`, { data: { billable: true, freeMonthlyUsd: '20' } })).ok()).toBe(true);
      const { users } = (await (await admin.request.get('/api/admin/users')).json()) as { users: { id: string; email: string }[] };
      const member = users.find((u) => u.email === USERS.clsimg.email)!;
      expect((await admin.request.patch(`/api/admin/users/${member.id}`, { data: { teamId: id } })).ok()).toBe(true);
    } finally {
      await context.close();
    }
  })();
  return joined;
}

for (const [name, viewport, colorScheme, userAgent] of [
  ['1440 light', { width: 1440, height: 900 }, 'light', undefined],
  ['390 dark', { width: 390, height: 844 }, 'dark', PHONE_AGENT],
] as const) {
  test(`Image Generation holds still while it loads at ${name}`, async ({ browser }) => {
    await joinBillingTeam(browser);
    const context = await browser.newContext({ viewport, colorScheme, userAgent });
    try {
      const page = await context.newPage();
      await signIn(page, 'clsimg');
      // What a member on prod has and the empty e2e account lacks: earlier prompts, stores and a remembered model; every answer comes after the page's first paint.
      const answers: Record<string, unknown> = {
        '/api/recent-prompts': { prompts: ['a red dress on a beach', 'a studio shot of a white shirt'] },
        '/api/stores': { stores: [{ id: 's1', name: 'Store One', code: 'S1', mine: true, assigned: true }, { id: 's2', name: 'Store Two', code: 'S2', mine: true }], canEdit: false },
        '/api/recall': { settings: { modelId: 'mock-image-e2e', ratio: '3:4', durationSec: null, resolution: '2K', audio: null, enhance: false, storeId: 's1', brand: true } },
      };
      await page.route('**/api/**', async (route) => {
        const { pathname } = new URL(route.request().url());
        await new Promise((resolve) => setTimeout(resolve, 400));
        return pathname in answers ? route.fulfill({ json: answers[pathname] }) : route.continue();
      });
      await page.addInitScript(() => {
        const w = window as unknown as { __shift: number; __moves: string[] };
        w.__shift = 0;
        w.__moves = [];
        new PerformanceObserver((list) => {
          for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean; startTime: number; sources: { node?: Element }[] }[]) {
            if (e.hadRecentInput) continue;
            w.__shift += e.value;
            if (e.value >= 0.001) w.__moves.push(`${e.value.toFixed(4)} at ${Math.round(e.startTime)} ms: ${e.sources.map((s) => (s.node instanceof Element ? `${s.node.tagName}.${s.node.className}` : 'text')).join(', ')}`);
          }
        }).observe({ type: 'layout-shift', buffered: true });
      });
      for (let run = 1; run <= RUNS; run++) {
        await page.goto('/image-generation');
        await expect(page.getByRole('button', { name: 'Tạo ảnh' }).first()).toBeVisible();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2500); // past the slowest late answer
        const { shift, moves } = await page.evaluate(() => {
          const w = window as unknown as { __shift: number; __moves: string[] };
          return { shift: w.__shift, moves: w.__moves };
        });
        console.log(`layout shift at ${name}, run ${run}: ${shift.toFixed(4)}`);
        expect(shift, `run ${run} moved: ${moves.join(' | ')}`).toBeLessThan(SHIFT_BUDGET);
      }
    } finally {
      await context.close();
    }
  });
}
