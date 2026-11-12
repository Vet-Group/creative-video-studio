'use client';
// The "my models" tab: the saved AI models the member may see (their own, the shared ones, and every model for an Admin) with rename, share, release and delete.
import Link from 'next/link';
import { useId, useState } from 'react';
import { api, errorText, sendJson, thumbUrl } from '@/lib/api';
import { MAX_NAME, type FashionModelItem } from '@/lib/fashion-models';
import { useFashionModels } from '@/lib/use-fashion-models';
import { confirmDialog } from './Confirm';
import { LoadError } from './LoadError';
import s from './FashionModelApp.module.css';

function ModelCard({ model, isAdmin, change }: { model: FashionModelItem; isAdmin: boolean; change: () => void }) {
  const nameId = useId();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(model.name);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = model.sharedLocked && !isAdmin; // an Admin decided: only an Admin changes it
  const canEdit = model.mine || isAdmin;
  const keptByAdmin = !isAdmin && model.shared && model.sharedLocked; // only an Admin deletes a model an Admin decided to share

  async function act(what: () => Promise<unknown>, fail: string) {
    setBusy(true);
    setProblem('');
    try {
      await what();
      change();
      return true;
    } catch (e) {
      setProblem(errorText(e, fail));
      return false;
    } finally {
      setBusy(false);
    }
  }
  const patch = (body: object, fail: string) => act(() => api(`/api/fashion-models/${model.id}`, sendJson('PATCH', body)), fail);
  async function rename() {
    if (name.trim() !== model.name && !(await patch({ name: name.trim() }, 'Không đổi được tên.'))) return;
    setEditing(false);
  }
  async function remove() {
    if (!(await confirmDialog({ title: `Xoá người mẫu "${model.name}"?`, body: 'Người mẫu biến khỏi các bảng chọn. Ảnh đã tạo bằng nó vẫn còn trong Thư viện.', confirmLabel: 'Xoá', danger: true }))) return;
    await act(() => api(`/api/fashion-models/${model.id}`, { method: 'DELETE' }), 'Không xoá được người mẫu.');
  }

  return (
    <li className={s.card}>
      <img src={thumbUrl(model.assetId)} alt={`Người mẫu ${model.name}`} loading="lazy" />
      {editing ? (
        <div className={s.rename}>
          <label className="field-label" htmlFor={nameId}>
            Tên người mẫu
          </label>
          <input id={nameId} value={name} maxLength={MAX_NAME} onChange={(e) => setName(e.target.value)} />
          <div className={s.actions}>
            <button type="button" className="primary" disabled={busy || !name.trim()} onClick={() => void rename()}>
              Lưu tên
            </button>
            <button type="button" onClick={() => (setName(model.name), setEditing(false))}>
              Huỷ
            </button>
          </div>
        </div>
      ) : (
        <h3>{model.name}</h3>
      )}
      <p className="muted">
        {model.mine ? 'Của bạn' : `Của ${model.ownerName}`} · {model.shared ? 'Dùng chung' : 'Riêng tư'}
      </p>
      {canEdit && (
        <label className={s.share}>
          <input type="checkbox" checked={model.shared} disabled={busy || locked} onChange={(e) => void patch({ shared: e.target.checked }, 'Không đổi được chế độ dùng chung.')} />
          Dùng chung cho cả công ty
        </label>
      )}
      {model.sharedLocked && (
        <p className="help">
          {isAdmin ? 'Quyết định của Admin đang khoá chế độ này.' : 'Admin đã quyết định'}
          {isAdmin && (
            <>
              {' '}
              <button type="button" className="link-button" disabled={busy} onClick={() => void patch({ sharedLocked: false }, 'Không thả được quyết định.')}>
                Thả quyết định của Admin
              </button>
            </>
          )}
        </p>
      )}
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      <div className={s.actions}>
        <Link href="/try-on" className="button">
          Dùng trong Thử đồ
        </Link>
        {model.mine && !editing && (
          <button type="button" aria-label={`Đổi tên ${model.name}`} onClick={() => setEditing(true)}>
            Đổi tên
          </button>
        )}
        {canEdit && (
          <button type="button" className="danger" aria-label={`Xoá ${model.name}`} title={keptByAdmin ? 'Admin đã quyết định' : undefined} disabled={busy || keptByAdmin} onClick={() => void remove()}>
            Xoá
          </button>
        )}
      </div>
    </li>
  );
}

export function FashionModelList({ version, isAdmin, change }: { version: number; isAdmin: boolean; change: () => void }) {
  const { models, failed } = useFashionModels(true, version);
  return (
    <aside className="tray history" aria-label="Người mẫu của tôi">
      <h2>Người mẫu của tôi</h2>
      {failed && <LoadError text="Không tải được danh sách người mẫu." onRetry={change} />}
      {models?.length === 0 && !failed && <p className="muted">Chưa có người mẫu nào. Tạo ảnh, rồi bấm Lưu làm người mẫu ở ảnh bạn thích.</p>}
      <ul className={s.list}>
        {models?.map((m) => (
          <ModelCard key={m.id} model={m} isAdmin={isAdmin} change={change} />
        ))}
      </ul>
    </aside>
  );
}
