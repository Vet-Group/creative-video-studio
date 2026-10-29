// Saved forms (a client module: only the client forms import it): Save template keeps the page's current inputs under a name, My templates lists them (and the company's) and reopens the page filled from one.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { api, errorText, sendJson } from '@/lib/api';
import { MAX_TEMPLATE_NAME, type TemplateData } from '@/lib/templates';
import { Modal } from './Modal';

interface Template {
  id: string;
  name: string;
  isCompany: boolean;
  mine: boolean;
}

/** The Save template dialog: a name (`name` to start with) and, for an Admin, the company share box. `onSave` throws to show its error here. */
export function SaveTemplateDialog({ open, onClose, onSave, canShare, name: initial = '' }: { open: boolean; onClose: () => void; onSave: (name: string, share: boolean) => Promise<void>; canShare: boolean; name?: string }) {
  const nameId = useId();
  const [name, setName] = useState(initial);
  const [share, setShare] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (open) (setName(initial), setShare(false), setError(''));
  }, [open]);
  async function save() {
    setBusy(true);
    setError('');
    try {
      await onSave(name.trim(), share);
    } catch (e) {
      setError(errorText(e, 'Không lưu được mẫu, hãy thử lại.'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={open} onClose={onClose} label="Lưu mẫu" className="choice-dialog">
      <h2>Lưu mẫu</h2>
      <label className="field-label" htmlFor={nameId}>
        Tên mẫu
      </label>
      <input id={nameId} value={name} maxLength={MAX_TEMPLATE_NAME} onChange={(e) => setName(e.target.value)} />
      {canShare && (
        <label className="template-share">
          <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} /> Chia sẻ cho cả công ty
        </label>
      )}
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

/** `data` reads the form when Save template is pressed: images as asset ids, the rest as the reuse link reads them from a job. */
export function Templates({ feature, data }: { feature: string; data: () => TemplateData }) {
  const path = usePathname();
  const [open, setOpen] = useState<'list' | 'save' | null>(null);
  const [list, setList] = useState<{ templates: Template[]; canShare: boolean } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = () => api<{ templates: Template[]; canShare: boolean }>(`/api/templates?feature=${feature}`).then(setList, () => setError('Không tải được danh sách mẫu.'));
  const show = (which: 'list' | 'save') => {
    setError('');
    setNotice('');
    setOpen(which);
    void load();
  };

  async function save(name: string, share: boolean) {
    await api('/api/templates', sendJson('POST', { feature, name, data: Object.fromEntries(Object.entries(data()).filter(([, v]) => v !== '' && v !== undefined)), ...(share && { isCompany: true }) }));
    setOpen(null);
    setNotice('Đã lưu mẫu.');
  }

  async function remove(t: Template) {
    if (!window.confirm(`Xoá mẫu "${t.name}"?`)) return;
    try {
      await api(`/api/templates/${encodeURIComponent(t.id)}`, { method: 'DELETE' });
      void load();
    } catch (e) {
      setError(errorText(e, 'Không xoá được mẫu.'));
    }
  }

  return (
    <div className="templates">
      {notice && <p role="status">{notice}</p>}
      <button type="button" className="link-button" onClick={() => show('list')}>
        Mẫu của tôi
      </button>
      <button type="button" className="link-button" onClick={() => show('save')}>
        Lưu mẫu
      </button>
      <Modal open={open === 'list'} onClose={() => setOpen(null)} label="Mẫu của tôi" className="choice-dialog">
        <h2>Mẫu của tôi</h2>
        {list === null ? (
          <p>Đang tải...</p>
        ) : list.templates.length === 0 ? (
          <p>Chưa có mẫu nào. Điền form rồi bấm &quot;Lưu mẫu&quot; để dùng lại sau.</p>
        ) : (
          <ul className="template-list">
            {list.templates.map((t) => (
              <li key={t.id}>
                <Link href={`${path}?template=${encodeURIComponent(t.id)}`} onClick={() => setOpen(null)}>
                  {t.name}
                </Link>
                {t.isCompany && <span className="tag">Công ty</span>}
                {(t.mine || (t.isCompany && list.canShare)) && (
                  <button type="button" className="link-button" aria-label={`Xoá mẫu ${t.name}`} onClick={() => void remove(t)}>
                    Xoá
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </Modal>
      <SaveTemplateDialog open={open === 'save'} onClose={() => setOpen(null)} onSave={save} canShare={list?.canShare ?? false} />
    </div>
  );
}
