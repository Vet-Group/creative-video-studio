// Browser side of the optional TOTP two-factor sign-in, shared by the login page and the Settings security section.
import { ApiError, sendJson } from './api';

/**
 * POSTs to a /api/auth/two-factor/ endpoint. A wrong code answers 401, which api() would take for a lost session and leave the page
 * for the login, so this throws the same ApiError without that.
 */
export async function twoFactorCall<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api/auth/two-factor/${path}`, sendJson('POST', body));
  const json = (await res.json().catch(() => null)) as (T & { message?: string; code?: string }) | null;
  if (!res.ok) throw new ApiError(res.status, json?.message ?? `HTTP ${res.status}`, Number(res.headers.get('x-retry-after')) || null, json?.code ?? null);
  return json as T;
}

/** The step of a sign-in is over: it timed out (10 minutes) or used its five tries, so the password must be given again. */
export const challengeEnded = (e: unknown) => e instanceof ApiError && (e.code === 'INVALID_TWO_FACTOR_COOKIE' || e.code === 'TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE');

/** The Vietnamese message for a refused 2FA call. */
export function twoFactorFailure(e: unknown): string {
  if (!(e instanceof ApiError)) return 'Không xác thực được. Hãy thử lại sau.';
  if (e.code === 'ACCOUNT_TEMPORARILY_LOCKED') return 'Bạn nhập sai quá nhiều lần nên xác thực 2 lớp tạm khoá 15 phút. Hãy thử lại sau.';
  if (e.status === 429) return `Bạn thử quá nhiều lần. Hãy đợi ${e.retryAfter ?? 60} giây rồi thử lại.`;
  if (challengeEnded(e)) return 'Phiên xác thực đã hết hạn hoặc bạn đã thử quá nhiều lần. Hãy đăng nhập lại.';
  if (e.code === 'INVALID_CODE') return 'Mã xác thực không đúng.';
  if (e.code === 'INVALID_BACKUP_CODE') return 'Mã dự phòng không đúng hoặc đã được dùng.';
  if (e.code === 'INVALID_PASSWORD') return 'Mật khẩu không đúng.';
  return 'Không xác thực được. Hãy thử lại sau.';
}

/** The base32 secret of an otpauth:// link in groups of four, for typing into an authenticator app by hand. */
export const manualSecret = (uri: string) => (new URL(uri).searchParams.get('secret') ?? '').match(/.{1,4}/g)?.join(' ') ?? '';

/** The backup codes as the downloaded .txt file holds them. */
export const backupCodesText = (email: string, codes: readonly string[]) =>
  `Mã dự phòng xác thực 2 lớp - VET Creative Video Studio\r\n${email}\r\nMỗi mã chỉ dùng được một lần.\r\n\r\n${codes.join('\r\n')}\r\n`;
