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
  'account.link': 'Liên kết đăng nhập', 'account.unlink': 'Huỷ liên kết đăng nhập', 'clip.delete': 'Xoá clip', 'cost.manual_adjustment': 'Điều chỉnh chi phí', 'invoice.enter': 'Nhập hoá đơn',
  'model.set_enabled': 'Bật/tắt mô hình', 'preset.create': 'Thêm mẫu', 'preset.update': 'Sửa mẫu', 'preset_proposal.approve': 'Duyệt đề xuất mẫu', 'preset_proposal.reject': 'Từ chối đề xuất mẫu', 'rate.update': 'Sửa tỉ giá', 'sample.delete': 'Xoá ảnh mẫu', 'sample.put': 'Tải ảnh mẫu', 'settings.update': 'Sửa cài đặt',
  'store.create': 'Tạo cửa hàng', 'store.hide': 'Ẩn cửa hàng', 'store.reassign': 'Đổi cửa hàng của clip', 'store.update': 'Sửa cửa hàng', 'team.create': 'Tạo nhóm', 'team.hide': 'Ẩn nhóm', 'team.rename': 'Đổi tên nhóm',
  'user.ban': 'Khoá tài khoản', 'user.delete': 'Xoá tài khoản', 'user.password_change': 'Đổi mật khẩu', 'user.password_set': 'Đặt mật khẩu', 'user.profile_update': 'Sửa hồ sơ', 'user.role_change': 'Đổi vai trò',
  'user.sessions_revoke': 'Đăng xuất thiết bị khác', 'user.team_change': 'Đổi nhóm', 'user.template_editor': 'Đổi quyền biên tập mẫu', 'user.two_factor_backup_codes': 'Tạo mã dự phòng 2 lớp', 'user.two_factor_disable': 'Tắt xác thực 2 lớp',
  'user.two_factor_enable': 'Bật xác thực 2 lớp', 'user.two_factor_failed': 'Nhập sai mã 2 lớp', 'user.unban': 'Mở khoá tài khoản', 'user.update': 'Sửa tài khoản', 'verdict.set': 'Chấm kết quả',
};
export const auditLabel = (action: string): string => AUDIT_ACTIONS[action] ?? action;

/** The Vietnamese text for a failed Admin call, followed by the server's reason, which Admins may read. */
export const failText = (e: unknown, fallback: string): string => (e instanceof ApiError ? `${fallback} (${e.message})` : fallback);

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
