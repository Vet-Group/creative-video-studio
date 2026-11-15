import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { type PresetRow, PresetSections } from './PresetEditing';

const row = (id: string, group: PresetRow['group']): PresetRow => ({ id, label: id, group });
const card = (p: PresetRow) => <li key={p.id}>{p.label}</li>;
const render = (presets: PresetRow[], feature?: 'video' | 'image') => renderToStaticMarkup(<ul>{<PresetSections presets={presets} feature={feature} card={card} />}</ul>);
const headings = (html: string) => [...html.matchAll(/<h3[^>]*>([^<]*)<\/h3>/g)].map((m) => m[1]);

test('a picker shows one section per group that has presets, POD first, each a heading over its own list', () => {
  const html = render([row('walk', 'fashion'), row('orbit', 'product'), row('mug', 'pod'), row('tee', 'pod')]);
  expect(headings(html)).toEqual(['Sản phẩm POD', 'Sản phẩm chung', 'Người mẫu thời trang']);
  expect(html.match(/<li>[a-z]+<\/li>/g)).toEqual(['<li>mug</li>', '<li>tee</li>', '<li>orbit</li>', '<li>walk</li>']);
  expect(html).toMatch(/<h3 id="([^"]+)">Sản phẩm POD<\/h3><ul aria-labelledby="\1">/);
  expect(headings(render([row('walk', 'fashion'), row('mug', 'pod')]))).toEqual(['Sản phẩm POD', 'Người mẫu thời trang']); // an empty group is left out
  expect(headings(render([row('orbit', 'product'), row('mug', 'pod')], 'image'))).toEqual(['Sản phẩm POD', 'Phong cách chung']);
});

test('with a single group the cards stand alone, without a heading', () => {
  expect(render([row('orbit', 'product'), row('table', 'product')])).toBe('<ul><li>orbit</li><li>table</li></ul>');
});
