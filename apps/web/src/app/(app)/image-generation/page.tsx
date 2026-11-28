import { COMPANY_WORKSPACE_ID } from '@cvs/db';
import { cookies, headers } from 'next/headers';
import { ImageGeneration } from '@/components/ImageGeneration';
import { pool } from '@/lib/auth';
import { currentUser } from '@/lib/current-user';
import { guessNarrow, NARROW_COOKIE } from '@/lib/narrow';
import { exampleFrom, refillFrom } from '@/lib/reuse';

export default async function ImageGenerationPage({ searchParams }: { searchParams: Promise<{ reuse?: string; template?: string; example?: string; model?: string }> }) {
  const q = await searchParams;
  const from = refillFrom(q) ?? exampleFrom(q);
  const model = typeof q.model === 'string' ? q.model : undefined;
  const narrow = guessNarrow((await cookies()).get(NARROW_COOKIE)?.value, (await headers()).get('user-agent'));
  // Whether the "free left" line will show (/api/me/limits sends it to a billing team's member in the company's workspace): the form holds its row from the first paint.
  const user = await currentUser();
  const freeLine =
    user?.workspaceId === COMPANY_WORKSPACE_ID &&
    (await pool.query('select 1 from users u join teams t on t.id = u.team_id where u.id = $1 and t.billable and t.free_monthly_usd > 0', [user.id])).rowCount === 1;
  return <ImageGeneration key={`${from ?? ''}|${model ?? ''}`} reuse={from} model={model} initialNarrow={narrow} freeLine={freeLine} />;
}
