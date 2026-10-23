'use client';
import { useState } from 'react';
import { api, sendJson } from '@/lib/api';
import { useAction, useFetch } from '@/lib/admin-ui';

interface Store {
  id: string;
  name: string;
  code: string;
  hidden: boolean;
  hasCost: boolean;
}

function StoreRow({ store, run }: { store: Store; run: ReturnType<typeof useAction>['run'] }) {
  const [name, setName] = useState(store.name);
  const [code, setCode] = useState(store.code);
  const patch = (body: Record<string, unknown>, fallback: string) => run(() => api(`/api/admin/stores/${store.id}`, sendJson('PATCH', body)), fallback);
  return (
    <tr>
      <td>
        <input aria-label={`Tên cửa hàng ${store.name}`} value={name} onChange={(e) => setName(e.target.value)} />
        {store.hidden && <span className="tag">Đã ẩn</span>}
      </td>
      <td>
        <input
          aria-label={`Mã cửa hàng của ${store.name}`}
          value={code}
          disabled={store.hasCost}
          title={store.hasCost ? 'Cửa hàng đã có chi phí nên không đổi được mã.' : undefined}
          onChange={(e) => setCode(e.target.value)}
        />
        {store.hasCost && <p className="muted">Đã có chi phí, không đổi được mã.</p>}
      </td>
      <td>
        <div className="actions">
          <button type="button" disabled={!name.trim() || !code.trim()} onClick={() => void patch({ name, code }, 'Không lưu được cửa hàng.')}>
            Lưu
          </button>
          <button type="button" onClick={() => void patch({ hidden: !store.hidden }, 'Không đổi được trạng thái ẩn.')}>
            {store.hidden ? 'Hiện lại' : 'Ẩn'}
          </button>
        </div>
      </td>
    </tr>
  );
}

export function AdminStores() {
  const { data, failed, reload } = useFetch<{ stores: Store[] }>('/api/admin/stores?includeHidden=1');
  const { problem, run } = useAction(reload);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  if (!data) return failed ? <p className="error">Không tải được danh sách cửa hàng.</p> : <p role="status">Đang tải...</p>;

  async function create() {
    const ok = await run(() => api('/api/admin/stores', sendJson('POST', { name, code })), 'Không tạo được cửa hàng.');
    if (ok) {
      setName('');
      setCode('');
    }
  }

  return (
    <section aria-labelledby="stores-title">
      <h1 id="stores-title">Cửa hàng</h1>
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
          <button type="button" className="primary" disabled={!name.trim() || !code.trim()} onClick={() => void create()}>
            Tạo cửa hàng
          </button>
        </div>
        <p className="muted">Cửa hàng không bao giờ bị xóa. Mã phải là duy nhất và không đổi được sau khi cửa hàng đã có chi phí.</p>
      </fieldset>
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Tên cửa hàng</th>
              <th scope="col">Mã cửa hàng</th>
              <th scope="col">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {data.stores.map((s) => (
              <StoreRow key={s.id} store={s} run={run} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
