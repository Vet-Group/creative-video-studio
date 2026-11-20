import { TryOn } from '@/components/TryOn';
import { pool } from '@/lib/auth';
import { currentUser } from '@/lib/current-user';
import { usable, visibleFashionModels } from '@/lib/fashion-models';
import { exampleFrom, refillFrom } from '@/lib/reuse';

export default async function TryOnPage({ searchParams }: { searchParams: Promise<{ reuse?: string; template?: string; example?: string; model?: string | string[] }> }) {
  const q = await searchParams;
  const from = refillFrom(q) ?? exampleFrom(q);
  // A saved AI model for the Model slot (its use-in-Try-On link), by its picture: only one a Run may take, the member's own or a shared one of the active workspace.
  const user = typeof q.model === 'string' && !from ? await currentUser() : null;
  const saved = user?.workspaceId ? usable(await visibleFashionModels(pool, user, user.workspaceId)).find((m) => m.assetId === q.model) : undefined;
  const model = saved && { id: saved.assetId, filename: saved.name };
  return <TryOn key={from ?? model?.id} reuse={from} model={model} />;
}
