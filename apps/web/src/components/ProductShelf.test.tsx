// The shelf view's cards: both empty lines, the "<store> · <type>" line and the "create more angles" link.
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import type { ProductItem } from '@/lib/products';
import { ProductCards } from './ProductShelf';

const item = (over: Partial<ProductItem>): ProductItem => ({ id: 'p1', name: 'Áo thun mèo', storeId: 's1', storeName: 'Shop A', productType: 'tshirt', photos: [{ id: 'a1', filename: 'front.png' }, { id: 'a2', filename: 'back.png' }], createdAt: '2026-11-27T00:00:00.000Z', ...over });
const render = (products: ProductItem[], filtered = false) => renderToStaticMarkup(<ProductCards products={products} filtered={filtered} onEdit={() => undefined} onDelete={() => undefined} />).replaceAll('<!-- -->', '');

test('an empty shelf says how to fill it; an empty store filter points back at all stores', () => {
  expect(render([])).toContain('Chưa có sản phẩm nào. Bấm Thêm sản phẩm để lưu 2–4 ảnh của một sản phẩm cùng tên và cửa hàng.');
  expect(render([], true)).toContain('Chưa có sản phẩm nào của cửa hàng này. Chọn &quot;Tất cả cửa hàng&quot; để xem mọi sản phẩm.');
});

test('a card shows its photos, its name, "<store> · <type>" and the three actions, with Tạo thêm góc opening the multi-angle app on the first photo', () => {
  const html = render([item({})]);
  expect(html).toContain('<h2>Áo thun mèo</h2>');
  expect(html).toContain('Shop A · Áo thun');
  expect(html).toContain('href="/apps/multi-angle?image=a1"');
  expect(html.match(/<img /g)).toHaveLength(2);
  expect(html).toContain('src="/api/assets/a1/thumb"');
  for (const action of ['Tạo thêm góc cho Áo thun mèo', 'Sửa Áo thun mèo', 'Xoá Áo thun mèo']) expect(html).toContain(`aria-label="${action}"`);
});

test('a product with neither store nor type has no detail line, and one with no live photo has no Tạo thêm góc', () => {
  const bare = render([item({ storeId: null, storeName: null, productType: null })]);
  expect(bare).not.toContain('class="muted"');
  expect(bare).not.toContain(' · ');
  const none = render([item({ photos: [] })]);
  expect(none).not.toContain('Tạo thêm góc');
  expect(none).not.toContain('<img');
  expect(render([item({ productType: null })])).toContain('<p class="muted">Shop A</p>');
});
