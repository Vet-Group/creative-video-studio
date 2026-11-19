'use client';
// A workspace's members (docs/WORKSPACES.md phase 3): the owner's Members page and, for any workspace, the Admin's Workspaces page. Same look as Admin > Users.
import { useState } from 'react';
import { api, sendJson } from '@/lib/api';
import { useAction, useFetch } from '@/lib/admin-ui';
import { confirmDialog } from './Confirm';
import { Icon } from './Icon';
import { LoadError } from './LoadError';

interface Member {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'member';
  /** A global Admin of CVS, in an Admin's view only (an owner's list leaves it out). */
  admin?: boolean;
}

/** The first letters of the first and last words of a name, for the round badge (as on Admin > Users). */
const initials = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? '?') + (words.length > 1 ? words[words.length - 1]![0] : '')).toUpperCase();
};

/** A new account's temporary password, shown once to copy to the person: CVS sends no email, and they replace it at their first sign-in. */
export function TemporaryPassword({ email, password, onDone }: { email: string; password: string; onDone: () => void }) {
  const [note, setNote] = useState('');
  const copy = () => navigator.clipboard.writeText(password).then(() => setNote('Đã sao chép.'), () => setNote('Không sao chép được, hãy chép tay.'));
  return (
    <div className="warn temp-password" role="status">
      <p>
        Mật khẩu tạm của <strong>{email}</strong>: <code>{password}</code>
      </p>
      <p>Mật khẩu chỉ hiện lần này. Hãy gửi cho người đó qua kênh riêng; họ phải đặt mật khẩu mới ở lần đăng nhập đầu tiên.</p>
      <div className="actions">
        <button type="button" onClick={() => void copy()}>
          <Icon name="copy" size={16} />
          Sao chép
        </button>
        <button type="button" className="primary" onClick={onDone}>
          Đã lưu
        </button>
        {note && <span role="status">{note}</span>}
      </div>
    </div>
  );
}

/** The owner's rename of their workspace; the page reloads so the switcher and the heading show the new name. */
export function WorkspaceName({ id, name }: { id: string; name: string }) {
  const { problem, pending, run } = useAction(() => window.location.reload());
  const [next, setNext] = useState(name);
  return (
    <fieldset>
      <legend>Tên không gian làm việc</legend>
      <div className="row">
        <label>
          Tên
          <input value={next} onChange={(e) => setNext(e.target.value)} />
        </label>
        <button type="button" className="primary" disabled={pending || !next.trim() || next.trim() === name} onClick={() => void run(() => api(`/api/workspaces/${id}`, sendJson('PATCH', { name: next })), 'Không đổi được tên.')}>
          Đổi tên
        </button>
      </div>
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
    </fieldset>
  );
}

/** Add, list, re-role and remove the members of workspace `id`. `meId` marks the viewer's own row; `admin` is an Admin managing it from the Workspaces page. */
export function WorkspaceMembers({ id, meId, admin = false }: { id: string; meId: string; admin?: boolean }) {
  const members = useFetch<{ members: Member[] }>(`/api/workspaces/${id}/members`);
  const { problem, pending, run } = useAction(members.reload);
  const [email, setEmail] = useState('');
  const [create, setCreate] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState<Member['role']>('member');
  const [made, setMade] = useState<{ email: string; password: string } | null>(null);

  async function add() {
    const body = { email, role, ...(create ? { name } : {}) };
    const ok = await run(async () => {
      const r = await api<{ temporaryPassword?: string }>(`/api/workspaces/${id}/members`, sendJson('POST', body));
      if (r.temporaryPassword) setMade({ email: email.trim().toLowerCase(), password: r.temporaryPassword });
    }, 'Không thêm được thành viên.');
    if (ok) {
      setEmail('');
      setName('');
      setCreate(false);
      setRole('member');
    }
  }
  async function remove(m: Member) {
    const yes = await confirmDialog({
      title: `Xoá ${m.name} khỏi không gian làm việc?`,
      body: m.id === meId ? 'Bạn sẽ không vào được không gian làm việc này nữa.' : 'Người này sẽ không vào được không gian làm việc này nữa. Những gì họ đã tạo vẫn ở lại.',
      confirmLabel: 'Xoá khỏi không gian',
      danger: true,
    });
    if (yes) void run(() => api(`/api/workspaces/${id}/members/${m.id}`, { method: 'DELETE' }), 'Không xoá được thành viên.');
  }

  return (
    <>
      <fieldset>
        <legend>Thêm thành viên</legend>
        <div className="row">
          <label>
            Email
            <input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {create && (
            <label>
              Tên hiển thị
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
          )}
          <label>
            Vai trò trong không gian
            <select value={role} onChange={(e) => setRole(e.target.value as Member['role'])}>
              <option value="member">Thành viên</option>
              <option value="owner">Chủ sở hữu</option>
            </select>
          </label>
          <div className="check-field">
            <label className="check">
              <input type="checkbox" checked={create} onChange={(e) => setCreate(e.target.checked)} />
              Tạo tài khoản mới
            </label>
            <small>Có mật khẩu tạm để gửi cho người đó.</small>
          </div>
          <button type="button" className="primary" disabled={pending || !email.trim() || (create && !name.trim())} onClick={() => void add()}>
            Thêm thành viên
          </button>
        </div>
        <p className="muted">
          {admin
            ? 'Người đã có tài khoản: nhập email của họ. Người mới: đánh dấu “Tạo tài khoản mới”.'
            : 'Người đã có tài khoản CVS: nhập email của họ. Người mới: đánh dấu “Tạo tài khoản mới”. Chủ sở hữu thêm, xoá thành viên và đổi tên không gian.'}
        </p>
      </fieldset>
      {made && <TemporaryPassword email={made.email} password={made.password} onDone={() => setMade(null)} />}
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      {members.failed ? (
        <LoadError text="Không tải được danh sách thành viên." onRetry={members.reload} />
      ) : !members.data ? (
        <p role="status">Đang tải...</p>
      ) : (
        <div className="table-wrap">
          <table className="mobile-records users">
            <thead>
              <tr>
                <th scope="col">Thành viên</th>
                <th scope="col">Vai trò</th>
                <th scope="col">
                  <span className="sr-only">Thao tác</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {members.data.members.map((m) => (
                <tr key={m.id}>
                  <td data-label="Thành viên">
                    <div className="who">
                      <span className="avatar" data-role={m.admin ? 'admin' : 'member'} aria-hidden="true">
                        {initials(m.name)}
                      </span>
                      <span className="who-text">
                        <strong>
                          {m.name}
                          {m.id === meId && ' (bạn)'}
                        </strong>
                        <span className="muted">{m.email}</span>
                      </span>
                    </div>
                  </td>
                  <td data-label="Vai trò">
                    <select aria-label={`Vai trò của ${m.email}`} value={m.role} disabled={pending} onChange={(e) => void run(() => api(`/api/workspaces/${id}/members/${m.id}`, sendJson('PATCH', { role: e.target.value })), 'Không đổi được vai trò.')}>
                      <option value="member">Thành viên</option>
                      <option value="owner">Chủ sở hữu</option>
                    </select>
                    {m.admin && <span className="tag">Admin CVS</span>}
                  </td>
                  <td className="row-end">
                    <button type="button" className="small danger" aria-label={`Xoá ${m.email} khỏi không gian`} disabled={pending} onClick={() => void remove(m)}>
                      Xoá
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
