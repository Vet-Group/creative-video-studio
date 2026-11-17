import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { isProductType, PRODUCT_TYPES } from './product-types';

test('the product types are the keys the database accepts, in the same order', () => {
  // The newest migration that sets the check is what the database enforces.
  const dir = new URL('../../../../packages/db/migrations/', import.meta.url);
  const check = /"examples_product_type_check" CHECK \("examples"\."product_type" in \(([^)]*)\)\)/;
  const sql = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(new URL(f, dir), 'utf8')).findLast((s) => check.test(s));
  const list = sql && check.exec(sql)?.[1];
  expect(list?.split(', ').map((k) => k.replace(/^'|'$/g, ''))).toEqual(Object.keys(PRODUCT_TYPES));
});

test('only a known key is a product type', () => {
  expect(isProductType('mug')).toBe(true);
  for (const v of ['Mug', 'toString', '', null, undefined, 1]) expect(isProductType(v)).toBe(false);
});
