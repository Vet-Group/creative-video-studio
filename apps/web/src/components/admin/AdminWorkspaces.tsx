'use client';
import { useState } from 'react';
import { confirmDialog } from '@/components/Confirm';
import { Icon } from '@/components/Icon';
import { LoadError } from '@/components/LoadError';
import { Modal } from '@/components/Modal';
import { TemporaryPassword, WorkspaceMembers } from '@/components/WorkspaceMembers';
import { api, sendJson } from '@/lib/api';
import { useAction, useFetch } from '@/lib/admin-ui';
import { PageHead } from './PageHead';

interface Workspace {
  id: string;
  name: string;
  disabled: boolean;
  members: number;
  jobsThisMonth: number;
  costThisMonthUsd: string;
  owners: { id: string; name: string; email: string }[];
}

/** The company's workspace (`ws_vet`): it keeps its name and stays enabled; its staff are managed on Admin > Users. */
const COMPANY = 'ws_vet';
const usd = (v: string) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** One workspace in the dialog: its name, its members, and the switch that disables it. */
function WorkspaceEditor({ ws, meId, reload }: { ws: Workspace; meId: string; reload: () => void }) {
  const { problem, pending, run } = useAction(reload);
  const [name, setName] = useState(ws.name);
  const company = ws.id === COMPANY;
  return (
    <>
      <h2>{ws.name}</h2>
      <p className="modal-sub">{company ? 'Không gian của công ty' : ws.disabled ? 'Đã tắt' : 'Đang hoạt động'}</p>
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      {!company && (
        <div className="editor-section">
          <div className="actions">
            <input aria-label={`Tên mới của ${ws.name}`} value={name} onChange={(e) => setName(e.target.value)} />
            <button type="button" className="primary" disabled={pending || !name.trim() || name.trim() === ws.name} onClick={() => void run(() => api(`/api/workspaces/${ws.id}`, sendJson('PATCH', { name })), 'Không đổi được tên.')}>
              Đổi tên
            </button>
            <button
              type="button"
              className={ws.disabled ? undefined : 'danger'}
              disabled={pending}
              onClick={async () => {
                if (!ws.disabled && !(await confirmDialog({ title: `Tắt ${ws.name}?`, body: 'Thành viên sẽ chuyển sang không gian làm việc khác của họ, hoặc thấy thông báo chưa có không gian. Không xoá dữ liệu nào; bật lại được bất cứ lúc nào.', confirmLabel: 'Tắt', danger: true }))) return;
                void run(() => api(`/api/workspaces/${ws.id}`, sendJson('PATCH', { disabled: !ws.disabled })), ws.disabled ? 'Không bật lại được.' : 'Không tắt được.');
              }}
            >
              {ws.disabled ? 'Bật lại' : 'Tắt không gian'}
            </button>
          </div>
        </div>
      )}
      <div className="editor-section">
        <h3>Thành viên</h3>
        {company && <p className="muted">Nhân viên công ty được quản lý ở trang Người dùng; ở đây chỉ thêm, xoá hoặc đổi vai trò trong không gian.</p>}
        <WorkspaceMembers id={ws.id} meId={meId} admin />
      </div>
    </>
  );
}

