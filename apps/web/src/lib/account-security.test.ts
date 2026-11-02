import { expect, test } from 'vitest';
import { changeFailure, deviceLabel, passwordProblem, SESSIONS_SHOWN, sessionTime, visibleSessions } from './account-security';
import { ApiError } from './api';

test('names the browser and the system of common user agents', () => {
  const cases: [string | null, string][] = [
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', 'Chrome trên Windows'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0', 'Edge trên Windows'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1', 'Safari trên iPhone'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0 Mobile/15E148 Safari/604.1', 'Chrome trên iPhone'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15', 'Safari trên macOS'],
    ['Mozilla/5.0 (Linux; Android 15; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0 Mobile Safari/537.36', 'Samsung Internet trên Android'],
    ['Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36', 'Chrome trên Android'],
    ['Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0', 'Firefox trên Linux'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 OPR/123.0', 'Opera trên Windows'],
    ['curl/8.9.1', 'Thiết bị không rõ'],
    [null, 'Thiết bị không rõ'],
  ];
  for (const [ua, label] of cases) expect(deviceLabel(ua), String(ua)).toBe(label);
});

test('the form is sent only with a current password, a new one of 8 to 128 characters typed twice, that differs from the current one', () => {
  expect(passwordProblem('', 'new-password-1', 'new-password-1')).toBe('Hãy nhập mật khẩu hiện tại.');
  expect(passwordProblem('old-password', 'short', 'short')).toBe('Mật khẩu mới cần ít nhất 8 ký tự.');
  expect(passwordProblem('old-password', 'x'.repeat(129), 'x'.repeat(129))).toBe('Mật khẩu mới chỉ được tối đa 128 ký tự.');
  expect(passwordProblem('old-password', 'new-password-1', 'new-password-2')).toBe('Mật khẩu nhập lại không khớp.');
  expect(passwordProblem('old-password', 'old-password', 'old-password')).toBe('Mật khẩu mới phải khác mật khẩu hiện tại.');
  expect(passwordProblem('old-password', 'x'.repeat(8), 'x'.repeat(8))).toBeNull();
});

test('a wrong current password, a reused one and the limiter each get their own message', () => {
  expect(changeFailure(new ApiError(400, 'Invalid password', null, 'INVALID_PASSWORD'))).toBe('Mật khẩu hiện tại không đúng.');
  expect(changeFailure(new ApiError(400, 'same', null, 'PASSWORD_UNCHANGED'))).toBe('Mật khẩu mới phải khác mật khẩu hiện tại.');
  expect(changeFailure(new ApiError(429, 'Too many requests', 7))).toBe('Bạn thử quá nhiều lần. Hãy đợi 7 giây rồi thử lại.');
  expect(changeFailure(new Error('offline'))).toBe('Không đổi được mật khẩu. Hãy thử lại sau.');
});

test('session times read in Vietnam time', () => {
  expect(sessionTime('2026-11-01T18:05:00.000Z')).toBe('01:05 02/11/2026');
});

test('the sessions list puts this device first and shows five until all are asked for', () => {
  const sessions = Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, current: i === 6 }));
  const shown = visibleSessions(sessions, false);
  expect(shown.map((s) => s.id)).toEqual(['s6', 's0', 's1', 's2', 's3']);
  expect(shown).toHaveLength(SESSIONS_SHOWN);
  expect(visibleSessions(sessions, true).map((s) => s.id)).toEqual(['s6', 's0', 's1', 's2', 's3', 's4', 's5', 's7']);
  expect(visibleSessions(sessions.slice(0, 3), false)).toHaveLength(3);
});
