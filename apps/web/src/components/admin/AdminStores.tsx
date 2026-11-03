'use client';
import { useState } from 'react';
import { confirmDialog } from '@/components/Confirm';
import { api, sendJson } from '@/lib/api';
import { useAction, useFetch } from '@/lib/admin-ui';
import { Empty, PageHead } from './PageHead';

interface Store {
  id: string;
  name: string;
  code: string;
  hidden: boolean;
  hasCost: boolean;
}

function StoreRow({ store, run, pending }: { store: Store; run: ReturnType<typeof useAction>['run']; pending: boolean }) {
  const [name, setName] = useState(store.name);
  const [code, setCode] = useState(store.code);
  const patch = (body: Record<string, unknown>, fallback: string) => run(() => api(`/api/admin/stores/${store.id}`, sendJson('PATCH', body)), fallback);
  async function save() {
    // Costs point at the store by id, so they stay with it; only what is written from now on carries the new code.
    if (store.hasCost && code.trim() !== store.code && !(await confirmDialog({ title: 'Đổi mã cửa hàng?', body: 'Cửa hàng này đã có chi phí. Báo cáo và CSV từ giờ dùng mã mới; file đã xuất trước đó vẫn mang mã cũ.', confirmLabel: 'Đổi mã' }))) return;
    void patch({ name, code }, 'Không lưu được cửa hàng.');
  }
  return (
    <tr>
      <td data-label="Tên cửa hàng">
        <input aria-label={`Tên cửa hàng ${store.name}`} value={name} onChange={(e) => setName(e.target.value)} />
        {store.hidden && <span className="tag">Đã ẩn</span>}
      </td>
      <td data-label="Mã cửa hàng">
        <input aria-label={`Mã cửa hàng của ${store.name}`} value={code} onChange={(e) => setCode(e.target.value)} />
      </td>
      <td data-label="Thao tác">
        <div className="actions">
          <button type="button" disabled={pending || !name.trim() || !code.trim()} onClick={() => void save()}>
            Lưu
          </button>
          <button type="button" disabled={pending} onClick={() => void patch({ hidden: !store.hidden }, 'Không đổi được trạng thái ẩn.')}>
            {store.hidden ? 'Hiện lại' : 'Ẩn'}
          </button>
        </div>
      </td>
    </tr>
  );
}

export function AdminStores() {
  const { data, failed, reload } = useFetch<{ stores: Store[] }>('/api/admin/stores?includeHidden=1');
  const { problem, pending, run } = useAction(reload);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  const head = <PageHead id="stores-title" title="Cửa hàng" lead="Cửa hàng/thương hiệu gắn với mỗi clip; mã cửa hàng là store_id của POD Studio." />;
  if (!data)
    return (
      <section aria-labelledby="stores-title">
        {head}
        {failed ? <p className="error">Không tải được danh sách cửa hàng.</p> : <p role="status">Đang tải...</p>}
      </section>
    );

  async function create() {
    const ok = await run(() => api('/api/admin/stores', sendJson('POST', { name, code })), 'Không tạo được cửa hàng.');
    if (ok) {
      setName('');
      setCode('');
    }
  }

  return (
    <section aria-labelledby="stores-title">
      {head}
      <fieldset>
        <legend>Tạo cửa hàng</legend>
        <div className="row">
          <label>
            Tên cửa hàng
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Mã cửa hàng (store_id của POD Studio)
            <input value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
          <button type="button" className="primary" disabled={pending || !name.trim() || !code.trim()} onClick={() => void create()}>
            Tạo cửa hàng
          </button>
        </div>
        <p className="muted">Cửa hàng không bao giờ bị xóa và mã là duy nhất. Đổi mã thì chi phí cũ vẫn thuộc cửa hàng này; báo cáo và CSV từ giờ dùng mã mới.</p>
      </fieldset>
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      {data.stores.length === 0 ? (
        <Empty title="Chưa có cửa hàng nào">Tạo cửa hàng đầu tiên ở trên.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="mobile-records">
            <thead>
              <tr>
                <th scope="col">Tên cửa hàng</th>
                <th scope="col">Mã cửa hàng</th>
                <th scope="col">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {data.stores.map((s) => (
                <StoreRow key={s.id} store={s} run={run} pending={pending} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
