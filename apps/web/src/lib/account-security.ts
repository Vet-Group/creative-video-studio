// What the Settings security section and the forced password change page share: the password rules and messages, and the device names of sessions.
import { ApiError } from './api';

/** better-auth's default password length limits (lib/auth.ts does not change them). */
export const PASSWORD_LENGTH = { min: 8, max: 128 };

/** Why a password change form cannot be sent yet, or null when it can; the server checks all of it again. */
export function passwordProblem(current: string, next: string, confirm: string): string | null {
  if (!current) return 'Hãy nhập mật khẩu hiện tại.';
  if (next.length < PASSWORD_LENGTH.min) return `Mật khẩu mới cần ít nhất ${PASSWORD_LENGTH.min} ký tự.`;
  if (next.length > PASSWORD_LENGTH.max) return `Mật khẩu mới chỉ được tối đa ${PASSWORD_LENGTH.max} ký tự.`;
  if (next !== confirm) return 'Mật khẩu nhập lại không khớp.';
  if (next === current) return 'Mật khẩu mới phải khác mật khẩu hiện tại.';
  return null;
}

/** The Vietnamese message for a refused /api/auth/change-password. */
export function changeFailure(e: unknown): string {
  if (!(e instanceof ApiError)) return 'Không đổi được mật khẩu. Hãy thử lại sau.';
  if (e.status === 429) return `Bạn thử quá nhiều lần. Hãy đợi ${e.retryAfter ?? 10} giây rồi thử lại.`;
  if (e.code === 'INVALID_PASSWORD') return 'Mật khẩu hiện tại không đúng.';
  if (e.code === 'PASSWORD_UNCHANGED') return 'Mật khẩu mới phải khác mật khẩu hiện tại.';
  if (e.code === 'PASSWORD_TOO_SHORT' || e.code === 'PASSWORD_TOO_LONG') return `Mật khẩu mới cần từ ${PASSWORD_LENGTH.min} đến ${PASSWORD_LENGTH.max} ký tự.`;
  return 'Không đổi được mật khẩu. Hãy thử lại sau.';
}

// Order matters: Edge, Opera and Samsung Internet also say Chrome and Safari, and Chrome also says Safari.
const BROWSERS: readonly (readonly [RegExp, string])[] = [
  [/Edg(?:e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/CriOS\/|Chrome\//, 'Chrome'],
  [/FxiOS\/|Firefox\//, 'Firefox'],
  [/Safari\//, 'Safari'],
];
// Android also says Linux, and an iPhone also says Mac OS X.
const SYSTEMS: readonly (readonly [RegExp, string])[] = [
  [/iPhone|iPod/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/CrOS/, 'ChromeOS'],
  [/Macintosh|Mac OS X/, 'macOS'],
  [/Linux/, 'Linux'],
];

/**
 * A session's device as a person reads it, such as "Chrome trên Windows", from its User-Agent.
 * shortcut: a few patterns, not a full parser; enough to tell a user's own devices apart. Upgrade if a common browser reads wrong.
 */
export function deviceLabel(userAgent: string | null): string {
  const ua = userAgent ?? '';
  const browser = BROWSERS.find(([re]) => re.test(ua))?.[1];
  const system = SYSTEMS.find(([re]) => re.test(ua))?.[1];
  if (browser && system) return `${browser} trên ${system}`;
  return browser ?? system ?? 'Thiết bị không rõ';
}

/** A session time as hh:mm dd/mm/yyyy in Vietnam time. */
export const sessionTime = (iso: string) =>
  new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso));

/** How many sessions the list shows before "Xem tất cả". */
export const SESSIONS_SHOWN = 5;

/** This device first, then the others newest first as the API lists them; the first few unless all are asked for. */
export function visibleSessions<T extends { current: boolean }>(sessions: T[], all: boolean): T[] {
  const ordered = [...sessions].sort((a, b) => Number(b.current) - Number(a.current));
  return all ? ordered : ordered.slice(0, SESSIONS_SHOWN);
}
