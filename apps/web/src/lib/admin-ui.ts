// Browser-side helpers shared by the Admin pages.
import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';
import { useTabReturn } from './use-tab-return';

/**
 * Loads a GET route, again whenever `path` changes or `reload` is called, and with `onTabReturn` when the tab comes back to the front (pages
 * that only show figures; a page with forms would lose what is being typed). `data` stays undefined until the first answer, so forms render after hydration.
 */
export function useFetch<T>(path: string, { onTabReturn = false } = {}) {
  const [data, setData] = useState<T>();
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let stale = false;
    api<T>(path).then(
      (r) => {
        if (stale) return;
        setData(r);
        setFailed(false);
      },
      () => !stale && setFailed(true),
    );
    return () => {
      stale = true;
    };
  }, [path, tick]);
  useTabReturn(() => onTabReturn && setTick((n) => n + 1));
  return { data, failed, reload: () => setTick((n) => n + 1) };
}

/** Each event the audit log records, by its code, with the words an Admin reads; the code stays as the filter's value and the label's title. */
export const AUDIT_ACTIONS: Record<string, string> = {
  'account.link': 'Liên kết đăng nhập', 'account.unlink': 'Huỷ liên kết đăng nhập', 'analysis.share': 'Chia sẻ video mẫu', 'analysis.unshare': 'Gỡ video mẫu', 'clip.delete': 'Xoá clip', 'cost.manual_adjustment': 'Điều chỉnh chi phí', 'example.add': 'Đưa lên Ví dụ', 'fashion_model.create': 'Lưu người mẫu AI', 'fashion_model.delete': 'Xoá người mẫu AI', 'fashion_model.update': 'Sửa người mẫu AI', 'example.order': 'Sắp xếp Ví dụ', 'example.remove': 'Gỡ khỏi Ví dụ', 'example.type': 'Đổi loại hàng của Ví dụ', 'feature_cap.update': 'Sửa hạn mức công cụ', 'invoice.enter': 'Nhập hóa đơn',
  'model.set_enabled': 'Bật/tắt mô hình', 'preset.create': 'Thêm mẫu', 'preset.update': 'Sửa mẫu', 'preset_proposal.approve': 'Duyệt đề xuất mẫu', 'preset_proposal.reject': 'Từ chối đề xuất mẫu', 'rate.update': 'Sửa tỉ giá', 'sample.delete': 'Xoá ảnh mẫu', 'sample.put': 'Tải ảnh mẫu', 'settings.update': 'Sửa cài đặt',
  'fal.switch': 'Chuyển fal sang tài khoản Team', 'store.create': 'Tạo cửa hàng', 'store.hide': 'Đóng hoặc mở lại cửa hàng', 'store.pause': 'Tạm dừng hoặc cho cửa hàng hoạt động lại', 'store.delete': 'Xoá cửa hàng', 'store.reassign': 'Đổi cửa hàng của clip', 'store.update': 'Sửa cửa hàng', 'store.brand': 'Sửa bộ nhận diện cửa hàng', 'team.create': 'Tạo nhóm', 'team.hide': 'Ẩn nhóm', 'team.rename': 'Đổi tên nhóm',
  'billing.close': 'Chốt tháng tính phí', 'billing.reopen': 'Mở lại tháng tính phí', 'billing.send': 'Gửi chi phí tháng cho kế toán', 'team.billing': 'Đổi tính phí của nhóm', 'team.stores': 'Đổi cửa hàng của nhóm', 'store.team': 'Đổi nhóm của cửa hàng',
  'user.ban': 'Khoá tài khoản', 'user.create': 'Tạo tài khoản', 'user.delete': 'Xoá tài khoản', 'user.password_change': 'Đổi mật khẩu', 'user.password_set': 'Đặt mật khẩu', 'user.profile_update': 'Sửa hồ sơ', 'user.role_change': 'Đổi vai trò',
  'user.sessions_revoke': 'Đăng xuất thiết bị khác', 'user.stores': 'Gán cửa hàng cho người dùng', 'user.team_change': 'Đổi nhóm', 'user.template_editor': 'Đổi quyền biên tập mẫu', 'user.system': 'Chuyển tài khoản vào hoặc ra khỏi nhóm hệ thống', 'user.outside_lark': 'Đánh dấu ngoài tổ chức Lark', 'user.developer': 'Đổi quyền nhà phát triển', 'user.impersonate_start': 'Bắt đầu đăng nhập thay người dùng', 'user.impersonate_stop': 'Thoát đăng nhập thay người dùng','user.two_factor_backup_codes': 'Tạo mã dự phòng 2 lớp', 'user.two_factor_disable': 'Tắt xác thực 2 lớp',
  'user.two_factor_enable': 'Bật xác thực 2 lớp', 'user.two_factor_failed': 'Nhập sai mã 2 lớp', 'user.unban': 'Mở khoá tài khoản', 'user.update': 'Sửa tài khoản', 'verdict.set': 'Chấm kết quả', 'vertex.switch_account': 'Chuyển tài khoản Vertex', 'vertex_account.update': 'Sửa tài khoản Vertex',
  'workspace.create': 'Tạo không gian làm việc', 'workspace.rename': 'Đổi tên không gian làm việc', 'workspace.disable': 'Tắt không gian làm việc', 'workspace.enable': 'Bật lại không gian làm việc', 'workspace.member_add': 'Thêm thành viên vào không gian',
  'workspace.member_remove': 'Xoá thành viên khỏi không gian', 'workspace.member_role': 'Đổi vai trò trong không gian', 'workspace.account_create': 'Tạo tài khoản cho không gian',
  'workspace.member_refused': 'Bị từ chối thêm thành viên',
};
export const auditLabel = (action: string): string => AUDIT_ACTIONS[action] ?? action;

