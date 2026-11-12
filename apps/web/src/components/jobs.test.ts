import { describe, expect, it } from 'vitest';
import { elapsedLabel, resultHref, roleOf } from './jobs';

describe('resultHref', () => {
  it('opens a result in the Library and a failure on the page that made it', () => {
    expect(resultHref({ id: 'j1', status: 'succeeded', feature: 'try_on' })).toBe('/library?item=j1');
    expect(resultHref({ id: 'j2', status: 'failed', feature: 'try_on' })).toBe('/try-on');
    expect(resultHref({ id: 'j3', status: 'timed_out', feature: 'no_such_tool' })).toBe('/library');
  });
});

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

describe('elapsedLabel', () => {
  const at = '2026-11-12T10:00:00+07:00';
  const now = (min: number) => Date.parse(at) + min * 60_000;
  it('says how long an unfinished job has waited or run', () => {
    expect(elapsedLabel({ status: 'queued', createdAt: at }, now(0.5))).toBe('vừa gửi');
    expect(elapsedLabel({ status: 'queued', createdAt: at }, now(3))).toBe('đã chờ 3 phút');
    expect(elapsedLabel({ status: 'running', createdAt: at }, now(12))).toBe('đã chạy 12 phút');
    expect(elapsedLabel({ status: 'submitting', createdAt: at }, now(75))).toBe('đã chạy 1 giờ 15 phút');
  });
  it('says nothing once the job finished', () => {
    for (const status of ['succeeded', 'failed', 'failed_unknown', 'timed_out']) expect(elapsedLabel({ status, createdAt: at }, now(5))).toBeNull();
  });
});
