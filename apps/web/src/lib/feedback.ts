// Shared by the feedback board page, its detail page and the Admin triage controls: labels and the shapes the API returns. Client-safe (no pool).
import type { FeedbackKind, FeedbackStatus } from '@cvs/db';

export const KIND_LABEL: Record<FeedbackKind, string> = { feedback: 'Góp ý', bug: 'Báo lỗi', feature: 'Yêu cầu tính năng' };
export const STATUS_LABEL: Record<FeedbackStatus, string> = { new: 'Mới', reviewing: 'Đang xem', done: 'Đã xử lý', rejected: 'Từ chối' };

export const MAX_IMAGES = 20;
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
  /** The last time an Admin changed the status or the reply (the creation time until then). */
  updatedAt: string;
  /** The caller posted, voted for or commented on it, and the Admin changed it since the caller last opened it. */
  unread: boolean;
  /** The name of the item's workspace when it is not the caller's active one: only an Admin's triage sees those (docs/WORKSPACES.md, the feedback exception). */
  workspaceName: string | null;
}

export interface FeedbackComment {
  id: string;
  authorName: string;
  /** The author is an Admin, so the thread shows them as the technical team. */
  authorAdmin: boolean;
  body: string;
  mine: boolean;
  createdAt: string;
}

/** For the caller `$1`: they posted, voted for or commented on item `f`, and the Admin's last change (`updated_at`) is newer than when
 * they last opened it, or than their post or vote if they never did. A commenter has always opened it, as comments are written there. */
const UNREAD = `(f.updated_at > f.created_at
    and (f.user_id = $1 or exists(select 1 from feedback_votes v where v.feedback_id = f.id and v.user_id = $1)
         or exists(select 1 from feedback_comments c where c.feedback_id = f.id and c.user_id = $1))
    and f.updated_at > coalesce(
      (select r.seen_at from feedback_reads r where r.feedback_id = f.id and r.user_id = $1),
      case when f.user_id = $1 then f.created_at else (select v.created_at from feedback_votes v where v.feedback_id = f.id and v.user_id = $1) end))`;

/** How many items of workspace `$2` count as updated for the caller `$1`: the badge on the sidebar's feedback item for a member. */
export const FEEDBACK_UNREAD_COUNT = `select count(*)::int as n from feedback f where f.workspace_id = $2 and ${UNREAD}`;

/** Marks item `$1` as opened by user `$2` now. */
export const FEEDBACK_MARK_READ = `insert into feedback_reads (feedback_id, user_id) values ($1, $2)
  on conflict (feedback_id, user_id) do update set seen_at = now()`;

/** The columns, author name, workspace and vote/comment counts that toListed reads; `$1` is the caller, for `mine`, `voted` and `unread`. Shared by the list and detail routes and the board page. */
export const FEEDBACK_SELECT = `
  select f.id, f.kind, f.title, f.body, f.status, f.admin_note, f.image_asset_ids, f.created_at, f.updated_at,
    u.name as author_name, (f.user_id = $1) as mine,
    (select count(*)::int from feedback_votes v where v.feedback_id = f.id) as votes,
    exists(select 1 from feedback_votes v where v.feedback_id = f.id and v.user_id = $1) as voted,
    (select count(*)::int from feedback_comments c where c.feedback_id = f.id) as comments,
    coalesce(${UNREAD}, false) as unread, f.workspace_id, w.name as workspace_name
  from feedback f join users u on u.id = f.user_id join workspaces w on w.id = f.workspace_id`;

/** Shapes a `feedback` row (its columns joined with the author name and the vote/comment counts) into what the client reads; `workspaceId` is the caller's active one. */
export const toListed = (r: Record<string, unknown>, workspaceId: string): ListedFeedback => ({
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
  updatedAt: new Date(r.updated_at as string).toISOString(),
  unread: r.unread === true,
  workspaceName: r.workspace_id === workspaceId ? null : (r.workspace_name as string),
});

/** dd/mm/yyyy HH:mm in Vietnam time, how the board shows when something was posted. */
export const feedbackTime = (iso: string) =>
  new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso));

/** The item as Markdown for the technical team (an issue, a chat, Claude): no staff names, and images stay in the app behind its link. */
export function feedbackMarkdown(item: ListedFeedback, comments: FeedbackComment[], origin: string): string {
  const images = item.imageAssetIds.length > 0 ? ` · ${item.imageAssetIds.length} ảnh (xem trong app)` : '';
  const lines = [
    `## ${item.title}`,
    '',
    `- Loại: ${KIND_LABEL[item.kind]} · Trạng thái: ${STATUS_LABEL[item.status]} · Bình chọn: ${item.votes}`,
    `- Gửi lúc: ${feedbackTime(item.createdAt)}${images}`,
    `- Link: ${origin}/feedback/${item.id}`,
    '',
    item.body,
  ];
  if (item.adminNote) lines.push('', '### Phản hồi của đội kỹ thuật', '', item.adminNote);
  if (comments.length > 0)
    lines.push('', '### Bình luận', '', ...comments.map((c) => `- ${c.authorAdmin ? 'Đội kỹ thuật' : 'Thành viên'} (${feedbackTime(c.createdAt)}): ${c.body.replace(/\s*\n\s*/g, ' ')}`));
  return lines.join('\n');
}
