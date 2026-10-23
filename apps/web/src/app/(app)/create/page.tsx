import { CreateForm } from '@/components/CreateForm';

export default async function CreatePage({ searchParams }: { searchParams: Promise<{ reuse?: string }> }) {
  const { reuse } = await searchParams;
  // Keyed by the source job, so following another Reuse link starts the form afresh.
  return <CreateForm key={reuse ?? 'new'} reuse={reuse} />;
}
