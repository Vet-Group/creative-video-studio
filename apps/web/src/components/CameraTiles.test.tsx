import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { CAMERA_ANGLES } from '@/lib/camera-angles';
import { ANGLE_GLYPHS, CameraTiles } from './CameraTiles';

const html = (picked: string[], lockedWhy: (a: (typeof CAMERA_ANGLES)[number]) => string | null = () => null) =>
  renderToStaticMarkup(<CameraTiles labelledBy="angles" picked={picked} lockedWhy={lockedWhy} onToggle={() => {}} />);
/** Each tile's markup, in the list's order. */
const tiles = (markup: string) => markup.split('<label').slice(1);

test('one checkbox tile per angle, named by its Vietnamese label, in a group named by the field', () => {
  const markup = html([]);
  expect(markup).toMatch(/^<div class="cam-tiles" role="group" aria-labelledby="angles">/);
  expect(tiles(markup)).toHaveLength(CAMERA_ANGLES.length);
  tiles(markup).forEach((t, i) => {
    expect(t).toContain('type="checkbox"');
    expect(t).toContain(`<span class="cam-name">${CAMERA_ANGLES[i]!.label}</span>`);
    // The shirt and the arrow are drawings beside the label: hidden from screen readers so the name stays the label alone.
    expect(t).toContain('<span class="cam-stage" aria-hidden="true">');
  });
});

test('every angle has its own arrow, the hint that stays when motion is off', () => {
  expect(CAMERA_ANGLES.map((a) => ANGLE_GLYPHS[a.id])).not.toContain(undefined);
  expect(new Set(CAMERA_ANGLES.map((a) => ANGLE_GLYPHS[a.id])).size).toBe(CAMERA_ANGLES.length);
});

test("a picked tile shows its clip's number in the order Run makes them, the list's order, whatever order they were picked in", () => {
  const [first, , third, fourth] = CAMERA_ANGLES;
  const markup = tiles(html([fourth!.id, first!.id, third!.id]));
  const order = markup.map((t) => /<span class="cam-order" aria-hidden="true">(\d)<\/span>/.exec(t)?.[1] ?? null);
  expect(order).toEqual(['1', null, '2', '3', null, null]);
  expect(markup.map((t) => t.includes('checked=""'))).toEqual([true, false, true, true, false, false]);
});

test('a locked angle is a disabled checkbox that says why on hover, and a picked one stays open to take off', () => {
  const [first, second] = CAMERA_ANGLES;
  const markup = tiles(html([first!.id], (a) => (a.id === first!.id ? null : 'Tối đa 4 góc máy.')));
  expect(markup[0]).not.toContain('disabled');
  expect(markup[1]).toContain('title="Tối đa 4 góc máy."');
  expect(markup[1]).toContain('disabled=""');
  expect(markup[1]).toContain(`data-move="${second!.id}"`);
});
