'use client';
import { useState } from 'react';
import { api, sendJson } from '@/lib/api';
import { useAction, useFetch } from '@/lib/admin-ui';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'member' | 'admin';
  banned: boolean | null;
  teamId: string;
}
interface Team {
  id: string;
  name: string;
  hidden: boolean;
}
type Run = ReturnType<typeof useAction>['run'];

function UserRow({ user, teams, run }: { user: User; teams: Team[]; run: Run }) {
  const [password, setPassword] = useState('');
  const patch = (body: Record<string, unknown>, fallback: string) => run(() => api(`/api/admin/users/${user.id}`, sendJson('PATCH', body)), fallback);
  return (
    <tr>
      <td>{user.name}</td>
      <td>{user.email}</td>
      <td>
        <select aria-label={`Vai trò của ${user.email}`} value={user.role} onChange={(e) => void patch({ role: e.target.value }, 'Không đổi được vai trò.')}>
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
      </td>
      <td>
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
      </td>
      <td>{user.banned ? 'Đã khóa' : 'Hoạt động'}</td>
      <td>
        <div className="actions">
          <button type="button" onClick={() => void patch({ banned: !user.banned }, user.banned ? 'Không mở khóa được.' : 'Không khóa được.')}>
            {user.banned ? 'Mở khóa' : 'Khóa'}
          </button>
          <input type="password" autoComplete="new-password" aria-label={`Mật khẩu tạm của ${user.email}`} value={password} onChange={(e) => setPassword(e.target.value)} />
          <button
            type="button"
            disabled={password.trim() === ''}
            onClick={() => void patch({ temporaryPassword: password }, 'Không đặt được mật khẩu tạm.').then((ok) => ok && setPassword(''))}
          >
            Đặt mật khẩu tạm
          </button>
        </div>
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

  if (!users.data || !teams.data) return users.failed || teams.failed ? <p className="error">Không tải được danh sách người dùng.</p> : <p role="status">Đang tải...</p>;
  const visible = teams.data.teams.filter((t) => !t.hidden);

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
      <h1 id="users-title">Người dùng</h1>
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
        <p className="muted">Người dùng không có mật khẩu chỉ đăng nhập được bằng Lark. Đổi nhóm chỉ áp dụng cho các job mới.</p>
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
              <th scope="col">Tên</th>
              <th scope="col">Email</th>
              <th scope="col">Vai trò</th>
              <th scope="col">Nhóm</th>
              <th scope="col">Trạng thái</th>
              <th scope="col">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {users.data.users.map((u) => (
              <UserRow key={u.id} user={u} teams={teams.data!.teams} run={run} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
