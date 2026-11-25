'use client';
import { Fragment, useState } from 'react';
import { LoadError } from '@/components/LoadError';
import { api, sendJson } from '@/lib/api';
import { useAction, useFetch } from '@/lib/admin-ui';
import { LANDINGS } from '@/lib/landing';
import { Empty, PageHead } from './PageHead';

interface Team {
  id: string;
  name: string;
  costCentreCode: string | null;
  hidden: boolean;
  /** Left out of the real-user figures on Costs and Usage (lib/real-users.ts), such as the engineering team. */
  excludedFromReports: boolean;
  defaultTool: string | null;
  /** A sales team (docs/BILLING.md): billed past its free monthly allowance, and its members run jobs only for its stores. */
  billable: boolean;
  freeMonthlyUsd: string;
  storeIds: string[];
}
interface CompanyStore {
  id: string;
  name: string;
  hidden: boolean;
  teamId: string | null;
}
type Run = ReturnType<typeof useAction>['run'];
const REPORTS_HELP = 'teams-reports-help';

/** The company stores a team owns, one checkbox each; a change saves at once. A store of another team moves to this one. */
function TeamStores({ team, stores, teams, run, pending }: { team: Team; stores: CompanyStore[]; teams: Team[]; run: Run; pending: boolean }) {
  const toggle = (id: string) => {
    const next = team.storeIds.includes(id) ? team.storeIds.filter((x) => x !== id) : [...team.storeIds, id];
    void run(() => api(`/api/admin/teams/${team.id}`, sendJson('PATCH', { storeIds: next })), 'Không lưu được cửa hàng của nhóm.');
  };
  if (stores.length === 0) return <p className="muted">Chưa có cửa hàng nào.</p>;
  return (
    <>
      <ul className="store-assign">
        {stores.map((s) => {
          const owner = s.teamId && s.teamId !== team.id ? teams.find((t) => t.id === s.teamId)?.name : undefined;
          return (
            <li key={s.id}>
              <label className="check">
                <input type="checkbox" aria-label={`Cửa hàng ${s.name} của nhóm ${team.name}`} checked={team.storeIds.includes(s.id)} disabled={pending} onChange={() => toggle(s.id)} />
                {s.name}
                {s.hidden && <span className="tag">Đã đóng</span>}
                {owner && <span className="muted">({owner})</span>}
              </label>
            </li>
          );
        })}
      </ul>
      <small className="muted">Mỗi cửa hàng thuộc một nhóm: chọn một cửa hàng đang thuộc nhóm khác thì cửa hàng chuyển sang nhóm này. Thành viên team bán hàng chỉ tạo được cho cửa hàng của team mình.</small>
    </>
  );
}

