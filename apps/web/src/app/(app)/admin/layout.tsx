import type { ReactNode } from 'react';
import { AdminNav } from '@/components/admin/AdminNav';
import { currentUser } from '@/lib/current-user';

// The server-side gate of every /admin page: a Member sees only this refusal. The data comes from /api/admin routes, which check the role again.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  if (user?.role !== 'admin') {
    return (
      <section aria-labelledby="forbidden-title">
        <h1 id="forbidden-title">Không có quyền truy cập</h1>
        <p>Khu vực quản trị chỉ dành cho Admin.</p>
      </section>
    );
  }
  return (
    <div className="admin">
      <AdminNav />
      {children}
    </div>
  );
}
