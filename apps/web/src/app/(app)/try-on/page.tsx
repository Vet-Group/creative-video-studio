import { TryOn } from '@/components/TryOn';
import { exampleFrom, refillFrom } from '@/lib/reuse';

export default async function TryOnPage({ searchParams }: { searchParams: Promise<{ reuse?: string; template?: string; example?: string }> }) {
  const q = await searchParams;
  const from = refillFrom(q) ?? exampleFrom(q);
  return <TryOn key={from} reuse={from} />;
}