/** Admin: every workspace with its owners and usage this month, a form that creates one with its first owner, and a dialog per workspace. */
export function AdminWorkspaces({ meId }: { meId: string }) {
  const list = useFetch<{ workspaces: Workspace[] }>('/api/admin/workspaces');
  const { problem, pending, run } = useAction(list.reload);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [create, setCreate] = useState(false);
  const [ownerName, setOwnerName] = useState('');
  const [made, setMade] = useState<{ email: string; password: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const head = <PageHead id="workspaces-title" title="Không gian làm việc" lead="Mỗi không gian có thành viên và dữ liệu riêng: đối tác chỉ thấy không gian của mình. Số liệu là lượt tạo và chi phí của tháng này, không kèm nội dung." />;
  if (!list.data)
    return (
      <section aria-labelledby="workspaces-title">
        {head}
        {list.failed ? <LoadError text="Không tải được danh sách không gian làm việc." onRetry={list.reload} /> : <p role="status">Đang tải...</p>}
      </section>
    );
  const editWs = list.data.workspaces.find((w) => w.id === editing);

  async function add() {
    const body = { name, ownerEmail: email, ...(create ? { ownerName } : {}) };
    const ok = await run(async () => {
      const r = await api<{ temporaryPassword?: string }>('/api/admin/workspaces', sendJson('POST', body));
      if (r.temporaryPassword) setMade({ email: email.trim().toLowerCase(), password: r.temporaryPassword });
    }, 'Không tạo được không gian làm việc.');
    if (ok) {
      setName('');
      setEmail('');
      setOwnerName('');
      setCreate(false);
    }
  }

  return (
    <section aria-labelledby="workspaces-title">
      {head}
      <fieldset>
        <legend>Tạo không gian làm việc</legend>
        <div className="row">
          <label>
            Tên không gian
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Email chủ sở hữu
            <input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {create && (
            <label>
              Tên chủ sở hữu
              <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
            </label>
          )}
          <div className="check-field">
            <label className="check">
              <input type="checkbox" checked={create} onChange={(e) => setCreate(e.target.checked)} />
              Tạo tài khoản mới cho chủ sở hữu
            </label>
            <small>Có mật khẩu tạm để gửi cho người đó.</small>
          </div>
          <button type="button" className="primary" disabled={pending || !name.trim() || !email.trim() || (create && !ownerName.trim())} onClick={() => void add()}>
            Tạo không gian
          </button>
        </div>
        <p className="muted">Chủ sở hữu tự thêm, xoá thành viên của không gian mình ở trang Thành viên. Cửa hàng của đối tác tạo ở trang Cửa hàng khi đang ở không gian đó.</p>
      </fieldset>
      {made && <TemporaryPassword email={made.email} password={made.password} onDone={() => setMade(null)} />}
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      <div className="table-wrap">
        <table className="mobile-records workspaces">
          <thead>
            <tr>
              <th scope="col">Không gian</th>
              <th scope="col">Chủ sở hữu</th>
              <th scope="col" className="num">
                Thành viên
              </th>
              <th scope="col" className="num">
                Lượt tạo tháng này
              </th>
              <th scope="col" className="num">
                Chi phí tháng này
              </th>
              <th scope="col">Trạng thái</th>
              <th scope="col">
                <span className="sr-only">Thao tác</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {list.data.workspaces.map((w) => (
              <tr key={w.id}>
                <td data-label="Không gian">
                  <strong>{w.name}</strong>
                  {w.id === COMPANY && <span className="tag">Công ty</span>}
                </td>
                <td data-label="Chủ sở hữu">
                  {w.owners.length === 0 ? (
                    '—'
                  ) : (
                    <ul className="owners">
                      {w.owners.map((o) => (
                        <li key={o.id} title={o.email}>
                          {o.name}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td data-label="Thành viên" className="num">
                  {w.members}
                </td>
                <td data-label="Lượt tạo tháng này" className="num">
                  {w.jobsThisMonth}
                </td>
                <td data-label="Chi phí tháng này" className="num">
                  {usd(w.costThisMonthUsd)}
                </td>
                <td data-label="Trạng thái">
                  <span className={w.disabled ? 'status off' : 'status'}>{w.disabled ? 'Đã tắt' : 'Hoạt động'}</span>
                </td>
                <td className="row-end">
                  <button type="button" className="small" aria-label={`Quản lý ${w.name}`} onClick={() => setEditing(w.id)}>
                    <Icon name="edit" />
                    Quản lý
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal open={editWs !== undefined} onClose={() => setEditing(null)} label={editWs ? `Quản lý ${editWs.name}` : 'Quản lý không gian làm việc'} className="admin-modal">
        {editWs && <WorkspaceEditor key={editWs.id} ws={editWs} meId={meId} reload={list.reload} />}
      </Modal>
    </section>
  );
}
