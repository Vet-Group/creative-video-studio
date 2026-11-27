import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { Icon } from '@/components/Icon';

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/apps' }));

import { AdminNav } from './AdminNav';

test('every Admin tab draws its own icon, and Apps no longer borrows the background remover wand', () => {
  const html = renderToStaticMarkup(<AdminNav />);
  const icons = [...html.matchAll(/<a [^>]*href="\/admin\/([a-z]+)"[^>]*>.*?<path d="([^"]+)"/g)].map((m) => [m[1], m[2]]);
  expect(icons.map(([slug]) => slug)).toContain('apps');
  expect(new Set(icons.map(([, d]) => d)).size).toBe(icons.length);
  const wand = /d="([^"]+)"/.exec(renderToStaticMarkup(<Icon name="wand" />))![1];
  expect(icons.find(([slug]) => slug === 'apps')![1]).not.toBe(wand);
});
