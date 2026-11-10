import { pool } from './auth';
import { currentUser } from './current-user';

/** The guided wizard is on by default for a member whose team lands on Marketing Studio (teams.default_tool); everyone else gets the full form. A member's own toggle (localStorage) overrides this on the client. */
export async function marketingWizardDefault(): Promise<boolean> {
  const user = await currentUser();
  if (!user) return false;
  const { rows } = await pool.query('select t.default_tool from users u join teams t on t.id = u.team_id where u.id = $1', [user.id]);
  return rows[0]?.default_tool === '/marketing-studio';
}
