// Where a person stands on the Admin Usage page (/admin/usage). Pure: the page shows the labels in the browser and the CSV writes them.

/** Each status with its badge text, in the order a team lists its people. */
export const USAGE_STATUS = {
  using: 'Có dùng trong khoảng',
  lapsed: 'Ngưng trước khoảng',
  idle: 'Đã vào, chưa tạo',
  never: 'Chưa đăng nhập',
} as const;
export type UsageStatus = keyof typeof USAGE_STATUS;

/** A job or video analysis in the period; else one outside it; else a sign-in with nothing made; else no sign-in seen. */
export function usageStatus(p: { jobs: number; analyses: number; lastUsedAt: unknown; lastSeenAt: unknown }): UsageStatus {
  if (p.jobs + p.analyses > 0) return 'using';
  if (p.lastUsedAt) return 'lapsed';
  return p.lastSeenAt ? 'idle' : 'never';
}
