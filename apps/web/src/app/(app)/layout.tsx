import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { Shell } from '@/components/Shell';
import { reaAnalyzeEnabled } from '@/lib/analyze';
import { CHANGELOG } from '@/lib/changelog';
import { visibleEntries } from '@/lib/changelog-seen';
import { googleLoginEnabled, larkLoginEnabled, pool } from '@/lib/auth';
import { currentUser } from '@/lib/current-user';
import { needsLarkPrompt } from '@/lib/lark-prompt';
import { loginFor } from '@/lib/return-to';
import { COLLAPSED_COOKIE } from '@/lib/sidebar';
import { userMethods } from '@/lib/user-methods';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  if (!user) redirect(loginFor((await headers()).get('x-cvs-path'))); // set by src/proxy.ts
  if (user.mustChangePassword) redirect('/account/password'); // an Admin's temporary password opens nothing else
  const isAdmin = user.role === 'admin';
  const feedbackNew = isAdmin ? (await pool.query(`select count(*)::int as n from feedback where status = 'new'`)).rows[0].n : 0;
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
  const larkPrompt = needsLarkPrompt({ larkEnabled: larkLoginEnabled, system: user.system === true, providers: account.methods.map((m) => m.provider) });
  return (
    <Shell userId={user.id} userName={user.name} isAdmin={isAdmin} feedbackNew={feedbackNew} analyzeEnabled={reaAnalyzeEnabled()} account={account} larkPrompt={larkPrompt} changelog={visibleEntries(CHANGELOG, isAdmin).slice(0, 10)} initialCollapsed={(await cookies()).get(COLLAPSED_COOKIE)?.value === '1'}>
      {children}
    </Shell>
  );
}
