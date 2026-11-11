'use client';
import { useState } from 'react';
import { BrandKitForm, type BrandStore } from '@/components/BrandKit';
import { confirmDialog } from '@/components/Confirm';
import { LoadError } from '@/components/LoadError';
import { api, sendJson } from '@/lib/api';
import { useAction, useFetch } from '@/lib/admin-ui';
import { Empty, PageHead } from './PageHead';

interface Store extends BrandStore {
  code: string;
  hidden: boolean;
  paused: boolean;
  hasCost: boolean;
  inUse: boolean;
}

function StoreRow({ store, run, pending, onBrand }: { store: Store; run: ReturnType<typeof useAction>['run']; pending: boolean; onBrand: () => void }) {
  const [name, setName] = useState(store.name);
  const [code, setCode] = useState(store.code);
  const patch = (body: Record<string, unknown>, fallback: string) => run(() => api(`/api/admin/stores/${store.id}`, sendJson('PATCH', body)), fallback);
  async function save() {
    // Costs point at the store by id, so they stay with it; only what is written from now on carries the new code.
    if (store.hasCost && code.trim() !== store.code && !(await confirmDialog({ title: 'Đổi mã cửa hàng?', body: 'Cửa hàng này đã có chi phí. Báo cáo và CSV từ giờ dùng mã mới; file đã xuất trước đó vẫn mang mã cũ.', confirmLabel: 'Đổi mã' }))) return;
    void patch({ name, code }, 'Không lưu được cửa hàng.');
  }
  async function close() {
    if (!(await confirmDialog({ title: `Đóng cửa hàng ${store.name}?`, body: 'Cửa hàng không còn trong danh sách chọn khi tạo clip. Clip và chi phí cũ vẫn giữ trong báo cáo; mở lại được bất cứ lúc nào.', confirmLabel: 'Đóng cửa hàng' }))) return;
    void patch({ hidden: true }, 'Không đóng được cửa hàng.');
  }
  async function remove() {
    if (!(await confirmDialog({ title: `Xoá cửa hàng ${store.name}?`, body: 'Cửa hàng chưa có clip, chi phí hay mẫu nào nên xoá hẳn được. Không hoàn tác được.', confirmLabel: 'Xoá', danger: true }))) return;
    void run(() => api(`/api/admin/stores/${store.id}`, { method: 'DELETE' }), 'Không xoá được cửa hàng.');
  }
  return (
    <tr>
      <td data-label="Tên cửa hàng">
        <input aria-label={`Tên cửa hàng ${store.name}`} value={name} onChange={(e) => setName(e.target.value)} />
        {store.hidden ? <span className="tag">Đã đóng</span> : store.paused && <span className="tag">Tạm dừng</span>}
      </td>
      <td data-label="Mã cửa hàng">
        <input aria-label={`Mã cửa hàng của ${store.name}`} value={code} onChange={(e) => setCode(e.target.value)} />
      </td>
      <td data-label="Thao tác">
        <div className="actions">
          <button type="button" disabled={pending || !name.trim() || !code.trim()} onClick={() => void save()}>
            Lưu
          </button>
          {store.hidden ? (
            <button type="button" disabled={pending} onClick={() => void patch({ hidden: false, paused: false }, 'Không mở lại được cửa hàng.')}>
              Mở lại
            </button>
          ) : (
            <>
              <button type="button" disabled={pending} onClick={() => void patch({ paused: !store.paused }, 'Không đổi được trạng thái cửa hàng.')}>
                {store.paused ? 'Hoạt động lại' : 'Tạm dừng'}
              </button>
              <button type="button" disabled={pending} onClick={() => void close()}>
                Đóng
              </button>
            </>
          )}
          <button
            type="button"
            className="danger"
            disabled={pending || store.inUse}
            title={store.inUse ? 'Cửa hàng đã có clip, chi phí hoặc mẫu: hãy Đóng thay vì xoá.' : undefined}
            onClick={() => void remove()}
          >
            Xoá
          </button>
          <button type="button" aria-label={`Bộ nhận diện của ${store.name}`} onClick={onBrand}>
            Bộ nhận diện
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
  const [brand, setBrand] = useState<Store | null>(null); // the store whose brand kit is being edited

  const head = <PageHead id="stores-title" title="Cửa hàng" lead="Cửa hàng/thương hiệu gắn với mỗi clip; mã cửa hàng là store_id của POD Studio." />;
  if (!data)
    return (
      <section aria-labelledby="stores-title">
        {head}
        {failed ? <LoadError text="Không tải được danh sách cửa hàng." onRetry={reload} /> : <p role="status">Đang tải...</p>}
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
        <p className="muted">
          Mã là duy nhất. Đổi mã thì chi phí cũ vẫn thuộc cửa hàng này; báo cáo và CSV từ giờ dùng mã mới. Tạm dừng: vẫn chọn được, xếp cuối và có nhãn “tạm dừng”. Đóng: không
          còn trong danh sách chọn, lịch sử vẫn giữ, mở lại được. Chỉ xoá được cửa hàng chưa có clip, chi phí hay mẫu nào.
        </p>
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
                <StoreRow key={s.id} store={s} run={run} pending={pending} onBrand={() => setBrand(s)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <BrandKitForm store={brand} onClose={() => setBrand(null)} onSaved={() => (setBrand(null), reload())} />
    </section>
  );
}
