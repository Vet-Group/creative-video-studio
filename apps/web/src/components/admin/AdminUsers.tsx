'use client';
import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { Modal } from '@/components/Modal';
import { api, sendJson } from '@/lib/api';
import { useAction, useFetch } from '@/lib/admin-ui';
import { methodText, providerLabel, type SignInMethod } from '@/lib/sign-in-methods';
import { Empty, PageHead } from './PageHead';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'member' | 'admin';
  banned: boolean | null;
  teamId: string;
  methods: SignInMethod[];
}
interface Team {
  id: string;
  name: string;
  hidden: boolean;
}

/** Lower case without accents, so a search typed without accents still finds an accented name. */
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase();
/** The first letters of the first and last words of a name, for the round badge. */
const initials = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? '?') + (words.length > 1 ? words[words.length - 1]![0] : '')).toUpperCase();
};

/** Everything an Admin changes on one user: name and email, role, team, sign-in methods, a temporary password, lock. */
function UserEditor({ user, teams, reload }: { user: User; teams: Team[]; reload: () => void }) {
  // Its own action state, so a failure here and one in the add form never show in each other's place.
  const { problem, run } = useAction(reload);
  const [password, setPassword] = useState<string | null>(null);
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const patch = (body: Record<string, unknown>, fallback: string) => run(() => api(`/api/admin/users/${user.id}`, sendJson('PATCH', body)), fallback);
  const edited = name.trim() !== user.name || email.trim().toLowerCase() !== user.email;
  return (
    <>
      <h2>{user.name}</h2>
      <p className="modal-sub">{user.email}</p>
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      <div className="editor-section">
        <div className="row">
          <label>
            Tên
            <input aria-label={`Tên của ${user.email}`} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Email
            <input type="email" aria-label={`Email của ${user.email}`} value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
        </div>
        {edited && (
          <button type="button" className="primary" disabled={name.trim() === '' || email.trim() === ''} onClick={() => void patch({ name, email }, 'Không lưu được tên hoặc email.')}>
            Lưu tên, email
          </button>
        )}
        <div className="row">
          <label>
            Vai trò
            <select aria-label={`Vai trò của ${user.email}`} value={user.role} onChange={(e) => void patch({ role: e.target.value }, 'Không đổi được vai trò.')}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label>
            Nhóm
            <select aria-label={`Nhóm của ${user.email}`} value={user.teamId} onChange={(e) => void patch({ teamId: e.target.value }, 'Không đổi được nhóm.')}>
              {teams
                .filter((t) => !t.hidden || t.id === user.teamId)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.hidden ? ' (đã ẩn)' : ''}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <small className="muted">Vai trò và nhóm lưu ngay khi chọn. Đổi nhóm chỉ áp dụng cho các job mới.</small>
      </div>
      <div className="editor-section">
        <h3>Phương thức đăng nhập</h3>
        <ul className="methods">
          {user.methods.map((m) => (
            <li key={m.id}>
              <span>{methodText(m)}</span>
              {m.provider !== 'credential' && (
                <button
                  type="button"
                  className="small"
                  aria-label={m.provider === 'passkey' ? `Xoá ${methodText(m)} của ${user.email}` : `Huỷ liên kết ${providerLabel(m.provider)} của ${user.email}`}
                  onClick={() => void run(() => api(`/api/admin/users/${user.id}/accounts/${m.id}`, { method: 'DELETE' }), 'Không huỷ được liên kết.')}
                >
                  {m.provider === 'passkey' ? 'Xoá' : 'Huỷ liên kết'}
                </button>
              )}
            </li>
          ))}
          {user.methods.length === 0 && <li className="muted">Chưa có cách đăng nhập nào.</li>}
        </ul>
      </div>
      <div className="editor-section">
        <h3>Bảo mật</h3>
        <div className="actions">
          {/* The temporary password field shows only while it is being set. */}
          {password === null ? (
            <button type="button" onClick={() => setPassword('')}>
              Đặt mật khẩu tạm
            </button>
          ) : (
            <>
              <input type="password" autoComplete="new-password" autoFocus aria-label={`Mật khẩu tạm của ${user.email}`} value={password} onChange={(e) => setPassword(e.target.value)} />
              <button
                type="button"
                className="primary"
                disabled={password.trim() === ''}
                onClick={() => void patch({ temporaryPassword: password }, 'Không đặt được mật khẩu tạm.').then((ok) => ok && setPassword(null))}
              >
                Lưu mật khẩu
              </button>
              <button type="button" onClick={() => setPassword(null)}>
                Huỷ
              </button>
            </>
          )}
          <button type="button" className={user.banned ? undefined : 'danger'} onClick={() => void patch({ banned: !user.banned }, user.banned ? 'Không mở khóa được.' : 'Không khóa được.')}>
            {user.banned ? 'Mở khóa' : 'Khóa'}
          </button>
        </div>
      </div>
    </>
  );
}

