'use client';
import { useState } from 'react';
import { confirmDialog } from '@/components/Confirm';
import { Icon } from '@/components/Icon';
import { Modal } from '@/components/Modal';
import { LoadError } from '@/components/LoadError';
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
  /** Whether a password sign-in also asks for a TOTP code. */
  twoFactor: boolean;
  /** A template editor: edits the motion presets on Create and decides the members' proposals, as an Admin does. */
  canEditTemplates: boolean;
  /** An automation account (deploy Admin, test, demo): listed apart from the staff, never deleted for that. */
  system: boolean;
  /** Not in the company's Lark organisation: never asked to link Lark. */
  outsideLark: boolean;
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
/** Admin: the stores assigned to a user. An assigned store leads that user's store pickers (the "theirs" group), as one they pinned does. */
function StoreAssign({ user }: { user: User }) {
  const stores = useFetch<{ stores: { id: string; name: string }[] }>('/api/stores');
  const assigned = useFetch<{ storeIds: string[] }>(`/api/admin/users/${user.id}/stores`);
  const { problem, pending, run } = useAction(assigned.reload);
  if (stores.failed || assigned.failed)
    return (
      <div className="editor-section">
        <h3>Cửa hàng phụ trách</h3>
        <LoadError text="Không tải được cửa hàng." onRetry={() => (stores.reload(), assigned.reload())} />
      </div>
    );
  if (!stores.data || !assigned.data)
    return (
      <div className="editor-section">
        <h3>Cửa hàng phụ trách</h3>
        <p role="status">Đang tải...</p>
      </div>
    );
  const have = new Set(assigned.data.storeIds);
  const toggle = (id: string) => {
    const next = have.has(id) ? assigned.data!.storeIds.filter((x) => x !== id) : [...assigned.data!.storeIds, id];
    void run(() => api(`/api/admin/users/${user.id}/stores`, sendJson('PUT', { storeIds: next })), 'Không lưu được cửa hàng phụ trách.');
  };
  return (
    <div className="editor-section">
      <h3>Cửa hàng phụ trách</h3>
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      {stores.data.stores.length === 0 ? (
        <p className="muted">Chưa có cửa hàng nào.</p>
      ) : (
        <ul className="store-assign">
          {stores.data.stores.map((s) => (
            <li key={s.id}>
              <label className="check">
                <input type="checkbox" aria-label={`Gán ${s.name} cho ${user.email}`} checked={have.has(s.id)} disabled={pending} onChange={() => toggle(s.id)} />
                {s.name}
              </label>
            </li>
          ))}
        </ul>
      )}
      <small className="muted">Cửa hàng được gán hiện trong nhóm “Của bạn” ở đầu danh sách khi người này chọn cửa hàng; họ cũng tự ghim thêm được.</small>
    </div>
  );
}

