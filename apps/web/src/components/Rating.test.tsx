import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';
import type { TrayJob } from '@/lib/api';
import { InlineRating, inlineRatingShows, newestResult, RatingForm } from './Rating';

// The member's jobs, newest first, as GET /api/jobs?mine lists them.
const jobs = [
  { id: 'running', feature: 'image', status: 'running' },
  { id: 'video', feature: 'video', status: 'succeeded' },
  { id: 'new', feature: 'image', status: 'succeeded' },
  { id: 'old', feature: 'image', status: 'succeeded' },
] as unknown as TrayJob[];
vi.mock('./jobs', async (orig) => ({ ...(await orig<typeof import('./jobs')>()), useJobs: () => ({ jobs }) }));

const job = (id: string) => jobs.find((j) => j.id === id)!;
const asks = { waited: true, due: true, newest: true, state: 'open' } as const;

describe('newestResult', () => {
  test('is the newest succeeded job of the card’s feature: a running job or another feature’s result does not count', () => {
    expect(newestResult(job('new'), jobs)).toBe(true);
    expect(newestResult(job('old'), jobs)).toBe(false);
    expect(newestResult(job('video'), jobs)).toBe(true);
    expect(newestResult(job('running'), jobs)).toBe(false);
  });
});

describe('inlineRatingShows', () => {
  test('asks under the newest result that arrived while its card was open, when the rating is due', () => {
    expect(inlineRatingShows(asks)).toBe(true);
  });

  test('stays hidden while GET /api/rating has not answered, and when it says the rating is not due (snoozed, rated, system or impersonated)', () => {
    expect(inlineRatingShows({ ...asks, due: null })).toBe(false);
    expect(inlineRatingShows({ ...asks, due: false })).toBe(false);
  });

  test('never asks under a result that was already there when the card first showed', () => {
    expect(inlineRatingShows({ ...asks, waited: false })).toBe(false);
  });

  test('moves to a newer result, unless the member has already picked a score here', () => {
    expect(inlineRatingShows({ ...asks, newest: false })).toBe(false);
    expect(inlineRatingShows({ ...asks, newest: false, state: 'picked' })).toBe(true);
  });

  test('goes once a score is sent anywhere (RATING_SENT_EVENT) or the row is snoozed, and keeps its own thanks', () => {
    expect(inlineRatingShows({ ...asks, state: 'gone' })).toBe(false);
    expect(inlineRatingShows({ ...asks, newest: false, state: 'thanks' })).toBe(true);
  });
});

test('nothing renders under a card before GET /api/rating says the rating is due', () => {
  expect(renderToStaticMarkup(<InlineRating job={job('new')} />)).toBe('');
});

test('the compact form is a labelled group of ten radio buttons with no scale ends and no Gửi until a score is picked', () => {
  const html = renderToStaticMarkup(<RatingForm compact onSent={() => undefined} />);
  expect(html).toContain('role="radiogroup" aria-label="Điểm hài lòng từ 1 đến 10"');
  expect(html.match(/type="radio"/g)).toHaveLength(10);
  expect(html).not.toContain('Rất không hài lòng');
  expect(html).not.toContain('Gửi');
  const full = renderToStaticMarkup(<RatingForm onSent={() => undefined} onLater={() => undefined} />);
  expect(full).toContain('Rất không hài lòng');
  expect(full).toContain('Để sau');
  expect(full).toContain('Gửi');
});
