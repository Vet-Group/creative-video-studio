'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LoadError } from '@/components/LoadError';
import { AUDIT_ACTIONS, auditChanges, auditLabel } from '@/lib/admin-ui';
import { api } from '@/lib/api';
import { useTabReturn } from '@/lib/use-tab-return';
import { Empty, PageHead } from './PageHead';

interface Entry {
  id: number;
  actorName: string;
  action: string;
  target: string;
  oldValue: unknown;
  newValue: unknown;
  createdAt: string;
}

const SHOWN_CHANGES = 3;

const fmtTime = (iso: string) => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso));

function AuditRow({ e }: { e: Entry }) {
  // Changed fields (old → new) first, so the cut to a few lines keeps what changed.
  const changes = auditChanges(e.oldValue, e.newValue).sort((a, b) => Number(b.text.includes(' → ')) - Number(a.text.includes(' → ')));
  // The raw JSON is rendered only while open, so a closed row carries no braces.
  const [open, setOpen] = useState(false);
  return (
    <tr>
      <td data-label="Thời gian" className="nowrap">
        {fmtTime(e.createdAt)}
      </td>
      <td data-label="Người thực hiện">{e.actorName}</td>
      <td data-label="Sự kiện">
        <code className="event" title={e.action}>
          {auditLabel(e.action)}
        </code>
      </td>
      <td data-label="Đối tượng" className="clip" title={e.target}>
        {e.target}
      </td>
      <td data-label="Thay đổi">
        <ul className="changes">
          {changes.slice(0, SHOWN_CHANGES).map((c) => (
            <li key={c.key} title={`${c.key}: ${c.text}`}>
              <span className="key">{c.key}:</span> {c.text}
            </li>
          ))}
          {changes.length > SHOWN_CHANGES && <li className="muted">+{changes.length - SHOWN_CHANGES} trường khác</li>}
        </ul>
        {changes.length > 0 && (
          <details className="raw" onToggle={(ev) => setOpen(ev.currentTarget.open)}>
            <summary>Chi tiết</summary>
            {open && (
              <div>
                <p>Trước</p>
                <pre>{e.oldValue == null ? '—' : JSON.stringify(e.oldValue, null, 2)}</pre>
                <p>Sau</p>
                <pre>{e.newValue == null ? '—' : JSON.stringify(e.newValue, null, 2)}</pre>
              </div>
            )}
          </details>
        )}
      </td>
    </tr>
  );
}

export function AdminAudit() {
  const [action, setAction] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const latest = useRef(0);

  const load = useCallback(
    async (offset: number) => {
      const ticket = ++latest.current;
      const q = new URLSearchParams();
      if (action) q.set('action', action);
      if (offset > 0) q.set('offset', String(offset));
      try {
        const r = await api<{ entries: Entry[]; hasMore: boolean }>(`/api/admin/audit?${q}`);
        if (ticket !== latest.current) return;
        setEntries((cur) => (offset > 0 ? [...cur, ...r.entries] : r.entries));
        setHasMore(r.hasMore);
        setState('ready');
      } catch {
        if (ticket === latest.current) setState('error');
      }
    },
    [action],
  );

  useEffect(() => {
    setState('loading');
    void load(0);
  }, [load]);
  useTabReturn(() => void load(0));

  return (
    <section aria-labelledby="audit-title">
      <PageHead id="audit-title" title="Nhật ký" lead="Mọi thay đổi của Admin và người dùng, mới nhất trước. Bấm “Chi tiết” để xem giá trị đầy đủ.">
        <div className="filters" role="search" aria-label="Bộ lọc nhật ký">
          <label>
            Loại sự kiện
            <select value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="">Tất cả</option>
              {Object.entries(AUDIT_ACTIONS).map(([a, label]) => (
                <option key={a} value={a}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </PageHead>
      {state === 'loading' && <p role="status">Đang tải...</p>}
      {state === 'error' && <LoadError text="Không tải được nhật ký." onRetry={() => (setState('loading'), load(0))} />}
      {state === 'ready' && entries.length === 0 && <Empty title="Chưa có sự kiện nào khớp bộ lọc" />}
      {entries.length > 0 && (
        <div className="table-wrap">
          <table className="mobile-records audit">
            <colgroup>
              <col className="c-time" />
              <col className="c-actor" />
              <col className="c-event" />
              <col className="c-target" />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Thời gian</th>
                <th scope="col">Người thực hiện</th>
                <th scope="col">Sự kiện</th>
                <th scope="col">Đối tượng</th>
                <th scope="col">Thay đổi</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <AuditRow key={e.id} e={e} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {hasMore && (
        <button type="button" onClick={() => void load(entries.length)}>
          Tải thêm
        </button>
      )}
    </section>
  );
}
