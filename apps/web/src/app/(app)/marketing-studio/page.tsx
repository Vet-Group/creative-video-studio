import { MarketingStudio } from '@/components/MarketingStudio';
import { refillFrom } from '@/lib/reuse';

export default async function MarketingStudioPage({ searchParams }: { searchParams: Promise<{ reuse?: string; template?: string }> }) {
  const from = refillFrom(await searchParams);
  return <MarketingStudio key={from} reuse={from} />;
}
