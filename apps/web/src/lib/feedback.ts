// Shared by the feedback board page, its detail page and the Admin triage controls: labels and the shapes the API returns. Client-safe (no pool).
import type { FeedbackKind, FeedbackStatus } from '@cvs/db';

export const KIND_LABEL: Record<FeedbackKind, string> = { feedback: 'Góp ý', bug: 'Báo lỗi', feature: 'Yêu cầu tính năng' };
export const STATUS_LABEL: Record<FeedbackStatus, string> = { new: 'Mới', reviewing: 'Đang xem', done: 'Đã xử lý', rejected: 'Từ chối' };

export const MAX_IMAGES = 4;
export const TITLE_MAX = 120;
export const BODY_MAX = 4000;
export const COMMENT_MAX = 2000;
export const NOTE_MAX = 4000;
/** One member cannot flood the board. */
export const FEEDBACK_HOURLY_LIMIT = 20;

/** A board item as the list and the detail return it. */
export interface ListedFeedback {
  id: string;
  kind: FeedbackKind;
  title: string;
  body: string;
  status: FeedbackStatus;
  adminNote: string | null;
  imageAssetIds: string[];
  authorName: string;
  mine: boolean;
  votes: number;
  voted: boolean;
  comments: number;
  createdAt: string;
}

export interface FeedbackComment {
  id: string;
  authorName: string;
  body: string;
  mine: boolean;
  createdAt: string;
}

/** The columns, author name and vote/comment counts that toListed reads; `$1` is the caller, for `mine` and `voted`. Shared by the list and detail routes and the board page. */
export const FEEDBACK_SELECT = `
  select f.id, f.kind, f.title, f.body, f.status, f.admin_note, f.image_asset_ids, f.created_at,
    u.name as author_name, (f.user_id = $1) as mine,
    (select count(*)::int from feedback_votes v where v.feedback_id = f.id) as votes,
    exists(select 1 from feedback_votes v where v.feedback_id = f.id and v.user_id = $1) as voted,
    (select count(*)::int from feedback_comments c where c.feedback_id = f.id) as comments
  from feedback f join users u on u.id = f.user_id`;

/** Shapes a `feedback` row (its columns joined with the author name and the vote/comment counts) into what the client reads. */
export const toListed = (r: Record<string, unknown>): ListedFeedback => ({
  id: r.id as string,
  kind: r.kind as FeedbackKind,
  title: r.title as string,
  body: r.body as string,
  status: r.status as FeedbackStatus,
  adminNote: (r.admin_note as string | null) ?? null,
  imageAssetIds: (r.image_asset_ids as string[]) ?? [],
  authorName: r.author_name as string,
  mine: r.mine === true,
  votes: Number(r.votes ?? 0),
  voted: r.voted === true,
  comments: Number(r.comments ?? 0),
  createdAt: new Date(r.created_at as string).toISOString(),
});

/** dd/mm/yyyy HH:mm in Vietnam time, how the board shows when something was posted. */
export const feedbackTime = (iso: string) =>
  new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso));
