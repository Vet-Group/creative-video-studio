// Saved forms (a client module: only the client forms import it): Save template keeps the page's current inputs under a name, My templates lists them (and the company's and the chosen store's) and reopens the page filled from one.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { api, errorText, sendJson } from '@/lib/api';
import { MAX_TEMPLATE_NAME, type TemplateData } from '@/lib/templates';
import { confirmDialog } from './Confirm';
import { LoadError } from './LoadError';
import { Modal } from './Modal';

interface Template {
  id: string;
  name: string;
  isCompany: boolean;
  storeId: string | null;
  storeName: string | null;
  mine: boolean;
}

type Store = { id: string; name: string };
export type Scope = 'mine' | 'store' | 'company';

/**
 * The Save template dialog: a name (`name` to start with) and who may use it: the member alone, the store chosen on the form (`store`: undefined on a
 * page without a store picker, null while none is chosen) or, for a template editor (`canShare`), the company. `onSave` throws to show its error here.
 */
export function SaveTemplateDialog({ open, onClose, onSave, canShare, store, name: initial = '' }: { open: boolean; onClose: () => void; onSave: (name: string, scope: Scope) => Promise<void>; canShare: boolean; store?: Store | null; name?: string }) {
  const nameId = useId();
  const scopeId = useId();
  const [name, setName] = useState(initial);
  const [scope, setScope] = useState<Scope>('mine');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (open) (setName(initial), setScope('mine'), setError(''));
  }, [open]);
  async function save() {
    setBusy(true);
    setError('');
    try {
      await onSave(name.trim(), scope);
    } catch (e) {
      setError(errorText(e, 'Không lưu được thiết lập, hãy thử lại.'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={open} onClose={onClose} label="Lưu thiết lập" className="choice-dialog">
      <h2>Lưu thiết lập</h2>
      <label className="field-label" htmlFor={nameId}>
        Tên thiết lập
      </label>
      <input id={nameId} value={name} maxLength={MAX_TEMPLATE_NAME} onChange={(e) => setName(e.target.value)} />
      {(canShare || store !== undefined) && (
        <fieldset>
          <legend>Ai được dùng thiết lập này</legend>
          <label className="template-share">
            <input type="radio" name={scopeId} checked={scope === 'mine'} onChange={() => setScope('mine')} /> Cá nhân
          </label>
          {store !== undefined && (
            <label className="template-share">
              <input type="radio" name={scopeId} checked={scope === 'store'} disabled={!store} onChange={() => setScope('store')} /> {store ? `Cửa hàng ${store.name}` : 'Cửa hàng'}
            </label>
          )}
          {store === null && <p className="help">Chọn cửa hàng trên form để chia sẻ thiết lập với cửa hàng đó.</p>}
          {canShare && (
            <label className="template-share">
              <input type="radio" name={scopeId} checked={scope === 'company'} onChange={() => setScope('company')} /> Công ty
            </label>
          )}
        </fieldset>
      )}
      {canShare && <p className="help">Mẹo: viết {'${tên:mặc định}'} trong prompt để người dùng điền khi mở thiết lập.</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="primary" disabled={busy || !name.trim()} onClick={() => void save()}>
        Lưu
      </button>
    </Modal>
  );
}

/**
 * `data` reads the form when Save template is pressed: images as asset ids, the rest as the reuse link reads them from a job. `store` is the store chosen
 * on the form (null for none; leave it out on a page without a store picker): its templates are listed and it is offered as the scope.
 */
export function Templates({ feature, data, store }: { feature: string; data: () => TemplateData; store?: Store | null }) {
  const path = usePathname();
  const [open, setOpen] = useState<'list' | 'save' | null>(null);
  const [list, setList] = useState<{ templates: Template[]; canShare: boolean } | null>(null);
  const [error, setError] = useState('');
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState('');

  const load = () => {
    setFailed(false);
    return api<{ templates: Template[]; canShare: boolean }>(`/api/templates?feature=${feature}${store ? `&storeId=${encodeURIComponent(store.id)}` : ''}`).then(setList, () => setFailed(true));
  };
  const show = (which: 'list' | 'save') => {
    setError('');
    setNotice('');
    setOpen(which);
    void load();
  };

  async function save(name: string, scope: Scope) {
    const shared = scope === 'company' ? { isCompany: true } : scope === 'store' && store ? { storeId: store.id } : {};
    await api('/api/templates', sendJson('POST', { feature, name, data: Object.fromEntries(Object.entries(data()).filter(([, v]) => v !== '' && v !== undefined)), ...shared }));
    setOpen(null);
    setNotice('Đã lưu thiết lập.');
  }

  async function remove(t: Template) {
    if (!(await confirmDialog({ title: `Xoá thiết lập "${t.name}"?`, confirmLabel: 'Xoá', danger: true }))) return;
    try {
      await api(`/api/templates/${encodeURIComponent(t.id)}`, { method: 'DELETE' });
      void load();
    } catch (e) {
      setError(errorText(e, 'Không xoá được thiết lập.'));
    }
  }

  return (
    <div className="templates">
      {notice && <p role="status">{notice}</p>}
      <button type="button" className="link-button" onClick={() => show('list')}>
        Thiết lập đã lưu
      </button>
      <button type="button" className="link-button" onClick={() => show('save')}>
        Lưu thiết lập
      </button>
      <Modal open={open === 'list'} onClose={() => setOpen(null)} label="Thiết lập đã lưu" className="choice-dialog">
        <h2>Thiết lập đã lưu</h2>
        <p className="modal-sub">Lưu cả form (ảnh, cài đặt) để dùng lại.</p>
        {list === null ? (
          !failed && <p>Đang tải...</p>
        ) : list.templates.length === 0 ? (
          <p>Chưa có thiết lập nào. Điền form rồi bấm &quot;Lưu thiết lập&quot; để dùng lại sau.</p>
        ) : (
          <ul className="template-list">
            {list.templates.map((t) => (
              <li key={t.id}>
                <Link href={`${path}?template=${encodeURIComponent(t.id)}`} onClick={() => setOpen(null)}>
                  {t.name}
                </Link>
                {t.isCompany && <span className="tag">Công ty</span>}
                {t.storeName && <span className="tag">Cửa hàng: {t.storeName}</span>}
                {(t.mine || ((t.isCompany || t.storeId) && list.canShare)) && (
                  <button type="button" className="link-button" aria-label={`Xoá thiết lập ${t.name}`} onClick={() => void remove(t)}>
                    Xoá
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {failed && <LoadError text="Không tải được danh sách thiết lập." onRetry={load} />}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </Modal>
      <SaveTemplateDialog open={open === 'save'} onClose={() => setOpen(null)} onSave={save} canShare={list?.canShare ?? false} store={store} />
    </div>
  );
}
