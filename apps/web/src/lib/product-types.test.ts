import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { isProductType, PRODUCT_TYPES } from './product-types';

test('the product types are the keys the database accepts, in the same order', () => {
  const sql = readFileSync(new URL('../../../../packages/db/migrations/0097_pod_templates.sql', import.meta.url), 'utf8');
  const list = /"examples_product_type_check" CHECK \("examples"\."product_type" in \(([^)]*)\)\)/.exec(sql)?.[1];
  expect(list?.split(', ').map((k) => k.replace(/^'|'$/g, ''))).toEqual(Object.keys(PRODUCT_TYPES));
});

test('only a known key is a product type', () => {
  expect(isProductType('mug')).toBe(true);
  for (const v of ['Mug', 'toString', '', null, undefined, 1]) expect(isProductType(v)).toBe(false);
});
