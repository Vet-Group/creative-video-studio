'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { auditChanges } from '@/lib/admin-ui';
import { api } from '@/lib/api';
import { useTabReturn } from '@/lib/use-tab-return';

interface Entry {
  id: number;
  actorName: string;
  action: string;
  target: string;
  oldValue: unknown;
  newValue: unknown;
  createdAt: string;
}

// The events the audit log records, for the filter.
const ACTIONS = [
  'account.link', 'account.unlink', 'clip.delete', 'cost.manual_adjustment', 'invoice.enter', 'model.set_enabled', 'preset.update', 'rate.update', 'sample.delete', 'sample.put', 'settings.update', 'store.create', 'store.hide',
  'store.reassign', 'store.update', 'team.create', 'team.hide', 'team.rename', 'user.ban', 'user.password_set', 'user.role_change', 'user.team_change', 'user.unban', 'user.update', 'verdict.set',
];

const fmtTime = (iso: string) => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso));

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
      <h1 id="audit-title">Nhật ký</h1>
      <div className="filters" role="search" aria-label="Bộ lọc nhật ký">
        <label>
          Loại sự kiện
          <select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">Tất cả</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
      </div>
      {state === 'loading' && <p role="status">Đang tải...</p>}
      {state === 'error' && <p className="error">Không tải được nhật ký.</p>}
      {state === 'ready' && entries.length === 0 && <p className="muted">Chưa có sự kiện nào khớp bộ lọc.</p>}
      <div className="table-wrap">
        <table>
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
              <tr key={e.id}>
                <td className="nowrap">{fmtTime(e.createdAt)}</td>
                <td>{e.actorName}</td>
                <td>
                  <code className="event">{e.action}</code>
                </td>
                <td>{e.target}</td>
                <td>
                  <ul className="changes">
                    {auditChanges(e.oldValue, e.newValue).map((c) => (
                      <li key={c.key}>
                        <span className="key">{c.key}:</span> {c.text}
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasMore && (
        <button type="button" onClick={() => void load(entries.length)}>
          Tải thêm
        </button>
      )}
    </section>
  );
}
