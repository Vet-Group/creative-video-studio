import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { navGroups } from '@/lib/sidebar';
import { Icon } from './Icon';

test('every sidebar icon draws only closed shapes when filled, so none renders blank or loses its inner mark', () => {
  const names = [...new Set(navGroups(true, 1, true).flatMap((g) => g.items.map((i) => i.icon)))];
  expect(names).toContain('chart');
  for (const name of names) {
    const d = /d="([^"]+)"/.exec(renderToStaticMarkup(<Icon name={name} filled />))![1]!;
    // A fill paints nothing for an open line (the old chart) and closes an open curve into a blob (the old help mark).
    expect(
      d.split(/(?=M)/).filter((s) => !/z\s*$/i.test(s.trim())),
      name,
    ).toEqual([]);
  }
});