function UserEditor({ user, teams, reload }: { user: User; teams: Team[]; reload: () => void }) {
  // Its own action state, so a failure here and one in the add form never show in each other's place.
  const { problem, pending, run } = useAction(reload);
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
          <button type="button" className="primary" disabled={pending || name.trim() === '' || email.trim() === ''} onClick={() => void patch({ name, email }, 'Không lưu được tên hoặc email.')}>
            Lưu tên, email
          </button>
        )}
        <div className="row">
          <label>
            Vai trò
            <select aria-label={`Vai trò của ${user.email}`} value={user.role} disabled={pending} onChange={(e) => void patch({ role: e.target.value }, 'Không đổi được vai trò.')}>
              <option value="member">Thành viên</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label>
            Nhóm
            <select aria-label={`Nhóm của ${user.email}`} value={user.teamId} disabled={pending} onChange={(e) => void patch({ teamId: e.target.value }, 'Không đổi được nhóm.')}>
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
        <label className="check">
          <input
            type="checkbox"
            aria-label={`Biên tập mẫu: ${user.email}`}
            checked={user.role === 'admin' || user.canEditTemplates}
            disabled={pending || user.role === 'admin'}
            onChange={(e) => void patch({ canEditTemplates: e.target.checked }, 'Không đổi được quyền biên tập mẫu.')}
          />
          Biên tập mẫu
        </label>
        <label className="check">
          <input type="checkbox" aria-label={`Tài khoản hệ thống: ${user.email}`} checked={user.system} disabled={pending} onChange={(e) => void patch({ system: e.target.checked }, 'Không đổi được nhóm hệ thống.')} />
          Tài khoản hệ thống
        </label>
        <label className="check">
          <input type="checkbox" aria-label={`Ngoài tổ chức Lark: ${user.email}`} checked={user.outsideLark} disabled={pending} onChange={(e) => void patch({ outsideLark: e.target.checked }, 'Không đổi được dấu ngoài tổ chức Lark.')} />
          Ngoài tổ chức Lark
        </label>
        <small className="muted">Không nhắc liên kết Lark; đăng nhập bằng email, Google hoặc passkey.</small>
        <small className="muted">Vai trò, nhóm và quyền biên tập mẫu lưu ngay khi chọn. Đổi nhóm chỉ áp dụng cho các job mới. Người biên tập mẫu sửa, thêm mẫu chuyển động và duyệt đề xuất ở trang Tạo video; Admin luôn có quyền này. Tài khoản hệ thống (dùng cho deploy, kiểm thử, demo) được xếp riêng ở cuối danh sách.</small>
      </div>
      <StoreAssign user={user} />
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
                  disabled={pending}
                  onClick={async () => {
                    const passkey = m.provider === 'passkey';
                    const yes = await confirmDialog({
                      title: passkey ? `Xoá ${methodText(m)} của ${user.email}?` : `Huỷ liên kết ${providerLabel(m.provider)} của ${user.email}?`,
                      body: 'Người này sẽ không đăng nhập bằng cách này được nữa.',
                      confirmLabel: passkey ? 'Xoá' : 'Huỷ liên kết',
                      danger: true,
                    });
                    if (yes) void run(() => api(`/api/admin/users/${user.id}/accounts/${m.id}`, { method: 'DELETE' }), 'Không huỷ được liên kết.');
                  }}
                >
                  {m.provider === 'passkey' ? 'Xoá' : 'Huỷ liên kết'}
                </button>
              )}
            </li>
          ))}
          {user.methods.length === 0 && <li className="muted">Chưa có cách đăng nhập nào.</li>}
          {user.twoFactor && (
            <li>
              <span>Xác thực 2 lớp (mã từ ứng dụng)</span>
              {/* For a lost phone; the user's sessions end with it. */}
              <button
                type="button"
                className="small danger"
                aria-label={`Tắt xác thực 2 lớp của ${user.email}`}
                disabled={pending}
                onClick={async () => {
                  const yes = await confirmDialog({ title: `Tắt xác thực 2 lớp của ${user.email}?`, body: 'Người này sẽ bị đăng xuất khỏi mọi thiết bị và chỉ cần mật khẩu để đăng nhập.', confirmLabel: 'Tắt xác thực 2 lớp', danger: true });
                  if (yes) void patch({ twoFactor: false }, 'Không tắt được xác thực 2 lớp.');
                }}
              >
                Tắt xác thực 2 lớp
              </button>
            </li>
          )}
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
                disabled={pending || password.trim() === ''}
                onClick={() => void patch({ temporaryPassword: password }, 'Không đặt được mật khẩu tạm.').then((ok) => ok && setPassword(null))}
              >
                Lưu mật khẩu
              </button>
              <button type="button" onClick={() => setPassword(null)}>
                Huỷ
              </button>
            </>
          )}
          <button
            type="button"
            className={user.banned ? undefined : 'danger'}
            disabled={pending}
            onClick={async () => {
              if (!user.banned && !(await confirmDialog({ title: `Khoá tài khoản ${user.email}?`, body: 'Người này sẽ không đăng nhập được cho đến khi được mở khoá.', confirmLabel: 'Khoá', danger: true }))) return;
              void patch({ banned: !user.banned }, user.banned ? 'Không mở khoá được.' : 'Không khoá được.');
            }}
          >
            {user.banned ? 'Mở khoá' : 'Khoá'}
          </button>
          <button
            type="button"
            className="danger"
            disabled={pending}
            onClick={async () => {
              if (!(await confirmDialog({ title: `Xoá tài khoản ${user.email}?`, body: 'Xoá hẳn người dùng này, không khôi phục được. Nếu họ đã tạo clip hoặc tải ảnh thì không xoá được — hãy dùng Khoá.', confirmLabel: 'Xoá', danger: true }))) return;
              void run(() => api(`/api/admin/users/${user.id}`, { method: 'DELETE' }), 'Không xoá được. Nếu người này đã tạo clip hoặc tải ảnh, hãy dùng Khoá.');
            }}
          >
            Xoá người dùng
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
        <span className="role" data-role={user.role}>{user.role === 'admin' ? 'Admin' : 'Thành viên'}</span>
        {user.role !== 'admin' && user.canEditTemplates && <span className="tag">Biên tập mẫu</span>}
        {user.outsideLark && <span className="tag">Ngoài Lark</span>}
      </td>
      <td data-label="Nhóm">{team}</td>
      <td data-label="Đăng nhập">
        <ul className="sign-ins">
          {user.methods.map((m) => (
            <li key={m.id} title={methodText(m)}>
              {m.provider === 'credential' ? 'Mật khẩu' : providerLabel(m.provider)}
            </li>
          ))}
          {user.twoFactor && (
            <li className="sign-in-2fa" title="Xác thực 2 lớp đang bật">
              2FA
            </li>
          )}
        </ul>
      </td>
      <td data-label="Trạng thái">
        <span className={user.banned ? 'status off' : 'status'}>{user.banned ? 'Đã khoá' : 'Hoạt động'}</span>
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