function TeamRow({ team, stores, teams, run, pending }: { team: Team; stores: CompanyStore[]; teams: Team[]; run: Run; pending: boolean }) {
  const [name, setName] = useState(team.name);
  const [code, setCode] = useState(team.costCentreCode ?? '');
  const [tool, setTool] = useState(team.defaultTool ?? '');
  const [billable, setBillable] = useState(team.billable);
  const [free, setFree] = useState(String(Number(team.freeMonthlyUsd)));
  const [open, setOpen] = useState(false);
  const patch = (body: Record<string, unknown>, fallback: string) => run(() => api(`/api/admin/teams/${team.id}`, sendJson('PATCH', body)), fallback);
  const freeOk = /^\d{1,8}(\.\d{1,4})?$/.test(free.trim());
  const storesId = `team-stores-${team.id}`;
  return (
    <Fragment>
      <tr>
        <td data-label="Tên nhóm">
          <input aria-label={`Tên nhóm ${team.name}`} value={name} onChange={(e) => setName(e.target.value)} />
          {team.hidden && <span className="tag">Đã ẩn</span>}
          {team.excludedFromReports && <span className="tag">Không tính báo cáo</span>}
        </td>
        <td data-label="Mã trung tâm chi phí">
          <input aria-label={`Mã trung tâm chi phí của ${team.name}`} value={code} onChange={(e) => setCode(e.target.value)} />
        </td>
        <td data-label="Trang mặc định">
          <select aria-label={`Trang mặc định của ${team.name}`} value={tool} onChange={(e) => setTool(e.target.value)}>
            <option value="">Tạo video (mặc định)</option>
            {Object.entries(LANDINGS).map(([href, label]) => (
              <option key={href} value={href}>
                {label}
              </option>
            ))}
          </select>
        </td>
        <td data-label="Tính phí">
          <div className="team-billing">
            <label className="check">
              <input type="checkbox" aria-label={`Nhóm ${team.name} là team bán hàng (tính phí)`} checked={billable} onChange={(e) => setBillable(e.target.checked)} />
              Team bán hàng (tính phí)
            </label>
            {billable && (
              <label>
                Miễn phí mỗi tháng (USD)
                <input inputMode="decimal" aria-label={`Miễn phí mỗi tháng của ${team.name} (USD)`} aria-invalid={!freeOk} value={free} onChange={(e) => setFree(e.target.value)} />
              </label>
            )}
          </div>
        </td>
        <td data-label="Báo cáo">
          <label className="check team-reports">
            <input
              type="checkbox"
              aria-label={`Không tính vào báo cáo: ${team.name}`}
              aria-describedby={REPORTS_HELP}
              checked={team.excludedFromReports}
              disabled={pending}
              onChange={(e) => void patch({ excludedFromReports: e.target.checked }, 'Không lưu được việc tính nhóm vào báo cáo.')}
            />
            Không tính vào báo cáo
          </label>
        </td>
        <td data-label="Cửa hàng">
          <button type="button" className="link-button" aria-expanded={open} aria-controls={open ? storesId : undefined} aria-label={`Cửa hàng của ${team.name}: ${team.storeIds.length}`} onClick={() => setOpen(!open)}>
            <span aria-hidden="true">{open ? '▾' : '▸'}</span> {team.storeIds.length} cửa hàng
          </button>
        </td>
        <td data-label="Thao tác">
          <div className="actions">
            <button
              type="button"
              disabled={pending || !name.trim() || (billable && !freeOk)}
              onClick={() => void patch({ name, costCentreCode: code.trim() || null, defaultTool: tool || null, billable, ...(billable && { freeMonthlyUsd: free.trim() }) }, 'Không lưu được nhóm.')}
            >
              Lưu
            </button>
            <button type="button" disabled={pending} onClick={() => void patch({ hidden: !team.hidden }, 'Không đổi được trạng thái ẩn.')}>
              {team.hidden ? 'Hiện lại' : 'Ẩn'}
            </button>
          </div>
        </td>
      </tr>
      {open && (
        <tr id={storesId} className="drill">
          <td colSpan={7}>
            <TeamStores team={team} stores={stores} teams={teams} run={run} pending={pending} />
          </td>
        </tr>
      )}
    </Fragment>
  );
}

export function AdminTeams() {
  const { data, failed, reload } = useFetch<{ teams: Team[]; stores: CompanyStore[] }>('/api/admin/teams?includeHidden=1');
  const { problem, pending, run } = useAction(reload);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  const head = <PageHead id="teams-title" title="Nhóm" lead="Mỗi người dùng thuộc một nhóm; chi phí được chia theo nhóm và mã trung tâm chi phí. Team bán hàng được miễn phí một khoản mỗi tháng, phần vượt tính cho team." />;
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
        <p className="muted">Nhóm không bao giờ bị xoá. Nhóm đã ẩn không còn được chọn cho người dùng mới; lịch sử chi phí giữ nguyên.</p>
      </fieldset>
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      <p id={REPORTS_HELP} className="muted">
        Không tính vào báo cáo: tài khoản của team này không tính vào số liệu người dùng thật ở Chi phí và Mức độ sử dụng (ví dụ team Kỹ thuật).
      </p>
      {data.teams.length === 0 ? (
        <Empty title="Chưa có nhóm nào">Tạo nhóm đầu tiên ở trên.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="mobile-records">
            <thead>
              <tr>
                <th scope="col">Tên nhóm</th>
                <th scope="col">Mã trung tâm chi phí</th>
                <th scope="col">Trang mặc định</th>
                <th scope="col">Tính phí</th>
                <th scope="col">Báo cáo</th>
                <th scope="col">Cửa hàng</th>
                <th scope="col">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {data.teams.map((t) => (
                <TeamRow key={t.id} team={t} stores={data.stores} teams={data.teams} run={run} pending={pending} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
