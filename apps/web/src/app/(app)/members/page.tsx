import { COMPANY_WORKSPACE_ID } from '@cvs/db';
import { WorkspaceMembers, WorkspaceName } from '@/components/WorkspaceMembers';
import { PageHead } from '@/components/admin/PageHead';
import { pool } from '@/lib/auth';
import { currentUser } from '@/lib/current-user';

// A partner workspace's owner manages its members here (docs/WORKSPACES.md phase 3). The company's staff stay on Admin > Users, so ws_vet has no such page;
// the /api/workspaces routes check the same again.
export default async function MembersPage() {
  const user = await currentUser();
  if (!user?.workspaceId || user.workspaceRole !== 'owner' || user.workspaceId === COMPANY_WORKSPACE_ID) {
    return (
      <section aria-labelledby="forbidden-title">
        <h1 id="forbidden-title">Không có quyền truy cập</h1>
        <p>Trang Thành viên chỉ dành cho chủ sở hữu của một không gian làm việc đối tác.</p>
      </section>
    );
  }
  const { name } = (await pool.query('select name from workspaces where id = $1', [user.workspaceId])).rows[0];
  return (
    <div className="admin">
      <section aria-labelledby="members-title">
        <PageHead id="members-title" title="Thành viên" lead={`Những người trong không gian ${name}. Chỉ họ thấy video, ảnh, mẫu và cửa hàng của không gian này.`} />
        <WorkspaceName id={user.workspaceId} name={name} />
        <WorkspaceMembers id={user.workspaceId} meId={user.id} />
      </section>
    </div>
  );
}
