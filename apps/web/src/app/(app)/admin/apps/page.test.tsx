import { expect, test, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({ pool: {} }));
vi.mock('@/lib/current-user', () => ({ currentUser: vi.fn(async () => ({ role: 'admin', workspaceId: 'w1', mustChangePassword: true })) }));
vi.mock('@/lib/custom-apps-db', () => ({ adminApps: vi.fn(), adminApp: vi.fn(), appSource: vi.fn() }));
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => { throw new Error('not found'); }),
  redirect: vi.fn((to: string) => { throw new Error(`redirect ${to}`); }),
}));

import { adminApp, adminApps, appSource } from '@/lib/custom-apps-db';
import EditAppPage from './[id]/page';
import NewAppPage from './new/page';
import AppsPage from './page';

test('an Admin who must change an Admin-set password is sent to the change page before any app is read, as on Explore', async () => {
  await expect(AppsPage()).rejects.toThrow('redirect /account/password');
  await expect(EditAppPage({ params: Promise.resolve({ id: 'a1' }) })).rejects.toThrow('redirect /account/password');
  await expect(NewAppPage({ searchParams: Promise.resolve({ job: 'j1' }) })).rejects.toThrow('redirect /account/password');
  expect(adminApps).not.toHaveBeenCalled();
  expect(adminApp).not.toHaveBeenCalled();
  expect(appSource).not.toHaveBeenCalled();
});
