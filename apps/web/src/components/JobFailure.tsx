// What a job that did not finish says, in the tray and in a History card.
import { CANCELED_ERROR } from '@cvs/core/ledger';
import { useState } from 'react';
import { isBillingDisabled } from '@cvs/core/providers/vertex-billing-disabled';
import type { JobStatus, TrayJob } from '@/lib/api';
import { type FailureReason, providerRefusal, TWIN_REASONS } from '@/lib/job-failure';

/** A job its member canceled while it was queued: stored as failed with a marker, shown as canceled and never as an error. */
export const isCanceled = (job: TrayJob): boolean => job.status === 'failed' && job.error === CANCELED_ERROR;

const RETRYABLE: JobStatus[] = ['failed', 'failed_unknown', 'timed_out'];

/** The one manual retry, which sends the same inputs again: not offered once retried, for a retry itself, or when the provider refused the input image. */
export const canRetry = (job: TrayJob): boolean => RETRYABLE.includes(job.status) && !job.retried && !job.retryOf && !job.failureReason;

/** A job BytePlus refused for a real person or for its sound can be sent once to its fal twin (POST /api/jobs `onTwin`). */
export const canRetryOnTwin = (job: TrayJob): boolean => RETRYABLE.includes(job.status) && !job.retried && !job.retryOf && TWIN_REASONS.includes(job.failureReason as string) && !!job.twin;

/** The retry button's label and the confirmation's question for a twin run, with its price as the twin would book it. The twin of a BytePlus row is its fal row, and the
 * two may share a name (0078 dropped the provider suffix), so the text names fal. */
export const twinRetryText = (job: TrayJob) => ({
  button: `Chạy lại trên fal.ai`,
  ask: `Chạy lại lượt tạo này bằng ${job.twin!.label} trên fal.ai${job.failureReason === 'real_person' ? ' (nhận ảnh có người thật)' : ''} với giá khoảng $${job.twin!.estimateUsd}?`,
});

// What a Member reads about a job that did not finish; the raw error is for Admins.
const FAILURE_TEXT = (noun: string): Partial<Record<JobStatus, string>> => ({
  failed: `Không tạo được ${noun}. Hãy thử lại, hoặc đổi ảnh hay mô hình.`,
  failed_unknown: `Không rõ ${noun} đã được tạo hay chưa. Hãy thử lại.`,
  timed_out: `Việc tạo ${noun} mất quá nhiều thời gian. Hãy thử lại.`,
});
const REFUSAL_TEXT: Record<FailureReason, string> = {
  real_person: 'Mô hình này không nhận ảnh có người thật. Hãy dùng ảnh chỉ có sản phẩm, hoặc chọn mô hình khác.',
  sensitive_input: 'Ảnh bị nhà cung cấp từ chối vì nội dung nhạy cảm. Hãy đổi ảnh hoặc chọn mô hình khác.',
  output_audio: 'Âm thanh tạo ra bị nhà cung cấp chặn vì có thể vi phạm bản quyền. Hãy tắt âm thanh hoặc bỏ yêu cầu về nhạc trong mô tả rồi chạy lại.',
};

// Google closed the billing account behind Vertex; the worker has already moved new jobs off it (docs/ops/vertex-accounts.md).
const VERTEX_BILLING_TEXT = 'Vertex tạm ngưng do thanh toán Google Cloud. Hãy chọn lại mô hình (ứng dụng đã chuyển sang bản fal) rồi chạy lại.';

/** What a report of a failed job needs, on the clipboard (lobehub's error card copy): the job id and status for everyone, the raw error for an Admin only. */
function CopyFailure({ job, isAdmin }: { job: TrayJob; isAdmin: boolean }) {
  const [note, setNote] = useState('');
  const copy = () => {
    const text = [`Lượt tạo ${job.id} · ${job.status}`, isAdmin && job.error].filter(Boolean).join('\n');
    // No clipboard outside a secure context (the LAN address over http): say so rather than do nothing.
    if (!navigator.clipboard) return setNote('Không chép được.');
    void navigator.clipboard.writeText(text).then(
      () => setNote('Đã chép.'),
      () => setNote('Không chép được.'),
    );
  };
  return (
    <p className="job-failure-copy">
      <button type="button" className="notice-link" onClick={copy}>
        Chép thông tin lỗi
      </button>{' '}
      <span aria-live="polite">{note}</span>
    </p>
  );
}

/** The failure sentence for everyone; for an Admin the raw error too, folded under the provider's code when the input image was refused. */
export function JobFailureNote({ job, isAdmin }: { job: TrayJob; isAdmin: boolean }) {
  if (isCanceled(job)) return null;
  const text = job.failureReason ? REFUSAL_TEXT[job.failureReason] : isBillingDisabled(job.error) ? VERTEX_BILLING_TEXT : FAILURE_TEXT(job.resolution ? 'ảnh' : 'clip')[job.status];
  const refusal = job.failureReason ? providerRefusal(job.error) : null;
  return (
    <>
      {text && <p className="error">{text}</p>}
      {text && <CopyFailure job={job} isAdmin={isAdmin} />}
      {isAdmin &&
        job.error &&
        (refusal ? (
          <details className="muted">
            <summary>{refusal.detail}</summary>
            {job.error}
          </details>
        ) : (
          <p className="muted">{job.error}</p>
        ))}
    </>
  );
}
