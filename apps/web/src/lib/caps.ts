import type { CapRefusal } from '@cvs/core/limits';

/** A cap this high stands for "no cap": the owner sets $100,000 (or 100,000 clips, the most Settings takes) rather than a real limit. */
export const NO_CAP = 100_000;

/** Member-facing text for a Run or a Smart Remake a cap refused. */
export const CAP_MESSAGES: Record<CapRefusal, string> = {
  daily_clips: 'Bạn đã dùng hết số clip trong ngày hôm nay',
  monthly_usd: 'Đã hết ngân sách tháng của công ty',
  features_monthly_usd: 'Đã hết ngân sách tháng cho ảnh và ứng dụng',
  member_daily_usd: 'Bạn đã dùng hết hạn mức chi phí hôm nay',
  member_monthly_usd: 'Bạn đã dùng hết hạn mức chi phí tháng này',
};
