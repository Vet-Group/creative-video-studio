import { expect, test } from 'vitest';
import { auditChanges } from './admin-ui';

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
