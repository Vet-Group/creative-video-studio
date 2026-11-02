import { expect, test } from 'vitest';
import { ApiError } from './api';
import { backupCodesText, challengeEnded, manualSecret, twoFactorFailure } from './two-factor';

const refused = (status: number, code: string | null, retryAfter: number | null = null) => new ApiError(status, 'x', retryAfter, code);

test('says why a code was refused, in Vietnamese', () => {
  expect(twoFactorFailure(refused(401, 'INVALID_CODE'))).toBe('Mã xác thực không đúng.');
  expect(twoFactorFailure(refused(401, 'INVALID_BACKUP_CODE'))).toBe('Mã dự phòng không đúng hoặc đã được dùng.');
  expect(twoFactorFailure(refused(400, 'INVALID_PASSWORD'))).toBe('Mật khẩu không đúng.');
  expect(twoFactorFailure(refused(429, null, 42))).toBe('Bạn thử quá nhiều lần. Hãy đợi 42 giây rồi thử lại.');
  // The account lock is a 429 too, but has no wait the limiter counts.
  expect(twoFactorFailure(refused(429, 'ACCOUNT_TEMPORARILY_LOCKED'))).toMatch(/tạm khóa 15 phút/);
  expect(twoFactorFailure(new Error('offline'))).toBe('Không xác thực được. Hãy thử lại sau.');
});

test('a timed-out or spent challenge sends the user back to the password', () => {
  for (const code of ['INVALID_TWO_FACTOR_COOKIE', 'TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE']) {
    expect(challengeEnded(refused(401, code))).toBe(true);
    expect(twoFactorFailure(refused(401, code))).toMatch(/Hãy đăng nhập lại\.$/);
  }
  expect(challengeEnded(refused(401, 'INVALID_CODE'))).toBe(false);
});

test('shows the secret in groups of four and writes the backup codes file', () => {
  expect(manualSecret('otpauth://totp/VET:a%40b.c?secret=ABCDEFGHIJKLMNOPQR&issuer=VET')).toBe('ABCD EFGH IJKL MNOP QR');
  expect(backupCodesText('a@b.c', ['aaaaa-bbbbb', 'ccccc-ddddd'])).toMatch(/a@b\.c\r\n.*\r\n\r\naaaaa-bbbbb\r\nccccc-ddddd\r\n$/);
});
