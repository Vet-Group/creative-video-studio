import { CreateForm } from '@/components/CreateForm';

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);

export default async function CreatePage({ searchParams }: { searchParams: Promise<{ reuse?: string; preset?: string | string[]; model?: string | string[] }> }) {
  const q = await searchParams;
  const reuse = one(q.reuse);
  // Keyed by the source job and the Explore choice, so following another link starts the form afresh.
  return <CreateForm key={[reuse, one(q.preset), one(q.model)].join('|')} reuse={reuse} preset={one(q.preset)} model={one(q.model)} />;
}
