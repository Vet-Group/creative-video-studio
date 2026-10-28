import { TryOn } from '@/components/TryOn';

export default async function TryOnPage({ searchParams }: { searchParams: Promise<{ reuse?: string }> }) {
  const { reuse } = await searchParams;
  return <TryOn key={reuse} reuse={typeof reuse === 'string' ? reuse : undefined} />;
}