/** Why an owner's add was refused (workspace.member_refused, lib/workspaces.ts addMember), as an Admin reads it; any other code shows as it is. */
const REFUSALS: Record<string, string> = {
  company_email: 'email thuộc tên miền công ty',
  email_taken: 'email đã có tài khoản',
  no_user: 'chưa có tài khoản hoặc là nhân viên',
  already_member: 'đã là thành viên của không gian',
};

/** An entry's new value as the log lists it: a refused add's reason in words (the raw value under the details keeps the code). */
export const auditNewValue = (action: string, v: unknown): unknown =>
  action === 'workspace.member_refused' && v && typeof v === 'object' ? { ...v, reason: REFUSALS[(v as { reason: string }).reason] ?? (v as { reason: string }).reason } : v;

/** An entry's target as an Admin reads it in the Overview: a sample's file name without the `sample:` prefix and the extension. */
export const auditTarget = (target: string): string => (target.startsWith('sample:') ? target.slice('sample:'.length).replace(/\.[a-z0-9]+$/i, '') : target);

/**
 * Collapses a run of consecutive entries (newest first) with the same action by the same actor, each within `gapMs` of the one before it, into the
 * run's newest entry with a `count`. shortcut: the actor is told apart by name only, an Overview of a few people; use the id if names can repeat.
 */
export function groupRecent<T extends { actorName: string; action: string; createdAt: string }>(entries: T[], gapMs = 5 * 60_000): (T & { count: number })[] {
  const out: (T & { count: number })[] = [];
  let last = 0;
  for (const e of entries) {
    const at = new Date(e.createdAt).getTime();
    const run = out[out.length - 1];
    if (run && run.actorName === e.actorName && run.action === e.action && last - at <= gapMs) run.count++;
    else out.push({ ...e, count: 1 });
    last = at;
  }
  return out;
}

/** The workspace routes' refusals (lib/workspaces.ts), which a workspace owner reads too, in words. */
const REASONS: Record<string, string> = {
  no_user: 'Chưa có tài khoản nào với email này. Đánh dấu “Tạo tài khoản mới” để tạo.',
  already_member: 'Người này đã là thành viên của không gian làm việc.',
  email_taken: 'Email này đã có tài khoản. Bỏ dấu “Tạo tài khoản mới” để thêm người đó.',
  company_email: 'Không dùng được email này trong không gian của bạn. Hãy dùng email khác, hoặc nhờ Admin.',
  last_owner: 'Không gian làm việc cần ít nhất một chủ sở hữu.',
  owner_made: 'Tài khoản này do chủ một không gian đối tác tạo, nên không thêm vào không gian công ty được.',
  name_taken: 'Đã có không gian làm việc khác mang tên này.',
};

/** The Vietnamese text for a failed Admin call, followed by the server's reason, which Admins may read. */
export const failText = (e: unknown, fallback: string): string => (e instanceof ApiError ? (REASONS[e.message] ?? `${fallback} (${e.message})`) : fallback);

/**
 * Runs a change, reloads the page data after it and keeps the reason when it fails; `run` says whether it worked. One change at a time: `pending`
 * disables the buttons while one is sent, and a call made meanwhile (a double click) is dropped and returns false.
 */
export function useAction(reload: () => void) {
  const [problem, setProblem] = useState('');
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  async function run(change: () => Promise<unknown>, fallback: string): Promise<boolean> {
    if (busy.current) return false;
    busy.current = true;
    setPending(true);
    setProblem('');
    try {
      await change();
      reload();
      return true;
    } catch (e) {
      setProblem(failText(e, fallback));
      return false;
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return { problem, pending, run };
}

const auditText = (v: unknown): string => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));
const auditFields = (v: unknown): Record<string, unknown> =>
  v === null || v === undefined ? {} : typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : { 'giá trị': v };

/** An audit entry's old and new values as one line per field: "enabled: false → true", or the value alone when it did not change or is new. */
export function auditChanges(oldValue: unknown, newValue: unknown): { key: string; text: string }[] {
  const before = auditFields(oldValue);
  const after = auditFields(newValue);
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].map((key) => {
    const from = auditText(before[key]);
    const to = auditText(after[key]);
    return { key, text: !(key in before) || from === to ? to : `${from} → ${to}` };
  });
}
