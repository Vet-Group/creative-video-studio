// What a failed job says to a Member and to an Admin, and when its retry button is offered.
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import type { TrayJob } from '@/lib/api';
import { inputRefusal } from '@/lib/job-failure';
import { canRetry, canRetryOnTwin, JobFailureNote, twinRetryText } from './JobFailure';

const RAW =
  'byteplus submit: HTTP 400 {"error":{"code":"InputImageSensitiveContentDetected.PrivacyInformation","message":"The request failed because the input image \'content[1]\' may contain real person.","param":"content[1]","type":"BadRequest"}}';
const REAL_PERSON = 'Mô hình này không nhận ảnh có người thật. Hãy dùng ảnh chỉ có sản phẩm, hoặc chọn mô hình khác.';
const GENERIC = 'Không tạo được clip. Hãy thử lại, hoặc đổi ảnh hay mô hình.';

const job = (over: Partial<TrayJob>): TrayJob =>
  ({ id: 'j1', status: 'failed', error: null, failureReason: null, resolution: null, retryOf: null, retried: false, ...over }) as TrayJob;
const refused = (error: string) => job({ error, failureReason: inputRefusal(error)?.reason ?? null });

test('a Member sees the real-person sentence and not the raw error', () => {
  const html = renderToStaticMarkup(<JobFailureNote job={refused(RAW)} isAdmin={false} />);
  expect(html).toContain(REAL_PERSON);
  expect(html).not.toContain(GENERIC);
  expect(html).not.toContain('InputImageSensitiveContentDetected');
});

test('another input-image refusal gets the sensitive-content sentence', () => {
  const html = renderToStaticMarkup(<JobFailureNote job={refused(RAW.replace('.PrivacyInformation', '.Other'))} isAdmin={false} />);
  expect(html).toContain('Ảnh bị nhà cung cấp từ chối vì nội dung nhạy cảm. Hãy đổi ảnh hoặc chọn mô hình khác.');
});

test('an Admin sees the provider code and keeps the raw error folded under it', () => {
  const html = renderToStaticMarkup(<JobFailureNote job={refused(RAW)} isAdmin />);
  expect(html).toContain(REAL_PERSON);
  expect(html).toMatch(/<details[^>]*><summary>byteplus · InputImageSensitiveContentDetected\.PrivacyInformation<\/summary>byteplus submit: HTTP 400/);
  expect(html).not.toMatch(/<p class="muted">byteplus submit/);
});

test('any other failure keeps the generic sentence, and an Admin the raw error as before', () => {
  const html = renderToStaticMarkup(<JobFailureNote job={job({ error: 'boom' })} isAdmin />);
  expect(html).toContain(GENERIC);
  expect(html).toContain('<p class="muted">boom</p>');
  expect(renderToStaticMarkup(<JobFailureNote job={job({ error: 'boom' })} isAdmin={false} />)).not.toContain('boom');
});

test('Thử lại is offered for a failed job once, and never for a refused input image', () => {
  expect(canRetry(job({ error: 'boom' }))).toBe(true);
  expect(canRetry(job({ status: 'timed_out' }))).toBe(true);
  expect(canRetry(job({ retried: true }))).toBe(false);
  expect(canRetry(job({ retryOf: 'j0' }))).toBe(false);
  expect(canRetry(job({ status: 'succeeded' }))).toBe(false);
  expect(canRetry(refused(RAW))).toBe(false);
});

test('a job refused for a real person can go once to its fal twin, with the twin run priced in the question', () => {
  const twin = { label: 'Seedance 1.0 Pro', estimateUsd: '0.6200' };
  expect(canRetryOnTwin({ ...refused(RAW), twin })).toBe(true);
  expect(canRetryOnTwin({ ...refused(RAW), status: 'timed_out', twin })).toBe(true);
  expect(canRetryOnTwin(refused(RAW))).toBe(false); // no enabled twin
  expect(canRetryOnTwin({ ...refused(RAW), twin, retried: true })).toBe(false);
  expect(canRetryOnTwin({ ...refused(RAW), twin, retryOf: 'j0' })).toBe(false);
  expect(canRetryOnTwin({ ...refused(RAW), twin, status: 'succeeded' })).toBe(false);
  expect(canRetryOnTwin({ ...refused(RAW.replace('.PrivacyInformation', '.Other')), twin })).toBe(false); // another refusal is not a real person
  expect(canRetryOnTwin(job({ error: 'boom', twin }))).toBe(false);
  expect(twinRetryText({ ...refused(RAW), twin })).toEqual({ button: 'Chạy lại bằng Seedance 1.0 Pro', ask: 'Chạy lại lượt tạo này bằng Seedance 1.0 Pro với giá khoảng $0.6200?' });
});
