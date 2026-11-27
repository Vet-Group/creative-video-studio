'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { confirmDialog } from '@/components/Confirm';
import { api, sendJson } from '@/lib/api';
import { useAction } from '@/lib/admin-ui';
import { CATEGORIES } from '@/lib/apps';
import type { AdminAppRow } from '@/lib/custom-apps-db';
import { Empty, PageHead } from './PageHead';

const chip = (r: AdminAppRow) => (!r.sourceLive ? 'Kết quả gốc đã bị xoá' : r.published ? 'Đã đăng' : 'Nháp');

/** Admin > Apps: the workspace's custom apps (docs/WORKSPACES.md §2) with the actions to edit, publish, open and delete each. */
export function AdminApps({ rows }: { rows: AdminAppRow[] }) {
  const router = useRouter();
  const { problem, pending, run } = useAction(() => router.refresh());
  const head = <PageHead id="apps-title" title="Ứng dụng tự tạo" lead="Ứng dụng một chạm làm từ một kết quả trong Thư viện: thành viên chỉ tải ảnh lên rồi bấm Chạy, mô tả và cài đặt do Admin đặt sẵn." />;

  async function remove(r: AdminAppRow) {
    if (!(await confirmDialog({ title: `Xoá ứng dụng «${r.name}»?`, body: 'Ứng dụng biến mất khỏi trang Ứng dụng. Clip gốc và các lượt đã chạy vẫn còn.', confirmLabel: 'Xoá ứng dụng', danger: true }))) return;
    void run(() => api(`/api/admin/apps/${r.id}`, { method: 'DELETE' }), 'Không xoá được ứng dụng.');
  }

  if (rows.length === 0) {
    return (
      <section aria-labelledby="apps-title">
        {head}
        <Empty title="Chưa có ứng dụng nào.">Mở một kết quả trong Thư viện rồi bấm Biến thành ứng dụng.</Empty>
      </section>
    );
  }
  return (
    <section aria-labelledby="apps-title">
      {head}
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      <div className="table-wrap">
        <table className="mobile-records">
          <thead>
            <tr>
              <th scope="col">Tên</th>
              <th scope="col">Danh mục</th>
              <th scope="col">Trạng thái</th>
              <th scope="col">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td data-label="Tên">{r.name}</td>
                <td data-label="Danh mục">{CATEGORIES.find((c) => c.id === r.category)?.label ?? r.category}</td>
                <td data-label="Trạng thái">
                  <span className="tag">{chip(r)}</span>
                </td>
                <td data-label="Thao tác">
                  <div className="actions">
                    {r.sourceLive && (
                      <Link href={`/admin/apps/${r.id}`} className="button" aria-label={`Sửa ${r.name}`}>
                        Sửa
                      </Link>
                    )}
                    {(r.sourceLive || r.published) && (
                      <button type="button" disabled={pending} aria-label={`${r.published ? 'Gỡ khỏi trang Ứng dụng' : 'Đăng lên trang Ứng dụng'}: ${r.name}`} onClick={() => void run(() => api(`/api/admin/apps/${r.id}`, sendJson('PATCH', { published: !r.published })), r.published ? 'Không gỡ được ứng dụng.' : 'Không đăng được ứng dụng.')}>
                        {r.published ? 'Gỡ khỏi trang Ứng dụng' : 'Đăng lên trang Ứng dụng'}
                      </button>
                    )}
                    {r.sourceLive && (
                      <Link href={`/apps/${r.id}`} className="button" aria-label={`Mở ${r.name}`}>
                        Mở
                      </Link>
                    )}
                    <button type="button" className="danger" disabled={pending} aria-label={`Xoá ứng dụng ${r.name}`} onClick={() => void remove(r)}>
                      Xoá ứng dụng
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
