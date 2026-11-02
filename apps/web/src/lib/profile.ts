// The user's own profile: the avatar colour palette and rule, the display-name check (shared by Settings and PATCH /api/me/profile),
// and how well the account is protected.

/** Avatar colours: deep enough for white initials (contrast 4.5:1 or more), warm and cool, beside the red brand. */
export const AVATAR_COLORS = ['#b91c1c', '#be123c', '#b45309', '#047857', '#0f766e', '#0369a1', '#4338ca', '#3f3f46'] as const;

/** The same colour for the same name, every time and on every device. */
export function avatarColor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.codePointAt(0)!) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}

/** The colour a user's avatar shows: the one they picked, else the one their name gives. */
export const userAvatarColor = (name: string, chosen: string | null | undefined): string => chosen ?? avatarColor(name);

export const isAvatarColor = (v: unknown): v is string => typeof v === 'string' && (AVATAR_COLORS as readonly string[]).includes(v);

export const NAME_LENGTH = { min: 1, max: 60 };

/** Why a display name cannot be saved (checked after trimming), or null. */
export function nameProblem(name: string): string | null {
  const n = name.trim();
  if (n.length < NAME_LENGTH.min) return 'Hãy nhập tên hiển thị.';
  if ([...n].length > NAME_LENGTH.max) return `Tên hiển thị dài tối đa ${NAME_LENGTH.max} ký tự.`;
  if (/[\u0000-\u001f\u007f-\u009f]/.test(n)) return 'Tên hiển thị có ký tự không hợp lệ.';
  return null;
}

export type ProtectionCheck = { id: 'password' | 'linked' | 'passkey' | 'twoFactor'; label: string; done: boolean };

/**
 * The account's protection checks. Without a password, 2FA does not apply (it guards password sign-in only) and a linked Google or Lark
 * sign-in takes the password's place, so such an account is scored out of 2.
 */
export function protection(a: { hasPassword: boolean; linked: boolean; passkeys: number; twoFactor: boolean }): ProtectionCheck[] {
  return [
    a.hasPassword ? { id: 'password', label: 'Mật khẩu đã đặt', done: true } : { id: 'linked', label: 'Đăng nhập Google hoặc Lark', done: a.linked },
    { id: 'passkey', label: 'Passkey', done: a.passkeys > 0 },
    ...(a.hasPassword ? [{ id: 'twoFactor', label: 'Xác thực 2 lớp', done: a.twoFactor } as const] : []),
  ];
}
