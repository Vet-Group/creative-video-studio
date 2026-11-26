import { expect, test } from 'vitest';
import { auditChanges, auditLabel, auditNewValue, auditTarget, groupRecent, sellerUse } from './admin-ui';

test('sellerUse counts ICT calendar days since the last use and marks 14 days or never as idle', () => {
  const now = new Date('2026-11-21T10:00:00+07:00');
  expect(sellerUse(null, null, now)).toEqual({ text: 'Chưa thấy đăng nhập', idle: true });
  expect(sellerUse(null, '2026-11-20T09:00:00+07:00', now)).toEqual({ text: 'Đã đăng nhập, chưa tạo gì', idle: true });
  expect(sellerUse('2026-11-21T00:30:00+07:00', null, now)).toEqual({ text: 'Hôm nay', idle: false });
  // 23:30 ICT the day before is 16:30 UTC the same UTC day as now: still yesterday in Vietnam.
  expect(sellerUse('2026-11-20T23:30:00+07:00', null, now)).toEqual({ text: 'Hôm qua', idle: false });
  expect(sellerUse('2026-11-08T12:00:00+07:00', null, now)).toEqual({ text: '13 ngày trước', idle: false });
  expect(sellerUse('2026-11-07T12:00:00+07:00', null, now)).toEqual({ text: '14 ngày trước', idle: true });
});

test('auditChanges shows a changed field as old → new and an unchanged or new field as its value', () => {
  expect(auditChanges({ enabled: false }, { enabled: true })).toEqual([{ key: 'enabled', text: 'false → true' }]);
  expect(auditChanges({ name: 'Shop', code: 'A' }, { name: 'Shop', code: 'B' })).toEqual([
    { key: 'name', text: 'Shop' },
    { key: 'code', text: 'A → B' },
  ]);
  expect(auditChanges(null, { name: 'Team E2E', costCentreCode: null })).toEqual([
    { key: 'name', text: 'Team E2E' },
    { key: 'costCentreCode', text: '—' },
  ]);
  expect(auditChanges({ storeId: 's1' }, null)).toEqual([{ key: 'storeId', text: 's1 → —' }]);
  expect(auditChanges({ caps: [1, 2] }, 'x')).toEqual([
    { key: 'caps', text: '[1,2] → —' },
    { key: 'giá trị', text: 'x' },
  ]);
});

test('groupRecent collapses a run of the same action by the same actor within minutes, and nothing else', () => {
  const e = (id: number, minute: number, action = 'sample.put', actorName = 'An') => ({ id, actorName, action, target: `sample:s${id}.jpg`, createdAt: new Date(Date.UTC(2026, 10, 8, 10, minute)).toISOString() });
  const rows = groupRecent([e(7, 30), e(6, 29), e(5, 28), e(4, 27, 'sample.delete'), e(3, 26), e(2, 10, 'sample.put', 'Binh'), e(1, 9, 'sample.put', 'Binh'), e(0, 0, 'sample.put', 'Binh')]);
  expect(rows.map((r) => [r.id, r.count])).toEqual([[7, 3], [4, 1], [3, 1], [2, 2], [0, 1]]);
});

test('auditTarget drops the sample prefix and the extension and leaves other targets alone', () => {
  expect(auditTarget('sample:preset-style-flat-lay.jpg')).toBe('preset-style-flat-lay');
  expect(auditTarget('team:t1')).toBe('team:t1');
  expect(auditTarget('job:ba099b6a-1c2d-4e5f-8a9b-0c1d2e3f4a5b')).toBe('job:ba099b6a');
});

test('auditLabel words the cap, Vertex and sample events and keeps the code of an unknown one', () => {
  expect(['feature_cap.update', 'vertex.switch_account', 'vertex_account.update', 'sample.put'].map(auditLabel)).toEqual(['Sửa hạn mức công cụ', 'Chuyển tài khoản Vertex', 'Sửa tài khoản Vertex', 'Tải ảnh mẫu']);
  expect(auditLabel('cost.release')).toBe('cost.release');
});

test("auditNewValue words a refused add's reason, keeps an unknown one and leaves other events alone", () => {
  const v = { email: 'a@b.test', reason: 'no_user', mode: 'add' };
  expect(auditNewValue('workspace.member_refused', v)).toEqual({ ...v, reason: 'chưa có tài khoản hoặc là nhân viên' });
  expect(auditNewValue('workspace.member_refused', { ...v, reason: 'Some auth error' })).toEqual({ ...v, reason: 'Some auth error' });
  expect(auditNewValue('workspace.member_add', v)).toBe(v);
  expect(auditNewValue('workspace.member_refused', null)).toBeNull();
});
