// What the login page, the sign-in methods page and the Admin users page share about the ways to sign in.

export const METHOD_LABEL: Record<string, string> = { credential: 'Email và mật khẩu', google: 'Google', lark: 'Lark', passkey: 'Passkey' };

/** A passkey of the signed-in user as the sign-in methods page lists it. */
export interface PasskeyItem {
  id: string;
  createdAt: string;
}

/** A linked method as the pages list it; `email` is the provider's own address when it is known. */
export interface SignInMethod {
  id: string;
  provider: string;
  email: string | null;
}

export const providerLabel = (provider: string) => METHOD_LABEL[provider] ?? provider;
/** How a linked method reads in a list: its name, then the provider's own email when it is known. */
export const methodText = (m: SignInMethod) => `${providerLabel(m.provider)}${m.email ? ` (${m.email})` : ''}`;

/** What a user reads for each `?error=` code better-auth puts in the URL after a failed social sign-in or link. */
const AUTH_ERROR_TEXT: Record<string, string> = {
  signup_disabled: 'Email này chưa được cấp quyền. Liên hệ Admin.',
  account_not_linked: 'Email này đã có tài khoản nhưng chưa liên kết với cách đăng nhập vừa dùng. Hãy đăng nhập bằng cách khác rồi liên kết tại "Phương thức đăng nhập", hoặc liên hệ Admin.',
  BANNED_USER: 'Tài khoản này đã bị khóa. Liên hệ Admin.',
  account_already_linked_to_different_user: 'Tài khoản này đã được liên kết với một người dùng khác.',
  email_does_not_match: 'Email của tài khoản này không khớp với tài khoản đang đăng nhập.',
  unable_to_get_user_info: 'Không lấy được thông tin tài khoản từ nhà cung cấp. Hãy dùng tài khoản của công ty.',
  unable_to_link_account: 'Không liên kết được tài khoản này. Hãy kiểm tra email của tài khoản đã được nhà cung cấp xác minh, rồi thử lại.',
};

/** The Vietnamese message for an `?error=` code; any code not listed gets a general one. Undefined means no error. */
export function authErrorText(code: string | undefined): string | undefined {
  if (!code) return undefined;
  return Object.hasOwn(AUTH_ERROR_TEXT, code) ? AUTH_ERROR_TEXT[code] : 'Không đăng nhập được, hãy thử lại sau.';
}

/** The email in a Google id_token. Read without checking the signature: the token is the one better-auth stored from Google's own answer. */
export function googleEmail(idToken: string | null): string | null {
  try {
    const payload = JSON.parse(atob((idToken ?? '').split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))) as { email?: unknown };
    return typeof payload.email === 'string' ? payload.email : null;
  } catch {
    return null;
  }
}
