import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { Shell } from '@/components/Shell';
import { SmartRemakeGate } from '@/components/SmartRemakeGate';
import { reaAnalyzeEnabled } from '@/lib/analyze';
import { CHANGELOG } from '@/lib/changelog';
import { visibleEntries } from '@/lib/changelog-seen';
import { googleLoginEnabled, larkLoginEnabled, pool } from '@/lib/auth';
import { currentUser } from '@/lib/current-user';
import { FEEDBACK_UNREAD_COUNT } from '@/lib/feedback';
import { needsLarkPrompt } from '@/lib/lark-prompt';
import { smartRemakeAppEnabled } from '@/lib/remake';
import { loginFor } from '@/lib/return-to';
import { COLLAPSED_COOKIE } from '@/lib/sidebar';
import { userMethods } from '@/lib/user-methods';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  if (!user) redirect(loginFor((await headers()).get('x-cvs-path'))); // set by src/proxy.ts
  if (user.mustChangePassword) redirect('/account/password'); // an Admin's temporary password opens nothing else
  const { workspaceId } = user;
  if (!workspaceId)
    return (
      <main className="prose">
        <h1>Chưa có không gian làm việc</h1>
        <p>Tài khoản này chưa thuộc không gian làm việc nào đang hoạt động. Hãy nhờ người quản lý thêm bạn vào một không gian làm việc.</p>
      </main>
    );
  const isAdmin = user.role === 'admin';
  // The feedback item's badge: for an Admin the items still to triage in every workspace (docs/WORKSPACES.md: feedback reaches the company), for a member
  // the items of their workspace the Admin has changed since they last looked.
  const feedbackNew = (await (isAdmin ? pool.query(`select count(*)::int as n from feedback where status = 'new'`) : pool.query(FEEDBACK_UNREAD_COUNT, [user.id, workspaceId]))).rows[0].n;
  const [methods, profile] = await Promise.all([
    userMethods(pool, user.id),
    // Read here, not from the session, which may be cached from before an Admin moved the user to another team.
    pool.query(
      `select t.name as team, u.created_at, u.two_factor_enabled, u.avatar_color, (select count(*)::int from passkeys p where p.user_id = u.id) as passkeys from users u join teams t on t.id = u.team_id where u.id = $1`,
      [user.id],
    ),
  ]);
  const account = {
    email: user.email,
    isAdmin,
    team: profile.rows[0]?.team ?? null,
    memberSince: new Date(profile.rows[0]?.created_at ?? user.createdAt).toISOString(),
    passkeys: profile.rows[0]?.passkeys ?? 0,
    twoFactor: profile.rows[0]?.two_factor_enabled === true,
    avatarColor: profile.rows[0]?.avatar_color ?? null,
    methods: methods.get(user.id) ?? [],
    googleEnabled: googleLoginEnabled,
    larkEnabled: larkLoginEnabled,
    supportEmail: process.env.CVS_SUPPORT_EMAIL || null,
  };
  const larkPrompt = needsLarkPrompt({ larkEnabled: larkLoginEnabled, system: user.system === true, outsideLark: user.outsideLark === true, providers: account.methods.map((m) => m.provider) });
  return (
    <SmartRemakeGate enabled={smartRemakeAppEnabled()}>
      {/* The workspace this page rendered with: lib/api.ts sends it on every write (x-cvs-workspace). */}
      <meta name="cvs-workspace" content={workspaceId} />
      <Shell userId={user.id} userName={user.name} isAdmin={isAdmin} feedbackNew={feedbackNew} analyzeEnabled={reaAnalyzeEnabled()} account={account} larkPrompt={larkPrompt && !user.impersonatedBy} impersonating={user.impersonatedBy !== null} changelog={visibleEntries(CHANGELOG, isAdmin).slice(0, 10)} initialCollapsed={(await cookies()).get(COLLAPSED_COOKIE)?.value === '1'}>
        {children}
      </Shell>
    </SmartRemakeGate>
  );
}
