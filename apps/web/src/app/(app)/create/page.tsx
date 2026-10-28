import { CreateForm } from '@/components/CreateForm';
import { exampleFrom, refillFrom } from '@/lib/reuse';

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);

export default async function CreatePage({ searchParams }: { searchParams: Promise<{ reuse?: string; template?: string; example?: string; preset?: string | string[]; model?: string | string[] }> }) {
  const q = await searchParams;
  const reuse = refillFrom(q) ?? exampleFrom(q);
  // Keyed by the refill source and the Explore choice, so following another link starts the form afresh.
  return <CreateForm key={[reuse, one(q.preset), one(q.model)].join('|')} reuse={reuse} preset={one(q.preset)} model={one(q.model)} />;
}
