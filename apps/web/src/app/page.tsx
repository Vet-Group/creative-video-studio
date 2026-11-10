import { redirect } from 'next/navigation';
import { pool } from '@/lib/auth';
import { currentUser } from '@/lib/current-user';

export default async function Home() {
  const user = await currentUser();
  if (!user) redirect('/login');
  // A team may land its members on a chosen tool (teams.default_tool); null keeps Create, as everyone had before.
  const { rows } = await pool.query('select t.default_tool from users u join teams t on t.id = u.team_id where u.id = $1', [user.id]);
  redirect(rows[0]?.default_tool ?? '/create');
}
