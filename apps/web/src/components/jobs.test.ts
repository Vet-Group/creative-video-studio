import { describe, expect, it } from 'vitest';
import { roleOf } from './jobs';

describe('roleOf', () => {
  it('sends UGC and Review photos to the model, then the product', () => {
    for (const format of [null, undefined, 'review']) expect([0, 1].map((n) => roleOf('marketing', n, { format }))).toEqual(['model', 'product']);
  });

  it("sends an Unboxing job's photos to the slots its roles name, in the order sent", () => {
    const roles = 'model,product,packaging';
    expect([0, 1, 2].map((n) => roleOf('marketing', n, { format: 'unboxing', roles }))).toEqual(['model', 'product', 'packaging']);
    expect([0, 1].map((n) => roleOf('marketing', n, { format: 'unboxing', roles: 'product,packaging' }))).toEqual(['product', 'packaging']);
    expect(roleOf('marketing', 0, { format: 'unboxing', roles: 'product' })).toBe('product');
  });

  it('keeps an Unboxing photo with no roles (a sample) and every Advanced photo a plain input', () => {
    expect(roleOf('marketing', 0, { format: 'unboxing' })).toBe('input');
    expect(roleOf('marketing', 3, { format: 'unboxing', roles: 'product' })).toBe('input');
    expect(roleOf('marketing', 1, { format: 'advanced' })).toBe('input');
    expect(roleOf('video', 0, {})).toBe('input');
  });

  it('keeps Try On photos as before', () => {
    expect([0, 1, 2, 3].map((n) => roleOf('try_on', n, { garments: 2 }))).toEqual(['model', 'garment', 'garment', 'background']);
  });
});
