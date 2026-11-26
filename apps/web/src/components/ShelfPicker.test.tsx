// The shelf picker's pure parts and its button's markup: which slots offer it, and how a product becomes a group of photo tiles.
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import type { ProductItem } from '@/lib/products';
import { offersShelf, ShelfPicker, shelfGroups } from './ShelfPicker';

const product = (id: string, name: string, photos: string[], storeName: string | null = null): ProductItem => ({
  id,
  name,
  storeId: storeName ? `store-${storeName}` : null,
  storeName,
  productType: null,
  photos: photos.map((p) => ({ id: p, filename: `${p}.png` })),
  createdAt: '2026-11-27T00:00:00.000Z',
});

test('the button is named "Từ kệ sản phẩm cho Sản phẩm", opens a dialog, shows its words and icon, and is disabled when asked', () => {
  const html = renderToStaticMarkup(<ShelfPicker name="Từ kệ sản phẩm cho Sản phẩm" taken={[]} onPick={() => undefined} />);
  expect(html).toContain('aria-label="Từ kệ sản phẩm cho Sản phẩm"');
  expect(html).toContain('title="Từ kệ sản phẩm cho Sản phẩm"');
  expect(html).toContain('aria-haspopup="dialog"');
  expect(html).toContain('class="link-button uploads-link"');
  expect(html).toContain('<span class="shelf-text">Từ kệ sản phẩm</span>');
  expect(html).not.toContain('disabled');
  expect(renderToStaticMarkup(<ShelfPicker name="x" taken={[]} disabled onPick={() => undefined} />)).toContain('disabled');
});

test('a closed picker reads nothing: no request goes out until it is opened', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  renderToStaticMarkup(<ShelfPicker name="x" taken={[]} onPick={() => undefined} />);
  expect(fetchSpy).not.toHaveBeenCalled();
  fetchSpy.mockRestore();
});

test('model and background slots do not offer the shelf; the product, garment and end-frame slots and a slot of no kind do', () => {
  expect([undefined, 'product', 'garment', 'end-frame', 'packaging', 'reference', 'video', 'image', 'illustration'].map((s) => offersShelf(s as never))).toEqual(Array(9).fill(true));
  expect([offersShelf('model'), offersShelf('background')]).toEqual([false, false]);
});

test('shelfGroups drops taken photos, skips a product left with none, keeps the order given, and titles a group by the name alone', () => {
  const picked: unknown[] = [];
  const groups = shelfGroups([product('p1', 'Áo', ['a', 'b', 'c']), product('p2', 'Cốc', ['d']), product('p3', 'Mũ', ['e', 'f'])], [{ id: 'b', filename: 'b.png' }, { id: 'd', filename: 'd.png' }], (img) => picked.push(img));
  expect(groups.map((g) => [g.title, g.tiles.map((t) => t.key)])).toEqual([['Áo', ['a', 'c']], ['Mũ', ['e', 'f']]]); // Cốc has only a taken photo
  groups[0]!.tiles[1]!.pick();
  expect(picked).toEqual([{ id: 'c', filename: 'c.png' }]); // one photo, as an upload hands it
  expect(groups[0]!.tiles[0]!.src).toBe('/api/assets/a/thumb');
  expect(groups[0]!.tiles[0]!.label).toBe('Dùng a.png của Áo');
});

test('a product named "Áo · Shop A" with no store and a product named "Áo" in store "Shop A" give two distinct group titles', () => {
  const groups = shelfGroups([product('p1', 'Áo · Shop A', ['a']), product('p2', 'Áo', ['b'], 'Shop A')], [], () => undefined);
  expect(groups.map((g) => g.title)).toEqual(['Áo · Shop A', 'Áo']);
  expect(new Set(groups.map((g) => g.title)).size).toBe(2);
});
