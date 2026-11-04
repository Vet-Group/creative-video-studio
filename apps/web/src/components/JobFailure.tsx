// What a job that did not finish says, in the tray and in a History card.
import type { JobStatus, TrayJob } from '@/lib/api';
import { type FailureReason, inputRefusal } from '@/lib/job-failure';

const RETRYABLE: JobStatus[] = ['failed', 'failed_unknown', 'timed_out'];

/** The one manual retry, which sends the same inputs again: not offered once retried, for a retry itself, or when the provider refused the input image. */
export const canRetry = (job: TrayJob): boolean => RETRYABLE.includes(job.status) && !job.retried && !job.retryOf && !job.failureReason;

// What a Member reads about a job that did not finish; the raw error is for Admins.
const FAILURE_TEXT = (noun: string): Partial<Record<JobStatus, string>> => ({
  failed: `Không tạo được ${noun}. Hãy thử lại, hoặc đổi ảnh hay mô hình.`,
  failed_unknown: `Không rõ ${noun} đã được tạo hay chưa. Hãy thử lại.`,
  timed_out: `Việc tạo ${noun} mất quá nhiều thời gian. Hãy thử lại.`,
});
const REFUSAL_TEXT: Record<FailureReason, string> = {
  real_person: 'Mô hình này không nhận ảnh có người thật. Hãy dùng ảnh chỉ có sản phẩm, hoặc chọn mô hình khác.',
  sensitive_input: 'Ảnh bị nhà cung cấp từ chối vì nội dung nhạy cảm. Hãy đổi ảnh hoặc chọn mô hình khác.',
};

/** The failure sentence for everyone; for an Admin the raw error too, folded under the provider's code when the input image was refused. */
export function JobFailureNote({ job, isAdmin }: { job: TrayJob; isAdmin: boolean }) {
  const text = job.failureReason ? REFUSAL_TEXT[job.failureReason] : FAILURE_TEXT(job.resolution ? 'ảnh' : 'clip')[job.status];
  const refusal = job.failureReason ? inputRefusal(job.error) : null;
  return (
    <>
      {text && <p className="error">{text}</p>}
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
