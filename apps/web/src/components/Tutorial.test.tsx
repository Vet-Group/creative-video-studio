import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, test, vi } from 'vitest';
import { Tutorial } from './About';

const samples = vi.hoisted(() => ({ pending: true, have: new Set<string>() }));
vi.mock('@/lib/use-samples', async (orig) => ({ ...(await orig<typeof import('@/lib/use-samples')>()), useSamples: () => samples.have, samplesPending: () => samples.pending }));

beforeEach(() => Object.assign(samples, { pending: true, have: new Set<string>() }));

test('a tutorial keeps its 16:9 box while the sample list loads, so the text below does not jump down when the video arrives', () => {
  expect(renderToStaticMarkup(<Tutorial name="tutorial-tour" title="Làm quen với CVS" />)).toBe('<figure class="about-video" aria-hidden="true"></figure>');
});

test('once the list is in, a tutorial shows its video, or nothing when it is not uploaded', () => {
  samples.pending = false;
  expect(renderToStaticMarkup(<Tutorial name="tutorial-tour" title="Làm quen với CVS" />)).toBe('');
  samples.have = new Set(['tutorial-tour.mp4']);
  const html = renderToStaticMarkup(<Tutorial name="tutorial-tour" title="Làm quen với CVS" />);
  expect(html).toContain('<video');
  expect(html).toContain('src="/api/samples/tutorial-tour.mp4"');
});
