// Fixed data for the screenshot specs: the Library and the job list are answered from here, and the media come from the fixture clips,
// so two runs paint the same pixels. Named .test.ts like support.test.ts so the English check treats UI strings as test data.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`../public/fixtures/examples/${name}`, import.meta.url)));

const clip = (n: number, ratio: '9:16' | '1:1', verdict: boolean) => ({
  id: `frozen-clip-${n}`,
  creator: { id: 'frozen-user', name: 'E2E Member 5' },
  createdAt: `2026-10-2${n}T03:00:00.000Z`,
  modelId: 'mock-e2e',
  modelLabel: 'Mock E2E',
  feature: 'video',
  ratio,
  durationSec: 5,
  isMock: true,
  videoAssetId: `frozen-video-${n}`,
  posterAssetId: `frozen-poster-${n}`,
  storeId: null,
  costUsd: '0.0000',
  costFinal: true,
  verdict: verdict ? { verdict: 'pass', fault: null, markedBy: 'frozen-user' } : null,
  canEdit: true,
  downloadName: `2026102${n}-e2e-member-5-0000000${n}.mp4`,
});

const job = {
  id: 'frozen-job-1',
  status: 'succeeded',
  feature: 'video',
  resolution: null,
  error: null,
  isMock: true,
  ratio: '9:16',
  durationSec: 5,
  modelId: 'mock-e2e',
  retryOf: null,
  retried: false,
  outputAssetId: 'frozen-video-1',
  posterAssetId: 'frozen-poster-1',
  createdAt: '2026-10-21T03:00:00.000Z',
  finishedAt: '2026-10-21T03:01:00.000Z',
  text: null,
  inputAssetIds: [],
  format: null,
  favorite: false,
};

/** Answers /api/library, /api/jobs?mine and the clip media from fixed data. Call before the first navigation. */
export async function freezeData(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date('2026-10-23T05:00:00.000Z'));
  await page.route(/\/api\/library(\?|$)/, (r) =>
    r.fulfill({ json: { hasMore: false, isAdmin: false, creators: [{ id: 'frozen-user', name: 'E2E Member 5' }], clips: [clip(1, '9:16', true), clip(2, '1:1', false), clip(3, '9:16', false)] } }),
  );
  // Other specs rename and switch presets, so the picker is answered from the seed labels.
  await page.route(/\/api\/presets$/, (r) =>
    r.fulfill({
      json: {
        presets: [
          { id: 'gentle-push-in', label: 'Tiến gần nhẹ nhàng' },
          { id: 'slow-orbit', label: 'Xoay quanh chậm' },
          { id: 'lifestyle-table', label: 'Đặt trên bàn đời thường' },
          { id: 'light-sweep', label: 'Ánh sáng quét nhẹ' },
          { id: 'floating-reveal', label: 'Sản phẩm bay lên' },
          { id: 'handheld-product', label: 'Cầm trên tay' },
        ],
      },
    }),
  );
  // The pass rate moves as other specs mark clips.
  await page.route(/\/api\/models\?/, (r) =>
    r.fulfill({
      json: {
        models: [{ id: 'mock-e2e', label: 'Mock E2E', isMock: true, ratios: ['9:16', '1:1'], durationsSec: [5, 8], maxImages: 4, estimateUsd: '0.8000', passRate: 0.8, passes: 8, total: 10, supported: true }],
        defaultModelId: 'mock-e2e',
        monthToDate: { usd: '0.0000', provisional: false },
      },
    }),
  );
  await page.route(/\/api\/jobs\?mine/, (r) => r.fulfill({ json: { jobs: [job], workerOffline: false } }));
  await page.route(/\/api\/assets\/frozen-(poster|video)-(\d)\/content/, (r) => {
    const [, kind, n] = /frozen-(poster|video)-(\d)/.exec(r.request().url())!;
    return kind === 'poster'
      ? r.fulfill({ body: fixture(`example-${n}.jpg`), contentType: 'image/jpeg' })
      : r.fulfill({ body: fixture(`example-${n}.mp4`), contentType: 'video/mp4' });
  });
}
