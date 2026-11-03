'use client';
import { useState } from 'react';
import { LoadError } from '@/components/LoadError';
import { api, sendJson } from '@/lib/api';
import { useAction, useFetch } from '@/lib/admin-ui';
import { Empty, PageHead } from './PageHead';

interface Team {
  id: string;
  name: string;
  costCentreCode: string | null;
  hidden: boolean;
}

function TeamRow({ team, run, pending }: { team: Team; run: ReturnType<typeof useAction>['run']; pending: boolean }) {
  const [name, setName] = useState(team.name);
  const [code, setCode] = useState(team.costCentreCode ?? '');
  const patch = (body: Record<string, unknown>, fallback: string) => run(() => api(`/api/admin/teams/${team.id}`, sendJson('PATCH', body)), fallback);
  return (
    <tr>
      <td data-label="Tên nhóm">
        <input aria-label={`Tên nhóm ${team.name}`} value={name} onChange={(e) => setName(e.target.value)} />
        {team.hidden && <span className="tag">Đã ẩn</span>}
      </td>
      <td data-label="Mã trung tâm chi phí">
        <input aria-label={`Mã trung tâm chi phí của ${team.name}`} value={code} onChange={(e) => setCode(e.target.value)} />
      </td>
      <td data-label="Thao tác">
        <div className="actions">
          <button type="button" disabled={pending || !name.trim()} onClick={() => void patch({ name, costCentreCode: code.trim() || null }, 'Không lưu được nhóm.')}>
            Lưu
          </button>
          <button type="button" disabled={pending} onClick={() => void patch({ hidden: !team.hidden }, 'Không đổi được trạng thái ẩn.')}>
            {team.hidden ? 'Hiện lại' : 'Ẩn'}
          </button>
        </div>
      </td>
    </tr>
  );
}

export function AdminTeams() {
  const { data, failed, reload } = useFetch<{ teams: Team[] }>('/api/admin/teams?includeHidden=1');
  const { problem, pending, run } = useAction(reload);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  const head = <PageHead id="teams-title" title="Nhóm" lead="Mỗi người dùng thuộc một nhóm; chi phí được chia theo nhóm và mã trung tâm chi phí." />;
  if (!data)
    return (
      <section aria-labelledby="teams-title">
        {head}
        {failed ? <LoadError text="Không tải được danh sách nhóm." onRetry={reload} /> : <p role="status">Đang tải...</p>}
      </section>
    );

  async function create() {
    const ok = await run(() => api('/api/admin/teams', sendJson('POST', { name, ...(code.trim() ? { costCentreCode: code } : {}) })), 'Không tạo được nhóm.');
    if (ok) {
      setName('');
      setCode('');
    }
  }

  return (
    <section aria-labelledby="teams-title">
      {head}
      <fieldset>
        <legend>Tạo nhóm</legend>
        <div className="row">
          <label>
            Tên nhóm
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Mã trung tâm chi phí (không bắt buộc)
            <input value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
          <button type="button" className="primary" disabled={pending || !name.trim()} onClick={() => void create()}>
            Tạo nhóm
          </button>
        </div>
        <p className="muted">Nhóm không bao giờ bị xóa. Nhóm đã ẩn không còn được chọn cho người dùng mới; lịch sử chi phí giữ nguyên.</p>
      </fieldset>
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      {data.teams.length === 0 ? (
        <Empty title="Chưa có nhóm nào">Tạo nhóm đầu tiên ở trên.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="mobile-records">
            <thead>
              <tr>
                <th scope="col">Tên nhóm</th>
                <th scope="col">Mã trung tâm chi phí</th>
                <th scope="col">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {data.teams.map((t) => (
                <TeamRow key={t.id} team={t} run={run} pending={pending} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
