import { TryOn } from '@/components/TryOn';
import { refillFrom } from '@/lib/reuse';

export default async function TryOnPage({ searchParams }: { searchParams: Promise<{ reuse?: string; template?: string }> }) {
  const from = refillFrom(await searchParams);
  return <TryOn key={from} reuse={from} />;
}
