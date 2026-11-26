// The in-app satisfaction rating (1-10): when a member is asked, what a rating may hold and the shape of the Admin summary.

export const RATING_COMMENT_MAX = 1000;
/** A member is asked only after this many succeeded real jobs, so they have seen what the app makes. */
export const RATING_MIN_JOBS = 3;
/** Days after a rating before the prompt asks again (the Feedback page's block is always open). */
export const RATING_PAUSE_DAYS = 30;
/** Days the snooze button keeps the prompt away. */
export const RATING_SNOOZE_DAYS = 7;
export const RATING_SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
/** The comment's question by score, as Fash asks it: what to fix up to 6, what would make it a 10 at 7-8, what works at 9-10. */
export const ratingFollowUp = (score: number): string =>
  score <= 6 ? 'Chúng tôi nên cải thiện điều gì?' : score <= 8 ? 'Điều gì sẽ giúp bạn chấm 10 điểm?' : 'Bạn thích điều gì nhất?';
/** Fired on window when a rating is sent (the prompt card, the row under a result or the Feedback page), so the other places asking in the same page load go away. */
export const RATING_SENT_EVENT = 'cvs:rating-sent';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RatingState {
  system: boolean;
  succeededJobs: number;
  lastRatedAt: Date | null;
  snoozedUntil: Date | null;
}

/** One row per user: what `isRatingDue` needs. $1 is the user id. */
export const RATING_STATE_SQL = `select u.system, u.rating_snoozed_until as "snoozedUntil",
    (select count(*)::int from jobs j where j.user_id = u.id and j.status = 'succeeded' and not j.is_mock and j.deleted_at is null) as "succeededJobs",
    (select max(r.created_at) from ratings r where r.user_id = u.id) as "lastRatedAt"
  from users u where u.id = $1`;

/** The prompt is due for a real (non-system) user with enough succeeded real jobs, no rating in the last RATING_PAUSE_DAYS and no snooze still running. */
export function isRatingDue(s: RatingState, now: Date = new Date()): boolean {
  if (s.system || s.succeededJobs < RATING_MIN_JOBS) return false;
  if (s.lastRatedAt && now.getTime() - s.lastRatedAt.getTime() < RATING_PAUSE_DAYS * DAY_MS) return false;
  return !s.snoozedUntil || s.snoozedUntil.getTime() <= now.getTime();
}

/** The score and comment of a POST /api/rating body, or the reason it is refused. An empty comment becomes null. */
export function parseRating(body: unknown): { score: number; comment: string | null } | { error: string } {
  const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  if (!b || typeof b.score !== 'number' || !Number.isInteger(b.score) || b.score < 1 || b.score > 10) return { error: 'score must be an integer from 1 to 10' };
  if (b.comment !== undefined && b.comment !== null && typeof b.comment !== 'string') return { error: 'comment must be text' };
  const comment = typeof b.comment === 'string' ? b.comment.trim() : '';
  if (comment.length > RATING_COMMENT_MAX) return { error: `comment must be at most ${RATING_COMMENT_MAX} characters` };
  return { score: b.score, comment: comment || null };
}

/** GET /api/admin/ratings: the last `days` days of ratings. `average` and `highShare` (the share of scores 8 or more, 0 to 1) are null with no ratings. */
export interface AdminRatings {
  days: number;
  count: number;
  average: number | null;
  highShare: number | null;
  teams: { team: string; average: number; count: number }[];
  /** `workspace`: the rater's workspaces by name when they are in any but the company's (ratings reach the company from every workspace, docs/WORKSPACES.md), else null. */
  comments: { score: number; comment: string; team: string; workspace: string | null; createdAt: string }[];
}
