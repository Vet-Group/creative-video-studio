import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import type { RemakeRow } from './RemakePanel';
import { YourRemakes } from './YourRemakes';

const row = (id: string, analysisId: string, status: RemakeRow['status'] = 'succeeded'): RemakeRow => ({ id, analysisId, productAssetId: `p-${analysisId}`, shots: [1], status, result: null, outputAssetId: null, costUsd: null, createdAt: '2026-11-13T00:00:00Z' });

test('lists the remakes of other analyses, each with a link back to its analysis and a delete once it is done', () => {
  const html = renderToStaticMarkup(<YourRemakes slug="smart-remake" exclude="a-open" initial={[row('r1', 'a-open'), row('r2', 'a-2'), row('r3', 'a-3', 'running')]} />);
  expect(html).toContain('Video của bạn');
  expect(html).toContain('href="/apps/smart-remake?analysis=a-2&amp;product=p-a-2"'); // the product comes back with its video
  expect(html).toContain('href="/apps/smart-remake?analysis=a-3&amp;product=p-a-3"');
  const purged = renderToStaticMarkup(<YourRemakes slug="smart-remake" initial={[{ ...row('r-9', 'a-9'), productAssetId: null }]} />);
  expect(purged).toContain('href="/apps/smart-remake?analysis=a-9"'); // a purged image leaves no product in the link
  expect(html).not.toContain('analysis=a-open'); // the open analysis' panel lists its own
  expect(html.match(/class="remake-item"/g)).toHaveLength(2);
  expect(html.match(/>Xoá<\/button>/g)).toHaveLength(1); // the running one has none
  expect(html).toContain('Đã xong 0/1 cảnh');
});

test('shows at most 10 remakes, and nothing at all when there are none to show', () => {
  const many = Array.from({ length: 12 }, (_, i) => row(`r${i}`, `a${i}`));
  expect(renderToStaticMarkup(<YourRemakes slug="smart-remake" initial={many} />).match(/class="remake-item"/g)).toHaveLength(10);
  expect(renderToStaticMarkup(<YourRemakes slug="smart-remake" initial={[]} />)).toBe('');
  expect(renderToStaticMarkup(<YourRemakes slug="smart-remake" exclude="a1" initial={[row('r1', 'a1')]} />)).toBe('');
});