function UserTable({ users, teamName, onEdit }: { users: User[]; teamName: (id: string) => string; onEdit: (id: string) => void }) {
  return (
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
          {users.map((u) => (
            <UserRow key={u.id} user={u} team={teamName(u.teamId)} onEdit={() => onEdit(u.id)} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminUsers() {
  const users = useFetch<{ users: User[] }>('/api/admin/users');
  const teams = useFetch<{ teams: Team[] }>('/api/admin/teams?includeHidden=1');
  const { problem, pending, run } = useAction(users.reload);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [teamId, setTeamId] = useState('');
  const [role, setRole] = useState('member');
  const [outsideLark, setOutsideLark] = useState(false);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);

  const head = <PageHead id="users-title" title="Người dùng" lead="Tạo tài khoản cho nhân viên; bấm “Sửa” ở mỗi dòng để đổi tên, email, vai trò, nhóm, mật khẩu tạm hoặc khoá tài khoản." />;
  if (!users.data || !teams.data)
    return (
      <section aria-labelledby="users-title">
        {head}
        {users.failed || teams.failed ? <LoadError text="Không tải được danh sách người dùng." onRetry={() => (users.reload(), teams.reload())} /> : <p role="status">Đang tải...</p>}
      </section>
    );
  const allTeams = teams.data.teams;
  const visible = allTeams.filter((t) => !t.hidden);
  const teamName = (id: string) => allTeams.find((t) => t.id === id)?.name ?? '—';
  const shown = users.data.users.filter((u) => fold(`${u.name} ${u.email}`).includes(fold(query.trim())));
  const staff = shown.filter((u) => !u.system);
  const system = shown.filter((u) => u.system);
  const staffTotal = users.data.users.filter((u) => !u.system).length;
  const editUser = users.data.users.find((u) => u.id === editing);

  async function add() {
    const ok = await run(() => api('/api/admin/users', sendJson('POST', { email, name, teamId, role, outsideLark, ...(password ? { password } : {}) })), 'Không thêm được người dùng.');
    if (ok) {
      setEmail('');
      setName('');
      setPassword('');
      setOutsideLark(false);
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
              <option value="member">Thành viên</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label>
            Mật khẩu (không bắt buộc)
            <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label className="check">
            <input type="checkbox" checked={outsideLark} onChange={(e) => setOutsideLark(e.target.checked)} />
            Ngoài tổ chức Lark
          </label>
          <button type="button" className="primary" disabled={pending || !email.trim() || !name.trim() || !teamId} onClick={() => void add()}>
            Thêm người dùng
          </button>
        </div>
        <p className="muted">Dùng Gmail hoặc email công ty trên Lark của người đó. Không đặt mật khẩu thì chỉ đăng nhập được bằng Lark hoặc Google.</p>
        <p className="muted">Không nhắc liên kết Lark; đăng nhập bằng email, Google hoặc passkey.</p>
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
          {query.trim() ? `${staff.length} trên ${staffTotal} người dùng` : `${staffTotal} người dùng`}
        </p>
      </div>
      {shown.length === 0 ? (
        <Empty title={`Không có người dùng nào khớp “${query.trim()}”.`} />
      ) : (
        <>
          {staff.length > 0 && <UserTable users={staff} teamName={teamName} onEdit={setEditing} />}
          {system.length > 0 && (
            <details className="help system-users" open={query.trim() !== ''}>
              <summary>Tài khoản hệ thống ({system.length})</summary>
              <p className="muted">Dùng cho deploy, kiểm thử và demo. Không phải nhân viên; giữ lại để chạy tự động.</p>
              <UserTable users={system} teamName={teamName} onEdit={setEditing} />
            </details>
          )}
        </>
      )}
      <Modal open={editUser !== undefined} onClose={() => setEditing(null)} label={editUser ? `Sửa người dùng ${editUser.email}` : 'Sửa người dùng'} className="admin-modal">
        {editUser && <UserEditor key={editUser.id} user={editUser} teams={allTeams} reload={users.reload} />}
      </Modal>
    </section>
  );
}