function UserRow({ user, team, onEdit }: { user: User; team: string; onEdit: () => void }) {
  return (
    <tr>
      <td data-label="Người dùng">
        <div className="who">
          <span className="avatar" data-role={user.role} aria-hidden="true">
            {initials(user.name)}
          </span>
          <span className="who-text">
            <strong>{user.name}</strong>
            <span className="muted">{user.email}</span>
          </span>
        </div>
      </td>
      <td data-label="Vai trò">
        <span className={user.role === 'admin' ? 'role admin' : 'role'}>{user.role === 'admin' ? 'Admin' : 'Member'}</span>
      </td>
      <td data-label="Nhóm">{team}</td>
      <td data-label="Đăng nhập">
        <ul className="sign-ins">
          {user.methods.map((m) => (
            <li key={m.id} title={methodText(m)}>
              {m.provider === 'credential' ? 'Mật khẩu' : providerLabel(m.provider)}
            </li>
          ))}
        </ul>
      </td>
      <td data-label="Trạng thái">
        <span className={user.banned ? 'status off' : 'status'}>{user.banned ? 'Đã khóa' : 'Hoạt động'}</span>
      </td>
      <td className="row-end">
        <button type="button" className="small" aria-label={`Sửa ${user.email}`} onClick={onEdit}>
          <Icon name="edit" />
          Sửa
        </button>
      </td>
    </tr>
  );
}

export function AdminUsers() {
  const users = useFetch<{ users: User[] }>('/api/admin/users');
  const teams = useFetch<{ teams: Team[] }>('/api/admin/teams?includeHidden=1');
  const { problem, run } = useAction(users.reload);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [teamId, setTeamId] = useState('');
  const [role, setRole] = useState('member');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);

  const head = <PageHead id="users-title" title="Người dùng" lead="Tạo tài khoản cho nhân viên; bấm “Sửa” ở mỗi dòng để đổi tên, email, vai trò, nhóm, mật khẩu tạm hoặc khóa tài khoản." />;
  if (!users.data || !teams.data)
    return (
      <section aria-labelledby="users-title">
        {head}
        {users.failed || teams.failed ? <p className="error">Không tải được danh sách người dùng.</p> : <p role="status">Đang tải...</p>}
      </section>
    );
  const allTeams = teams.data.teams;
  const visible = allTeams.filter((t) => !t.hidden);
  const teamName = (id: string) => allTeams.find((t) => t.id === id)?.name ?? '—';
  const shown = users.data.users.filter((u) => fold(`${u.name} ${u.email}`).includes(fold(query.trim())));
  const editUser = users.data.users.find((u) => u.id === editing);

  async function add() {
    const ok = await run(() => api('/api/admin/users', sendJson('POST', { email, name, teamId, role, ...(password ? { password } : {}) })), 'Không thêm được người dùng.');
    if (ok) {
      setEmail('');
      setName('');
      setPassword('');
    }
  }

  return (
    <section aria-labelledby="users-title">
      {head}
      <fieldset>
        <legend>Thêm người dùng</legend>
        <div className="row">
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Tên hiển thị
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Nhóm của người dùng mới
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="">Chọn nhóm</option>
              {visible.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Vai trò của người dùng mới
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label>
            Mật khẩu (không bắt buộc)
            <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <button type="button" className="primary" disabled={!email.trim() || !name.trim() || !teamId} onClick={() => void add()}>
            Thêm người dùng
          </button>
        </div>
        <p className="muted">Dùng Gmail hoặc email công ty trên Lark của người đó. Không đặt mật khẩu thì chỉ đăng nhập được bằng Lark hoặc Google.</p>
        <details className="help">
          <summary>Đăng nhập bằng Google, Lark hoạt động thế nào?</summary>
          <p>
            Lần đầu đăng nhập bằng Google hoặc Lark, app tìm tài khoản theo đúng email này. Muốn dùng cả hai, người đó đăng nhập một cách rồi bấm “Liên kết”
            cách còn lại ở trang Phương thức đăng nhập.
          </p>
        </details>
      </fieldset>
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      <div className="filters" role="search" aria-label="Tìm người dùng">
        <label>
          Tìm theo tên hoặc email
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <p className="muted" role="status">
          {query.trim() ? `${shown.length} trên ${users.data.users.length} người dùng` : `${users.data.users.length} người dùng`}
        </p>
      </div>
      {shown.length === 0 ? (
        <Empty title={`Không có người dùng nào khớp “${query.trim()}”.`} />
      ) : (
        <div className="table-wrap">
          <table className="mobile-records users">
            <thead>
              <tr>
                <th scope="col">Người dùng</th>
                <th scope="col">Vai trò</th>
                <th scope="col">Nhóm</th>
                <th scope="col">Đăng nhập</th>
                <th scope="col">Trạng thái</th>
                <th scope="col">
                  <span className="sr-only">Thao tác</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((u) => (
                <UserRow key={u.id} user={u} team={teamName(u.teamId)} onEdit={() => setEditing(u.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={editUser !== undefined} onClose={() => setEditing(null)} label={editUser ? `Sửa người dùng ${editUser.email}` : 'Sửa người dùng'} className="admin-modal">
        {editUser && <UserEditor key={editUser.id} user={editUser} teams={allTeams} reload={users.reload} />}
      </Modal>
    </section>
  );
}
